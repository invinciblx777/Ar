import type { NavigationNode } from '../lib/mapData';

/**
 * Coordinate mapping between map space and AR world space.
 *
 * Conventions:
 * - Map space: X = left/right, Z = forward/back (meters from reference origin)
 * - AR space:  X = AR X, Z = AR Z, Y = 0 (floor plane)
 * - Scale: 1 meter = 1 unit (consistent in both spaces)
 *
 * Calibration:
 * - When XR session starts, we calibrate by setting the world origin
 *   relative to a known anchor node (entrance or QR anchor point).
 * - The offset accounts for where the user physically starts in AR space
 *   vs. where that point maps to in map space.
 */

export interface MapPosition {
    x: number;
    z: number;
}

export interface ARPosition {
    x: number;
    y: number;
    z: number;
}

export class CoordinateMapper {
    /** Offset from AR origin to map origin: map = AR + offset */
    private offsetX = 0;
    private offsetZ = 0;
    private calibrated = false;

    /**
     * Whether the mapper has been calibrated.
     */
    get isCalibrated(): boolean {
        return this.calibrated;
    }

    /**
     * Calibrate the coordinate system.
     *
     * This sets the relationship between a known map position (the anchor node)
     * and the current AR camera position. After calibration, all conversions
     * use this offset.
     *
     * @param anchorNode - The known position in map space (e.g., entrance node)
     * @param arPosition - The current AR camera position when at that anchor
     */
    calibrate(anchorNode: NavigationNode, arPosition: ARPosition): void {
        // offset = mapPosition - arPosition
        // So: mapPosition = arPosition + offset
        this.offsetX = anchorNode.x - arPosition.x;
        this.offsetZ = anchorNode.z - arPosition.z;
        this.calibrated = true;
    }

    /**
     * Calibrate using raw map coordinates instead of a node.
     */
    calibrateWithPosition(mapX: number, mapZ: number, arPosition: ARPosition): void {
        this.offsetX = mapX - arPosition.x;
        this.offsetZ = mapZ - arPosition.z;
        this.calibrated = true;
    }

    /**
     * Re-calibrate from a QR anchor scan.
     * Called when user scans a QR code at a known position.
     */
    recalibrateFromQR(anchorNode: NavigationNode, arPosition: ARPosition): void {
        this.calibrate(anchorNode, arPosition);
    }

    /**
     * Convert map space coordinates to AR world space.
     */
    mapToAR(mapX: number, mapZ: number): ARPosition {
        return {
            x: mapX - this.offsetX,
            y: 0, // Floor plane
            z: mapZ - this.offsetZ,
        };
    }

    /**
     * Convert a navigation node to AR world space.
     */
    nodeToAR(node: NavigationNode): ARPosition {
        return this.mapToAR(node.x, node.z);
    }

    /**
     * Convert AR world space position to map space.
     */
    arToMap(arX: number, arZ: number): MapPosition {
        return {
            x: arX + this.offsetX,
            z: arZ + this.offsetZ,
        };
    }

    /**
     * Get current calibration offset (for debug display).
     */
    getOffset(): { x: number; z: number } {
        return { x: this.offsetX, z: this.offsetZ };
    }

    /**
     * Reset calibration.
     */
    reset(): void {
        this.offsetX = 0;
        this.offsetZ = 0;
        this.calibrated = false;
    }
}
