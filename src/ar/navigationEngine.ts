import type { NavigationGraph, NavigationNode, StoreSection } from '../lib/mapData';
import { findPath, findClosestNode, distanceBetween, type PathResult } from './pathfinding';

/**
 * High-level navigation controller.
 *
 * Manages the lifecycle of a navigation session:
 * - Computes initial A* path
 * - Tracks user position against waypoints
 * - Detects deviation from path → auto-recalculates
 * - Marks waypoints as passed
 * - Fires events for UI updates
 */

// ── Types ──────────────────────────────────────────────────────

export interface NavigationState {
    /** Current path waypoints (remaining, not yet passed) */
    remainingWaypoints: NavigationNode[];
    /** Index of the next waypoint the user is heading toward */
    nextWaypointIndex: number;
    /** Total waypoints in original path */
    totalWaypoints: number;
    /** Distance to next waypoint in meters */
    distanceToNext: number;
    /** Total remaining distance to destination */
    remainingDistance: number;
    /** Whether user has arrived at destination */
    arrived: boolean;
    /** Whether path was recalculated this frame */
    recalculated: boolean;
    /** Current closest node to user */
    closestNode: NavigationNode | null;
    /** Current user position in map space */
    userPosition: { x: number; z: number };
}

export interface NavigationEngineConfig {
    /** Distance threshold to mark a waypoint as passed (meters) */
    waypointReachThreshold: number;
    /** Distance threshold to trigger path recalculation (meters) */
    deviationThreshold: number;
    /** Minimum interval between recalculations (ms) */
    recalcCooldown: number;
}

export type NavigationEventType =
    | 'pathCalculated'
    | 'pathRecalculated'
    | 'waypointReached'
    | 'arrived'
    | 'noPath';

export interface NavigationEvent {
    type: NavigationEventType;
    waypointIndex?: number;
    totalWaypoints?: number;
    path?: NavigationNode[];
}

type NavigationEventCallback = (event: NavigationEvent) => void;

// ── Default config ─────────────────────────────────────────────

const DEFAULT_CONFIG: NavigationEngineConfig = {
    waypointReachThreshold: 1.0,   // 1m to mark waypoint as passed
    deviationThreshold: 1.5,       // 1.5m off-path triggers recalculation
    recalcCooldown: 2000,          // 2 second cooldown between recalcs
};

// ── Navigation Engine ──────────────────────────────────────────

export class NavigationEngine {
    private graph: NavigationGraph | null = null;
    private targetSection: StoreSection | null = null;
    private targetNodeId: string = '';
    private startNodeId: string = '';

    private fullPath: NavigationNode[] = [];
    private currentWaypointIndex = 0;
    private config: NavigationEngineConfig;

    private lastRecalcTime = 0;
    private listeners: NavigationEventCallback[] = [];

    private userMapX = 0;
    private userMapZ = 0;

    constructor(config?: Partial<NavigationEngineConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ── Event system ─────────────────────────────────────────────

    addEventListener(callback: NavigationEventCallback): void {
        this.listeners.push(callback);
    }

    removeEventListener(callback: NavigationEventCallback): void {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    private emit(event: NavigationEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    // ── Initialization ───────────────────────────────────────────

    /**
     * Initialize the navigation engine with a graph and compute initial path.
     *
     * @param graph - The navigation graph
     * @param startNodeId - Where the user starts (entrance or QR anchor)
     * @param targetSectionId - Which section to navigate to
     * @returns Whether initialization succeeded
     */
    initialize(
        graph: NavigationGraph,
        startNodeId: string,
        targetSectionId: string
    ): boolean {
        this.graph = graph;
        this.startNodeId = startNodeId;

        // Find target section
        const section = graph.sections.find(s => s.id === targetSectionId);
        if (!section) {
            console.error('[NavEngine] Section not found:', targetSectionId);
            this.emit({ type: 'noPath' });
            return false;
        }

        this.targetSection = section;
        this.targetNodeId = section.node_id;

        // Compute initial path
        return this.calculatePath(startNodeId);
    }

    /**
     * Calculate (or recalculate) path from a given start node.
     */
    private calculatePath(fromNodeId: string): boolean {
        if (!this.graph) return false;

        const result: PathResult = findPath(this.graph, fromNodeId, this.targetNodeId);

        if (!result.found || result.waypoints.length === 0) {
            console.error('[NavEngine] No path found');
            this.emit({ type: 'noPath' });
            return false;
        }

        this.fullPath = result.waypoints;
        this.currentWaypointIndex = 0;

        return true;
    }

    // ── Real-time updates ────────────────────────────────────────

    /**
     * Update user position (in map space) and return current navigation state.
     * Call this every frame with the converted AR camera position.
     *
     * @param mapX - User X position in map space (meters)
     * @param mapZ - User Z position in map space (meters)
     * @returns Current navigation state
     */
    updatePosition(mapX: number, mapZ: number): NavigationState {
        this.userMapX = mapX;
        this.userMapZ = mapZ;

        if (!this.graph || this.fullPath.length === 0) {
            return this.emptyState();
        }

        let recalculated = false;

        // 1. Check if we've reached the next waypoint
        this.advanceWaypoints(mapX, mapZ);

        // 2. Check if arrived at destination
        if (this.currentWaypointIndex >= this.fullPath.length) {
            this.emit({ type: 'arrived' });
            return {
                remainingWaypoints: [],
                nextWaypointIndex: this.fullPath.length,
                totalWaypoints: this.fullPath.length,
                distanceToNext: 0,
                remainingDistance: 0,
                arrived: true,
                recalculated: false,
                closestNode: this.fullPath[this.fullPath.length - 1],
                userPosition: { x: mapX, z: mapZ },
            };
        }

        // 3. Check deviation from path
        const deviation = this.calculateDeviation(mapX, mapZ);
        if (deviation > this.config.deviationThreshold) {
            recalculated = this.tryRecalculate(mapX, mapZ);
        }

        // 4. Build current state
        const nextWaypoint = this.fullPath[this.currentWaypointIndex];
        const distToNext = distanceBetween(mapX, mapZ, nextWaypoint.x, nextWaypoint.z);
        const remaining = this.calculateRemainingDistance(mapX, mapZ);
        const closestNode = findClosestNode(this.graph.nodes, mapX, mapZ);

        return {
            remainingWaypoints: this.fullPath.slice(this.currentWaypointIndex),
            nextWaypointIndex: this.currentWaypointIndex,
            totalWaypoints: this.fullPath.length,
            distanceToNext: distToNext,
            remainingDistance: remaining,
            arrived: false,
            recalculated,
            closestNode,
            userPosition: { x: mapX, z: mapZ },
        };
    }

    // ── Waypoint advancement ─────────────────────────────────────

    private advanceWaypoints(mapX: number, mapZ: number): void {
        while (this.currentWaypointIndex < this.fullPath.length) {
            const wp = this.fullPath[this.currentWaypointIndex];
            const dist = distanceBetween(mapX, mapZ, wp.x, wp.z);

            if (dist <= this.config.waypointReachThreshold) {
                this.emit({
                    type: 'waypointReached',
                    waypointIndex: this.currentWaypointIndex,
                    totalWaypoints: this.fullPath.length,
                });
                this.currentWaypointIndex++;
            } else {
                break;
            }
        }
    }

    // ── Deviation detection ──────────────────────────────────────

    private calculateDeviation(mapX: number, mapZ: number): number {
        if (this.currentWaypointIndex >= this.fullPath.length) return 0;

        // Distance from user to the line between current waypoint and next
        // Simplified: just use distance to next waypoint minus expected distance
        const nextWp = this.fullPath[this.currentWaypointIndex];
        const distToNext = distanceBetween(mapX, mapZ, nextWp.x, nextWp.z);

        // If user is close to any path waypoint, deviation is low
        let minDistToPath = distToNext;
        for (let i = this.currentWaypointIndex; i < Math.min(this.currentWaypointIndex + 3, this.fullPath.length); i++) {
            const wp = this.fullPath[i];
            const d = distanceBetween(mapX, mapZ, wp.x, wp.z);
            minDistToPath = Math.min(minDistToPath, d);
        }

        // Also check distance to edge segments (point-to-line-segment)
        if (this.currentWaypointIndex > 0) {
            const prevWp = this.fullPath[this.currentWaypointIndex - 1];
            const d = pointToSegmentDistance(
                mapX, mapZ,
                prevWp.x, prevWp.z,
                nextWp.x, nextWp.z
            );
            minDistToPath = Math.min(minDistToPath, d);
        }

        return minDistToPath;
    }

    // ── Route recalculation ──────────────────────────────────────

    private tryRecalculate(mapX: number, mapZ: number): boolean {
        const now = Date.now();
        if (now - this.lastRecalcTime < this.config.recalcCooldown) {
            return false; // Cooldown active
        }

        if (!this.graph) return false;

        // Find closest walkable node to current position
        const closest = findClosestNode(this.graph.nodes, mapX, mapZ);
        if (!closest) return false;

        const prevPath = [...this.fullPath];
        const success = this.calculatePath(closest.id);

        if (success) {
            this.lastRecalcTime = now;
            this.emit({
                type: 'pathRecalculated',
                path: this.fullPath,
                totalWaypoints: this.fullPath.length,
            });
            return true;
        } else {
            // Restore previous path if recalculation fails
            this.fullPath = prevPath;
            return false;
        }
    }

    // ── Distance calculation ─────────────────────────────────────

    private calculateRemainingDistance(mapX: number, mapZ: number): number {
        if (this.currentWaypointIndex >= this.fullPath.length) return 0;

        // Distance from user to next waypoint
        let total = distanceBetween(
            mapX, mapZ,
            this.fullPath[this.currentWaypointIndex].x,
            this.fullPath[this.currentWaypointIndex].z
        );

        // Add distances between remaining waypoints
        for (let i = this.currentWaypointIndex; i < this.fullPath.length - 1; i++) {
            total += distanceBetween(
                this.fullPath[i].x, this.fullPath[i].z,
                this.fullPath[i + 1].x, this.fullPath[i + 1].z
            );
        }

        return total;
    }

    // ── Public getters ───────────────────────────────────────────

    /** Get the full computed path */
    getFullPath(): NavigationNode[] {
        return [...this.fullPath];
    }

    /** Get current user position in map space */
    getUserPosition(): { x: number; z: number } {
        return { x: this.userMapX, z: this.userMapZ };
    }

    /** Get the target section */
    getTargetSection(): StoreSection | null {
        return this.targetSection;
    }

    /** Get the entrance/start node ID */
    getStartNodeId(): string {
        return this.startNodeId;
    }

    /** Update start node (e.g., after QR scan) and recalculate */
    setStartNode(nodeId: string): boolean {
        this.startNodeId = nodeId;
        return this.calculatePath(nodeId);
    }

    /** Recalculate from current position */
    forceRecalculate(): boolean {
        if (!this.graph) return false;
        const closest = findClosestNode(this.graph.nodes, this.userMapX, this.userMapZ);
        if (!closest) return false;
        return this.calculatePath(closest.id);
    }

    // ── Cleanup ──────────────────────────────────────────────────

    dispose(): void {
        this.listeners = [];
        this.fullPath = [];
        this.graph = null;
        this.targetSection = null;
    }

    // ── Private helpers ──────────────────────────────────────────

    private emptyState(): NavigationState {
        return {
            remainingWaypoints: [],
            nextWaypointIndex: 0,
            totalWaypoints: 0,
            distanceToNext: 0,
            remainingDistance: 0,
            arrived: false,
            recalculated: false,
            closestNode: null,
            userPosition: { x: this.userMapX, z: this.userMapZ },
        };
    }
}

// ── Geometry helpers ───────────────────────────────────────────

/** Point-to-line-segment distance */
function pointToSegmentDistance(
    px: number, pz: number,
    ax: number, az: number,
    bx: number, bz: number
): number {
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;

    const ab2 = abx * abx + abz * abz;
    if (ab2 === 0) {
        return Math.sqrt(apx * apx + apz * apz);
    }

    let t = (apx * abx + apz * abz) / ab2;
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * abx;
    const closestZ = az + t * abz;

    const dx = px - closestX;
    const dz = pz - closestZ;
    return Math.sqrt(dx * dx + dz * dz);
}
