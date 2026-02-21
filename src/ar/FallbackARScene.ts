import * as THREE from 'three';
import { WaypointRenderer } from './WaypointRenderer';
import { CoordinateMapper } from './coordinateMapper';
import { NavigationEngine, type NavigationState, type NavigationEvent } from './navigationEngine';
import type { NavigationGraph } from '../lib/mapData';
import type { ARSceneConfig } from './ARScene'; // Reuse the config interface

/**
 * Fallback AR scene for devices without WebXR (e.g. iOS Safari).
 *
 * Usage:
 * - Renders rear camera feed via getUserMedia to a <video> element
 * - Renders Three.js scene transparently on top
 * - Functionality is limited: 3DOF only (orientation tracking via device compass)
 * - User position is assumed fixed at the start node (or QR anchor)
 * - Navigation updates rely on user manually scanning QR codes to update position
 */
export class FallbackARScene {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private config: ARSceneConfig;
    private clock: THREE.Clock;
    private disposed = false;

    private videoElement: HTMLVideoElement | null = null;
    private mediaStream: MediaStream | null = null;
    private deviceHeading = 0;
    private animationFrameId: number | null = null;

    // Navigation
    private navEngine: NavigationEngine;
    private coordMapper: CoordinateMapper;
    private waypointRenderer: WaypointRenderer;
    private contentGroup: THREE.Group; // Group to rotate based on compass

    constructor(
        private container: HTMLElement,
        config: ARSceneConfig
    ) {
        this.config = config;
        this.clock = new THREE.Clock();

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '2';
        container.appendChild(this.renderer.domElement);

        // Create scene
        this.scene = new THREE.Scene();

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.01,
            100
        );
        this.camera.position.set(0, 1.6, 0); // Assume eye level ~1.6m

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 5, 5);
        this.scene.add(directionalLight);

        // Content group for compass rotation
        this.contentGroup = new THREE.Group();
        this.scene.add(this.contentGroup);

        // Init navigation
        this.navEngine = new NavigationEngine();
        this.coordMapper = new CoordinateMapper();
        // Pass contentGroup so waypoints rotate with compass heading
        this.waypointRenderer = new WaypointRenderer(this.contentGroup);

        // Start pathfinding
        const success = this.navEngine.initialize(
            config.graph,
            config.startNodeId,
            config.targetSectionId
        );

        if (!success) {
            config.onError?.('No path found.');
        }

        // Handle resize
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Start the fallback AR experience.
     */
    async start(): Promise<void> {
        try {
            await this.startCamera();
        } catch (err) {
            const msg =
                err instanceof DOMException && err.name === 'NotAllowedError'
                    ? 'Camera permission denied.'
                    : 'Could not access camera.';
            this.config.onError?.(msg);
            return;
        }

        try {
            await this.requestOrientationPermission();
        } catch {
            console.warn('[AR Nav] Device orientation not available');
        }

        this.setupOrientationListener();

        // Calibrate coordinate mapper (assume user is at start node, facing North initially?)
        // In fallback, we assume map (0,0) is where we are? No.
        // We assume we are AT the start node.
        const startNode = this.config.graph.nodes.get(this.config.startNodeId);
        if (startNode) {
            this.coordMapper.calibrate(startNode, { x: 0, y: 0, z: 0 });
            this.refreshWaypoints();
        }

        this.renderLoop();
    }

    /**
     * Update start node after QR scan
     */
    recalibrateFromNode(nodeId: string): void {
        const node = this.config.graph.nodes.get(nodeId);
        if (!node) return;

        // Reset user to this node
        this.navEngine.setStartNode(nodeId);
        this.coordMapper.calibrate(node, { x: 0, y: 0, z: 0 });
        this.refreshWaypoints();
    }

    private refreshWaypoints(): void {
        const path = this.navEngine.getFullPath();
        // Since we don't track position, we just show the full path from start
        // or from current "assumed" position.
        // The engine updates position based on map coordinates.
        // We will feed the engine our *assumed* map coordinates (which is just the start node location).

        const userMapPos = this.coordMapper.arToMap(0, 0); // We are always at 0,0 AR
        const navState = this.navEngine.updatePosition(userMapPos.x, userMapPos.z);

        this.config.onStateUpdate?.(navState);
        this.config.onDistanceUpdate?.(navState.remainingDistance);

        this.waypointRenderer.renderPath(
            navState.remainingWaypoints,
            (node) => this.coordMapper.nodeToAR(node),
            0
        );
    }

    private async startCamera(): Promise<void> {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });

        this.mediaStream = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.muted = true;
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.zIndex = '1';

        this.container.appendChild(video);
        this.videoElement = video;

        await video.play();
    }

    private async requestOrientationPermission(): Promise<void> {
        const DevOrientEvent = DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<string>;
        };
        if (typeof DevOrientEvent.requestPermission === 'function') {
            const permission = await DevOrientEvent.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Motion permission denied');
            }
        }
    }

    private setupOrientationListener(): void {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (this.disposed) return;
            const compassHeading = event.webkitCompassHeading;

            if (compassHeading !== undefined && compassHeading !== null) {
                // iOS: 0=North, clockwise
                this.deviceHeading = (compassHeading * Math.PI) / 180;
            } else if (event.alpha !== null) {
                // Android: 0=North, counter-clockwise usually
                this.deviceHeading = ((360 - (event.alpha ?? 0)) * Math.PI) / 180;
            }
        };
        window.addEventListener('deviceorientation', handleOrientation, true);
        this._orientationCleanup = () => {
            window.removeEventListener('deviceorientation', handleOrientation, true);
        };
    }

    private _orientationCleanup: (() => void) | null = null;

    private renderLoop = (): void => {
        if (this.disposed) return;
        this.animationFrameId = requestAnimationFrame(this.renderLoop);

        const elapsed = this.clock.getElapsedTime();

        // Update correct heading
        // If content is aligned with North = -Z (standard Three.js logic often uses -Z as forward)
        // Adjust based on your map coordinates.
        // Assuming map +Z is North????
        // Let's assume Map coordinates: X=East, Z=South (common in graphics, Z grows forward).
        // If device heading is 0 (North), looking at North should show objects at North.
        // If map +Z is South, then North is -Z.
        // If deviceHeading is 0, we look at -Z.
        // So we rotate the world by -deviceHeading?
        // Needs tuning, but typically:
        this.contentGroup.rotation.y = -this.deviceHeading;

        // Animate waypoints
        this.waypointRenderer.animate(elapsed);

        // Update lead arrow
        const navState = this.navEngine.updatePosition(
            this.coordMapper.arToMap(0, 0).x,
            this.coordMapper.arToMap(0, 0).z
        );
        if (navState.remainingWaypoints.length > 0) {
            const nextWp = navState.remainingWaypoints[0];
            const nextAR = this.coordMapper.nodeToAR(nextWp);
            // We use relative position (0,0,0) for camera
            this.waypointRenderer.updateLeadArrow(
                { x: 0, y: 0, z: 0 },
                nextAR,
                elapsed
            );
        }

        this.renderer.render(this.scene, this.camera);
    };

    private handleResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    async dispose(): Promise<void> {
        this.disposed = true;
        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
        this._orientationCleanup?.();
        if (this.mediaStream) this.mediaStream.getTracks().forEach((track) => track.stop());
        if (this.videoElement?.parentElement) this.videoElement.parentElement.removeChild(this.videoElement);
        window.removeEventListener('resize', this.handleResize);

        this.waypointRenderer.dispose();
        this.navEngine.dispose();
        this.coordMapper.reset();

        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
