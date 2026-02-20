import { supabase } from './supabaseClient';

// ── Types ──────────────────────────────────────────────────────

export interface NavigationNode {
    id: string;
    x: number;
    z: number;
    floor_id: string;
    walkable: boolean;
    label: string | null;
    type?: 'normal' | 'entrance' | 'section';
}

export interface NavigationEdge {
    id: string;
    from_node: string;
    to_node: string;
    distance: number;
}

export interface StoreSection {
    id: string;
    name: string;
    node_id: string;
    icon: string | null;
}

export interface Floor {
    id: string;
    name: string;
    level_number: number;
}

/** Adjacency list entry */
export interface Neighbor {
    nodeId: string;
    distance: number;
}

/** Complete navigation graph with adjacency list */
export interface NavigationGraph {
    nodes: Map<string, NavigationNode>;
    edges: NavigationEdge[];
    adjacency: Map<string, Neighbor[]>;
    sections: StoreSection[];
    floors: Floor[];
    entranceNodeId: string;
}

// ── Fallback data ──────────────────────────────────────────────

const FALLBACK_FLOOR_ID = 'f0000000-0000-0000-0000-000000000001';

const FALLBACK_NODES: NavigationNode[] = [
    { id: 'n001', x: 0, z: 0, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Entrance', type: 'entrance' },
    { id: 'n002', x: 0, z: 3, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Main Aisle Start', type: 'normal' },
    { id: 'n003', x: 0, z: 6, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Main Junction 1', type: 'normal' },
    { id: 'n004', x: 0, z: 10, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Main Junction 2', type: 'normal' },
    { id: 'n005', x: 0, z: 14, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Back Wall', type: 'normal' },
    { id: 'n006', x: -4, z: 6, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Left Aisle 1', type: 'normal' },
    { id: 'n007', x: -8, z: 6, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Groceries', type: 'section' },
    { id: 'n008', x: -4, z: 10, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Left Aisle 2', type: 'normal' },
    { id: 'n009', x: -8, z: 10, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Fresh Produce', type: 'normal' },
    { id: 'n010', x: 4, z: 6, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Right Aisle 1', type: 'normal' },
    { id: 'n011', x: 8, z: 6, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Electronics', type: 'section' },
    { id: 'n012', x: 4, z: 10, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Right Aisle 2', type: 'normal' },
    { id: 'n013', x: 8, z: 10, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Clothing', type: 'section' },
    { id: 'n014', x: -4, z: 14, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Back Left', type: 'normal' },
    { id: 'n015', x: 4, z: 14, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Back Right', type: 'normal' },
    { id: 'n016', x: 4, z: 2, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Billing', type: 'section' },
    { id: 'n017', x: 4, z: 3, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Right Near Entrance', type: 'normal' },
    { id: 'n018', x: -4, z: 3, floor_id: FALLBACK_FLOOR_ID, walkable: true, label: 'Left Near Entrance', type: 'normal' },
];

function dist(a: NavigationNode, b: NavigationNode): number {
    return Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
}

function makeEdge(fromId: string, toId: string, nodes: NavigationNode[]): NavigationEdge[] {
    const from = nodes.find(n => n.id === fromId)!;
    const to = nodes.find(n => n.id === toId)!;
    const d = dist(from, to);
    return [
        { id: `${fromId}-${toId}`, from_node: fromId, to_node: toId, distance: d },
        { id: `${toId}-${fromId}`, from_node: toId, to_node: fromId, distance: d },
    ];
}

function buildFallbackEdges(): NavigationEdge[] {
    const edges: NavigationEdge[] = [];
    const pairs: [string, string][] = [
        ['n001', 'n002'], ['n002', 'n003'], ['n003', 'n004'], ['n004', 'n005'],
        ['n003', 'n006'], ['n006', 'n007'], ['n004', 'n008'], ['n008', 'n009'],
        ['n006', 'n008'], ['n007', 'n009'],
        ['n003', 'n010'], ['n010', 'n011'], ['n004', 'n012'], ['n012', 'n013'],
        ['n010', 'n012'], ['n011', 'n013'],
        ['n005', 'n014'], ['n005', 'n015'], ['n008', 'n014'], ['n012', 'n015'],
        ['n002', 'n017'], ['n017', 'n016'], ['n002', 'n018'],
    ];
    for (const [a, b] of pairs) {
        edges.push(...makeEdge(a, b, FALLBACK_NODES));
    }
    return edges;
}

const FALLBACK_SECTIONS: StoreSection[] = [
    { id: 's1', name: 'Billing', node_id: 'n016', icon: '💳' },
    { id: 's2', name: 'Electronics', node_id: 'n011', icon: '📱' },
    { id: 's3', name: 'Groceries', node_id: 'n007', icon: '🛒' },
    { id: 's4', name: 'Clothing', node_id: 'n013', icon: '👕' },
];

const FALLBACK_FLOORS: Floor[] = [
    { id: FALLBACK_FLOOR_ID, name: 'Ground Floor', level_number: 0 },
];

// ── Graph builder ──────────────────────────────────────────────

function buildAdjacency(
    nodes: Map<string, NavigationNode>,
    edges: NavigationEdge[]
): Map<string, Neighbor[]> {
    const adj = new Map<string, Neighbor[]>();
    for (const [id] of nodes) {
        adj.set(id, []);
    }
    for (const edge of edges) {
        if (!nodes.has(edge.from_node) || !nodes.has(edge.to_node)) continue;
        const fromNode = nodes.get(edge.from_node)!;
        const toNode = nodes.get(edge.to_node)!;
        if (!fromNode.walkable || !toNode.walkable) continue;
        adj.get(edge.from_node)!.push({ nodeId: edge.to_node, distance: edge.distance });
    }
    return adj;
}

function findEntranceNode(nodes: Map<string, NavigationNode>): string {
    // 1. Prefer node with type === 'entrance'
    for (const [id, node] of nodes) {
        if (node.type === 'entrance') return id;
    }
    // 2. Fallback: node labeled 'Entrance'
    for (const [id, node] of nodes) {
        if (node.label?.toLowerCase() === 'entrance') return id;
    }
    // 3. Fallback: node closest to (0,0)
    let bestId = '';
    let bestDist = Infinity;
    for (const [id, node] of nodes) {
        const d = Math.sqrt(node.x * node.x + node.z * node.z);
        if (d < bestDist) {
            bestDist = d;
            bestId = id;
        }
    }
    return bestId;
}

function buildGraph(
    rawNodes: NavigationNode[],
    rawEdges: NavigationEdge[],
    rawSections: StoreSection[],
    rawFloors: Floor[]
): NavigationGraph {
    const nodes = new Map<string, NavigationNode>();
    for (const n of rawNodes) {
        nodes.set(n.id, n);
    }
    const adjacency = buildAdjacency(nodes, rawEdges);
    const entranceNodeId = findEntranceNode(nodes);
    return { nodes, edges: rawEdges, adjacency, sections: rawSections, floors: rawFloors, entranceNodeId };
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Fetch the navigation graph for a specific store (uses published version).
 * This is the primary function for AR navigation.
 */
export async function fetchNavigationGraphForStore(storeId: string): Promise<NavigationGraph> {
    if (!supabase) {
        console.info('[AR Nav] Supabase not configured — using fallback graph');
        return buildFallbackGraph();
    }

    try {
        // Get published version for this store
        const { data: version, error: vError } = await supabase
            .from('store_versions')
            .select('id')
            .eq('store_id', storeId)
            .eq('is_published', true)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

        if (vError || !version) {
            console.error('[AR Nav] No published version found for store', storeId);
            return buildFallbackGraph();
        }

        return fetchNavigationGraphForVersion(version.id);
    } catch (err) {
        console.error('[AR Nav] Failed to fetch store graph:', err);
        return buildFallbackGraph();
    }
}

/**
 * Fetch the navigation graph for a specific version (used by admin map builder).
 */
export async function fetchNavigationGraphForVersion(versionId: string): Promise<NavigationGraph> {
    if (!supabase) {
        return buildFallbackGraph();
    }

    try {
        // Get floors for this version
        const { data: floors, error: fError } = await supabase
            .from('floors')
            .select('*')
            .eq('store_version_id', versionId)
            .order('level_number');

        if (fError || !floors || floors.length === 0) {
            console.error('[AR Nav] No floors found for version', versionId);
            return buildFallbackGraph();
        }

        const floorIds = floors.map((f: { id: string }) => f.id);

        // Fetch nodes, edges, sections for these floors
        const [nodesRes, edgesRes, sectionsRes] = await Promise.all([
            supabase.from('navigation_nodes').select('*').in('floor_id', floorIds),
            supabase.from('navigation_edges').select('*').in('floor_id', floorIds),
            supabase.from('sections').select('*').in('floor_id', floorIds).order('name'),
        ]);

        if (nodesRes.error || edgesRes.error || sectionsRes.error) {
            console.error('[AR Nav] Fetch error for version', versionId);
            return buildFallbackGraph();
        }

        return buildGraph(
            nodesRes.data as NavigationNode[],
            edgesRes.data as NavigationEdge[],
            sectionsRes.data as StoreSection[],
            floors as Floor[]
        );
    } catch (err) {
        console.error('[AR Nav] Failed to fetch version graph:', err);
        return buildFallbackGraph();
    }
}

/**
 * Legacy: fetch all navigation data (no store/version filtering).
 * Kept for backward compatibility.
 */
export async function fetchNavigationGraph(): Promise<NavigationGraph> {
    if (!supabase) {
        console.info('[AR Nav] Supabase not configured — using fallback graph');
        return buildFallbackGraph();
    }

    try {
        const [nodesRes, edgesRes, sectionsRes, floorsRes] = await Promise.all([
            supabase.from('navigation_nodes').select('*'),
            supabase.from('navigation_edges').select('*'),
            supabase.from('sections').select('*').order('name'),
            supabase.from('floors').select('*').order('level_number'),
        ]);

        if (nodesRes.error || edgesRes.error || sectionsRes.error || floorsRes.error) {
            console.error('[AR Nav] Supabase fetch error, using fallback');
            return buildFallbackGraph();
        }

        return buildGraph(
            nodesRes.data as NavigationNode[],
            edgesRes.data as NavigationEdge[],
            sectionsRes.data as StoreSection[],
            floorsRes.data as Floor[]
        );
    } catch (err) {
        console.error('[AR Nav] Failed to fetch navigation graph:', err);
        return buildFallbackGraph();
    }
}

function buildFallbackGraph(): NavigationGraph {
    const nodes = new Map<string, NavigationNode>();
    for (const n of FALLBACK_NODES) {
        nodes.set(n.id, n);
    }
    const edges = buildFallbackEdges();
    const adjacency = buildAdjacency(nodes, edges);
    return {
        nodes,
        edges,
        adjacency,
        sections: FALLBACK_SECTIONS,
        floors: FALLBACK_FLOORS,
        entranceNodeId: 'n001',
    };
}
