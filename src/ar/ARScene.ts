import * as THREE from 'three';
import { WaypointRenderer } from './WaypointRenderer';
import { CoordinateMapper } from './coordinateMapper';
import { NavigationEngine, type NavigationState, type NavigationEvent } from './navigationEngine';
import type { NavigationGraph, NavigationNode } from '../lib/mapData';

export interface ARSceneConfig {
    /** ID of the target section to navigate to */
    targetSectionId: string;
    /** Navigation graph data */
    graph: NavigationGraph;
    /** Starting node ID (entrance or QR anchor) */
    startNodeId: string;
    /** Callbacks */
    onSessionEnd?: () => void;
    onError?: (message: string) => void;
    onDistanceUpdate?: (distance: number) => void;
    onNavigationEvent?: (event: NavigationEvent) => void;
    onStateUpdate?: (state: NavigationState) => void;
}

/**
 * Core AR Scene manager — handles Three.js renderer, WebXR session,
 * waypoint-based navigation rendering, and real-time position updates.
 */
export class ARScene {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private config: ARSceneConfig;
    private xrSession: XRSession | null = null;
    private clock: THREE.Clock;
    private disposed = false;

    // Navigation system
    private navEngine: NavigationEngine;
    private coordMapper: CoordinateMapper;
    private waypointRenderer: WaypointRenderer;
    private calibrated = false;
    private lastRenderedWaypointCount = -1;

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
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 5, 5);
        this.scene.add(directionalLight);

        // Initialize navigation systems
        this.navEngine = new NavigationEngine();
        this.coordMapper = new CoordinateMapper();
        this.waypointRenderer = new WaypointRenderer(this.scene);

        // Listen for navigation events
        this.navEngine.addEventListener((event: NavigationEvent) => {
            this.config.onNavigationEvent?.(event);

            if (event.type === 'pathRecalculated') {
                this.refreshWaypoints();
            }
        });

        // Initialize pathfinding
        const success = this.navEngine.initialize(
            config.graph,
            config.startNodeId,
            config.targetSectionId
        );

        if (!success) {
            config.onError?.('No path found to destination. Please try a different section.');
        }

        // Handle resize
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Start the WebXR immersive-ar session.
     */
    async start(): Promise<void> {
        if (!navigator.xr) {
            this.config.onError?.('WebXR not available');
            return;
        }

        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!supported) {
                this.config.onError?.('Immersive AR not supported on this device');
                return;
            }

            // Request immersive-ar session
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: this.container.parentElement
                    ? { root: this.container.parentElement }
                    : undefined,
            });

            this.xrSession = session;

            session.addEventListener('end', () => {
                this.xrSession = null;
                this.config.onSessionEnd?.();
            });

            await this.renderer.xr.setSession(session);

            // Start render loop
            this.renderer.setAnimationLoop(this.renderFrame);
        } catch (err) {
            const message =
                err instanceof DOMException && err.name === 'NotAllowedError'
                    ? 'Camera permission denied. Please allow camera access for AR.'
                    : 'Failed to start AR session. Please try again.';
            this.config.onError?.(message);
        }
    }

    /**
     * Get the current camera position in AR space.
     * Used for QR recalibration from external callers.
     */
    getCameraPosition(): { x: number; z: number } {
        return { x: this.camera.position.x, z: this.camera.position.z };
    }

    /**
     * Update the start node (e.g. after QR scan) and recalibrate.
     * If no currentARPosition is provided, uses the current camera position.
     */
    recalibrateFromNode(nodeId: string, currentARPosition?: { x: number; z: number }): void {
        const node = this.config.graph.nodes.get(nodeId);
        if (!node) return;

        const arPos = currentARPosition ?? this.getCameraPosition();
        this.coordMapper.recalibrateFromQR(node, { x: arPos.x, y: 0, z: arPos.z });
        this.navEngine.setStartNode(nodeId);
        this.refreshWaypoints();
    }

    /**
     * Render loop — called each frame during the XR session.
     */
    private renderFrame = (_time: number, frame?: XRFrame): void => {
        if (this.disposed) return;

        const elapsed = this.clock.getElapsedTime();

        if (frame) {
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const pose = frame.getViewerPose(referenceSpace!);

            if (pose) {
                const viewerPosition = pose.transform.position;
                const cameraX = viewerPosition.x;
                const cameraZ = viewerPosition.z;

                // Calibrate on first valid pose
                if (!this.calibrated) {
                    const entranceNode = this.config.graph.nodes.get(this.config.startNodeId);
                    if (entranceNode) {
                        this.coordMapper.calibrate(entranceNode, { x: cameraX, y: 0, z: cameraZ });
                        this.calibrated = true;
                        this.refreshWaypoints();
                    }
                }

                if (this.calibrated) {
                    // Convert AR position to map space
                    const mapPos = this.coordMapper.arToMap(cameraX, cameraZ);

                    // Update navigation engine
                    const navState = this.navEngine.updatePosition(mapPos.x, mapPos.z);
                    this.config.onStateUpdate?.(navState);

                    // Update distance display
                    this.config.onDistanceUpdate?.(navState.remainingDistance);

                    // Update waypoint rendering
                    if (navState.remainingWaypoints.length !== this.lastRenderedWaypointCount) {
                        this.refreshWaypoints();
                        this.lastRenderedWaypointCount = navState.remainingWaypoints.length;
                    }

                    this.waypointRenderer.setActiveWaypoint(0); // First remaining is always "next"

                    // Update lead arrow
                    if (navState.remainingWaypoints.length > 0) {
                        const nextWp = navState.remainingWaypoints[0];
                        const nextAR = this.coordMapper.nodeToAR(nextWp);
                        this.waypointRenderer.updateLeadArrow(
                            { x: cameraX, y: 0, z: cameraZ },
                            nextAR,
                            elapsed
                        );
                    }
                }
            }
        }

        // Animate waypoint markers
        this.waypointRenderer.animate(elapsed);

        this.renderer.render(this.scene, this.camera);
    };

    /**
     * Refresh waypoint markers based on current navigation state.
     */
    private refreshWaypoints(): void {
        const userPos = this.navEngine.getUserPosition();
        const navState = this.navEngine.updatePosition(userPos.x, userPos.z);

        this.waypointRenderer.renderPath(
            navState.remainingWaypoints,
            (node: NavigationNode) => this.coordMapper.nodeToAR(node),
            0
        );
    }

    /**
     * Handle window resize.
     */
    private handleResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    /**
     * End the XR session and clean up.
     */
    async dispose(): Promise<void> {
        this.disposed = true;
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this.handleResize);

        // Dispose navigation systems
        this.waypointRenderer.dispose();
        this.navEngine.dispose();
        this.coordMapper.reset();

        if (this.xrSession) {
            try {
                await this.xrSession.end();
            } catch {
                // Session may already be ended
            }
        }

        // Clean up Three.js resources
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach((m) => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        this.renderer.dispose();

        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(
                this.renderer.domElement
            );
        }
    }
}
