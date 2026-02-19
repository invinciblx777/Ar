/**
 * Simple navigation math for AR arrow direction
 */

export interface Position {
    x: number;
    z: number;
}

/**
 * Calculate the angle (in radians) from current position to target position.
 * Returns the angle around the Y-axis for rotating the arrow.
 */
export function getDirectionAngle(
    current: Position,
    target: Position
): number {
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    return Math.atan2(dx, dz);
}

/**
 * Calculate the distance between two positions in meters.
 */
export function getDistanceToTarget(
    current: Position,
    target: Position
): number {
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Format distance for display (e.g., "3.2m" or "Arrived!")
 */
export function formatDistance(distance: number): string {
    if (distance < 0.5) return 'Arrived!';
    return `${distance.toFixed(1)}m away`;
}
