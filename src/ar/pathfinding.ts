import type { NavigationGraph, NavigationNode, Neighbor } from '../lib/mapData';

/**
 * A* Pathfinding algorithm for graph-based indoor navigation.
 *
 * Features:
 * - Binary-heap priority queue for O(log n) operations
 * - Euclidean distance heuristic
 * - Loop protection via visited set
 * - Handles unreachable targets gracefully
 * - Multi-floor ready (edges can span floors)
 */

// ── Priority Queue (Min-Heap) ──────────────────────────────────

interface PQEntry {
    nodeId: string;
    priority: number;
}

class MinPriorityQueue {
    private heap: PQEntry[] = [];

    get size(): number {
        return this.heap.length;
    }

    enqueue(nodeId: string, priority: number): void {
        this.heap.push({ nodeId, priority });
        this.bubbleUp(this.heap.length - 1);
    }

    dequeue(): PQEntry | undefined {
        if (this.heap.length === 0) return undefined;
        const min = this.heap[0];
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.sinkDown(0);
        }
        return min;
    }

    private bubbleUp(idx: number): void {
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            if (this.heap[parentIdx].priority <= this.heap[idx].priority) break;
            [this.heap[parentIdx], this.heap[idx]] = [this.heap[idx], this.heap[parentIdx]];
            idx = parentIdx;
        }
    }

    private sinkDown(idx: number): void {
        const length = this.heap.length;
        while (true) {
            let smallest = idx;
            const left = 2 * idx + 1;
            const right = 2 * idx + 2;
            if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
                smallest = left;
            }
            if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
                smallest = right;
            }
            if (smallest === idx) break;
            [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
            idx = smallest;
        }
    }
}

// ── Heuristic ──────────────────────────────────────────────────

function euclideanDistance(a: NavigationNode, b: NavigationNode): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
}

// ── A* Algorithm ───────────────────────────────────────────────

export interface PathResult {
    /** Ordered waypoints from start to end (includes both) */
    waypoints: NavigationNode[];
    /** Total path distance in meters */
    totalDistance: number;
    /** Whether a valid path was found */
    found: boolean;
}

/**
 * Find the optimal path between two nodes using A*.
 *
 * @param graph - The navigation graph with nodes and adjacency list
 * @param startNodeId - ID of the starting node
 * @param endNodeId - ID of the destination node
 * @returns PathResult with waypoints array (empty if no path found)
 */
export function findPath(
    graph: NavigationGraph,
    startNodeId: string,
    endNodeId: string
): PathResult {
    const { nodes, adjacency } = graph;
    const startNode = nodes.get(startNodeId);
    const endNode = nodes.get(endNodeId);

    // Validate inputs
    if (!startNode || !endNode) {
        return { waypoints: [], totalDistance: 0, found: false };
    }

    if (startNodeId === endNodeId) {
        return { waypoints: [startNode], totalDistance: 0, found: true };
    }

    // A* data structures
    const openSet = new MinPriorityQueue();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const visited = new Set<string>();

    gScore.set(startNodeId, 0);
    openSet.enqueue(startNodeId, euclideanDistance(startNode, endNode));

    let iterations = 0;
    const maxIterations = nodes.size * 10; // Safety limit

    while (openSet.size > 0) {
        iterations++;
        if (iterations > maxIterations) {
            console.warn('[Pathfinding] Max iterations reached — aborting');
            return { waypoints: [], totalDistance: 0, found: false };
        }

        const current = openSet.dequeue()!;
        const currentId = current.nodeId;

        // Found the goal
        if (currentId === endNodeId) {
            return reconstructPath(cameFrom, nodes, startNodeId, endNodeId, gScore.get(endNodeId)!);
        }

        // Skip if already fully processed
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const neighbors = adjacency.get(currentId) || [];
        const currentG = gScore.get(currentId) ?? Infinity;

        for (const neighbor of neighbors) {
            if (visited.has(neighbor.nodeId)) continue;

            const tentativeG = currentG + neighbor.distance;
            const existingG = gScore.get(neighbor.nodeId) ?? Infinity;

            if (tentativeG < existingG) {
                cameFrom.set(neighbor.nodeId, currentId);
                gScore.set(neighbor.nodeId, tentativeG);

                const neighborNode = nodes.get(neighbor.nodeId)!;
                const fScore = tentativeG + euclideanDistance(neighborNode, endNode);
                openSet.enqueue(neighbor.nodeId, fScore);
            }
        }
    }

    // No path found
    return { waypoints: [], totalDistance: 0, found: false };
}

function reconstructPath(
    cameFrom: Map<string, string>,
    nodes: Map<string, NavigationNode>,
    startId: string,
    endId: string,
    totalDistance: number
): PathResult {
    const waypoints: NavigationNode[] = [];
    let current = endId;

    while (current !== startId) {
        waypoints.unshift(nodes.get(current)!);
        const prev = cameFrom.get(current);
        if (!prev) break; // Safety
        current = prev;
    }
    waypoints.unshift(nodes.get(startId)!);

    return { waypoints, totalDistance, found: true };
}

/**
 * Find the closest navigation node to an arbitrary (x, z) position.
 */
export function findClosestNode(
    nodes: Map<string, NavigationNode>,
    x: number,
    z: number
): NavigationNode | null {
    let closest: NavigationNode | null = null;
    let minDist = Infinity;

    for (const [, node] of nodes) {
        if (!node.walkable) continue;
        const dx = node.x - x;
        const dz = node.z - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < minDist) {
            minDist = d;
            closest = node;
        }
    }

    return closest;
}

/**
 * Calculate distance between two (x,z) points.
 */
export function distanceBetween(
    x1: number, z1: number,
    x2: number, z2: number
): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dz * dz);
}
