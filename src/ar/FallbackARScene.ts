import * as THREE from 'three';
import { createArrowModel, animateArrow } from './ArrowModel';
import { getDirectionAngle, getDistanceToTarget } from '../utils/navigation';
import type { ARSceneConfig } from './ARScene';

/**
 * Fallback AR scene for iOS Safari and browsers without WebXR immersive-ar.
 *
 * Uses:
 * - getUserMedia for rear camera feed (rendered as <video> background)
 * - Three.js with alpha:true overlaid on top
 * - DeviceOrientationEvent for compass heading → arrow rotation
 *
 * The arrow is placed in the center of the screen, rotated to point
 * toward the target section based on device compass heading.
 */
export class FallbackARScene {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private arrow: THREE.Group | null = null;
    private config: ARSceneConfig;
    private clock: THREE.Clock;
    private disposed = false;

    private videoElement: HTMLVideoElement | null = null;
    private mediaStream: MediaStream | null = null;
    private deviceHeading = 0;
    private animationFrameId: number | null = null;

    constructor(
        private container: HTMLElement,
        config: ARSceneConfig
    ) {
        this.config = config;
        this.clock = new THREE.Clock();

        // Create renderer (transparent so camera video shows behind)
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
        this.camera.position.set(0, 1.5, 3);
        this.camera.lookAt(0, 0, 0);

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 5, 5);
        this.scene.add(directionalLight);

        // Handle resize
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Start the fallback AR experience.
     */
    async start(): Promise<void> {
        // Step 1: Request camera
        try {
            await this.startCamera();
        } catch (err) {
            const msg =
                err instanceof DOMException && err.name === 'NotAllowedError'
                    ? 'Camera permission denied. Please allow camera access for AR.'
                    : 'Could not access camera. Please ensure camera permissions are granted.';
            this.config.onError?.(msg);
            return;
        }

        // Step 2: Request device orientation (iOS 13+ requires explicit permission)
        try {
            await this.requestOrientationPermission();
        } catch {
            // Orientation may not be available — arrow will still show, just won't rotate with compass
            console.warn('[AR Nav] Device orientation not available');
        }

        // Step 3: Set up orientation listener
        this.setupOrientationListener();

        // Step 4: Create arrow
        this.arrow = createArrowModel();
        // Scale up slightly for visibility in camera overlay
        this.arrow.scale.set(1.5, 1.5, 1.5);
        this.arrow.position.set(0, -0.3, 0);
        this.scene.add(this.arrow);

        // Step 5: Start render loop
        this.renderLoop();
    }

    /**
     * Start the rear camera feed.
     */
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

    /**
     * Request DeviceOrientation permission (required on iOS 13+).
     */
    private async requestOrientationPermission(): Promise<void> {
        // TypeScript doesn't have requestPermission in its types
        const DevOrientEvent = DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<string>;
        };

        if (typeof DevOrientEvent.requestPermission === 'function') {
            const permission = await DevOrientEvent.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Motion permission denied');
            }
        }
        // On Android/other browsers, no permission request needed
    }

    /**
     * Listen for device orientation events to get compass heading.
     */
    private setupOrientationListener(): void {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (this.disposed) return;

            // webkitCompassHeading for iOS Safari, alpha for others
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const compassHeading = (event as any).webkitCompassHeading;

            if (compassHeading !== undefined && compassHeading !== null) {
                // iOS: webkitCompassHeading is 0-360, 0=North, clockwise
                this.deviceHeading = (compassHeading * Math.PI) / 180;
            } else if (event.alpha !== null) {
                // Android/other: alpha is 0-360, 0=North, counterclockwise
                this.deviceHeading = ((360 - (event.alpha ?? 0)) * Math.PI) / 180;
            }
        };

        window.addEventListener('deviceorientation', handleOrientation, true);

        // Store cleanup reference
        this._orientationCleanup = () => {
            window.removeEventListener('deviceorientation', handleOrientation, true);
        };
    }

    private _orientationCleanup: (() => void) | null = null;

    /**
     * Main render loop (non-XR, uses requestAnimationFrame).
     */
    private renderLoop = (): void => {
        if (this.disposed) return;

        this.animationFrameId = requestAnimationFrame(this.renderLoop);

        if (!this.arrow) return;

        const elapsed = this.clock.getElapsedTime();

        // Animate arrow floating/pulse
        animateArrow(this.arrow, elapsed);

        // Fix the Y position after animateArrow modifies it
        this.arrow.position.y = -0.3 + Math.sin(elapsed * 2) * 0.05;

        // Calculate direction from entrance (0,0) to target
        const targetAngle = getDirectionAngle(
            { x: 0, z: 0 },
            { x: this.config.targetX, z: this.config.targetZ }
        );

        // Rotate arrow: target direction minus device heading
        // This makes the arrow point correctly regardless of which way the phone faces
        this.arrow.rotation.y = targetAngle - this.deviceHeading;

        // Calculate and report distance (from entrance to target)
        const distance = getDistanceToTarget(
            { x: 0, z: 0 },
            { x: this.config.targetX, z: this.config.targetZ }
        );
        this.config.onDistanceUpdate?.(distance);

        this.renderer.render(this.scene, this.camera);
    };

    /**
     * Handle window resize.
     */
    private handleResize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    /**
     * Clean up everything.
     */
    async dispose(): Promise<void> {
        this.disposed = true;

        // Stop render loop
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Stop orientation listener
        this._orientationCleanup?.();

        // Stop camera stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
        }

        // Remove video element
        if (this.videoElement && this.videoElement.parentElement) {
            this.videoElement.parentElement.removeChild(this.videoElement);
        }

        // Remove resize listener
        window.removeEventListener('resize', this.handleResize);

        // Dispose Three.js resources
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
