import * as THREE from 'three';
import { createArrowModel, animateArrow } from './ArrowModel';
import { getDirectionAngle } from '../utils/navigation';

export interface ARSceneConfig {
    targetX: number;
    targetZ: number;
    onSessionEnd?: () => void;
    onError?: (message: string) => void;
    onDistanceUpdate?: (distance: number) => void;
}

/**
 * Core AR Scene manager — handles Three.js renderer, WebXR session,
 * arrow placement, and real-time direction updates.
 */
export class ARScene {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private arrow: THREE.Group | null = null;
    private config: ARSceneConfig;
    private xrSession: XRSession | null = null;
    private clock: THREE.Clock;
    private disposed = false;

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

            // Create and add arrow
            this.arrow = createArrowModel();
            this.arrow.position.set(0, -0.5, -2); // Start 2m ahead, on floor
            this.scene.add(this.arrow);

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
     * Render loop — called each frame during the XR session.
     */
    private renderFrame = (_time: number, frame?: XRFrame): void => {
        if (this.disposed || !this.arrow) return;

        const elapsed = this.clock.getElapsedTime();

        // Animate arrow (floating + pulse)
        animateArrow(this.arrow, elapsed);

        if (frame) {
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const pose = frame.getViewerPose(referenceSpace!);

            if (pose) {
                const viewerPosition = pose.transform.position;

                // Current camera position on the floor plane
                const cameraX = viewerPosition.x;
                const cameraZ = viewerPosition.z;

                // Calculate direction to target
                const angle = getDirectionAngle(
                    { x: cameraX, z: cameraZ },
                    { x: this.config.targetX, z: this.config.targetZ }
                );

                // Position arrow 2m ahead of camera on the floor
                this.arrow.position.set(
                    cameraX + Math.sin(angle) * 2,
                    -0.5, // Floor level
                    cameraZ + Math.cos(angle) * 2
                );

                // Rotate arrow to point toward target
                this.arrow.rotation.y = angle;

                // Calculate distance
                const dx = this.config.targetX - cameraX;
                const dz = this.config.targetZ - cameraZ;
                const distance = Math.sqrt(dx * dx + dz * dz);
                this.config.onDistanceUpdate?.(distance);
            }
        }

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
     * End the XR session and clean up.
     */
    async dispose(): Promise<void> {
        this.disposed = true;
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this.handleResize);

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
