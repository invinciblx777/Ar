/**
 * QR Code scanner for re-anchoring user position.
 *
 * Uses getUserMedia for camera access and jsQR for decoding.
 * Expected QR data format: JSON with node_id field.
 * Example: {"node_id": "n0000000-0000-0000-0000-000000000001"}
 */

// Dynamic import for jsQR to avoid SSR issues
async function loadJsQR(): Promise<typeof import('jsqr').default> {
    const mod = await import('jsqr');
    return mod.default;
}

export interface QRScanResult {
    nodeId: string;
    raw: string;
}

export class QRScanner {
    private videoElement: HTMLVideoElement | null = null;
    private canvasElement: HTMLCanvasElement | null = null;
    private canvasCtx: CanvasRenderingContext2D | null = null;
    private mediaStream: MediaStream | null = null;
    private scanning = false;
    private animationFrameId: number | null = null;
    private jsQR: typeof import('jsqr').default | null = null;

    /**
     * Start scanning for QR codes.
     *
     * @param container - DOM element to append the video preview
     * @param onResult - Callback when a valid QR code is scanned
     * @param onError - Callback for errors
     */
    async startScanning(
        container: HTMLElement,
        onResult: (result: QRScanResult) => void,
        onError?: (error: string) => void
    ): Promise<void> {
        if (this.scanning) return;

        try {
            // Load jsQR dynamically
            this.jsQR = await loadJsQR();
        } catch {
            onError?.('QR scanner library failed to load');
            return;
        }

        try {
            // Request camera access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            });
        } catch (err) {
            const msg =
                err instanceof DOMException && err.name === 'NotAllowedError'
                    ? 'Camera permission denied for QR scanning.'
                    : 'Could not access camera for QR scanning.';
            onError?.(msg);
            return;
        }

        // Create video element
        this.videoElement = document.createElement('video');
        this.videoElement.srcObject = this.mediaStream;
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.setAttribute('autoplay', 'true');
        this.videoElement.muted = true;
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.top = '50%';
        this.videoElement.style.left = '50%';
        this.videoElement.style.transform = 'translate(-50%, -50%)';
        this.videoElement.style.width = '300px';
        this.videoElement.style.height = '300px';
        this.videoElement.style.objectFit = 'cover';
        this.videoElement.style.borderRadius = '16px';
        this.videoElement.style.border = '2px solid rgba(0, 240, 255, 0.5)';
        this.videoElement.style.zIndex = '100';
        container.appendChild(this.videoElement);

        // Create offscreen canvas for QR processing
        this.canvasElement = document.createElement('canvas');
        this.canvasElement.width = 640;
        this.canvasElement.height = 480;
        this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });

        await this.videoElement.play();
        this.scanning = true;

        // Start scan loop
        this.scanLoop(onResult, onError);
    }

    /**
     * Scan loop — runs each animation frame.
     */
    private scanLoop(
        onResult: (result: QRScanResult) => void,
        onError?: (error: string) => void
    ): void {
        if (!this.scanning || !this.videoElement || !this.canvasCtx || !this.jsQR) return;

        this.animationFrameId = requestAnimationFrame(() => this.scanLoop(onResult, onError));

        if (this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) return;

        // Draw video frame to canvas
        this.canvasCtx.drawImage(
            this.videoElement,
            0, 0,
            this.canvasElement!.width,
            this.canvasElement!.height
        );

        // Get image data for QR decoding
        const imageData = this.canvasCtx.getImageData(
            0, 0,
            this.canvasElement!.width,
            this.canvasElement!.height
        );

        // Attempt QR decode
        const code = this.jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
            try {
                const parsed = JSON.parse(code.data);
                if (parsed.node_id && typeof parsed.node_id === 'string') {
                    this.stopScanning();
                    onResult({ nodeId: parsed.node_id, raw: code.data });
                } else {
                    // Valid QR but wrong format — ignore, keep scanning
                }
            } catch {
                // Not valid JSON — try plain node_id string
                const trimmed = code.data.trim();
                if (trimmed.startsWith('n') || trimmed.includes('-')) {
                    this.stopScanning();
                    onResult({ nodeId: trimmed, raw: code.data });
                }
                // Otherwise ignore and keep scanning
            }
        }
    }

    /**
     * Stop scanning and clean up resources.
     */
    stopScanning(): void {
        this.scanning = false;

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.videoElement && this.videoElement.parentElement) {
            this.videoElement.parentElement.removeChild(this.videoElement);
            this.videoElement = null;
        }

        this.canvasElement = null;
        this.canvasCtx = null;
        this.jsQR = null;
    }

    /**
     * Whether the scanner is currently active.
     */
    get isScanning(): boolean {
        return this.scanning;
    }
}
