import { supabase } from './supabaseClient';

export interface Section {
    id: string;
    name: string;
    node_id: string;
    icon: string | null;
    // We optionally include coordinates for backwards compatibility or easy access
    x?: number;
    z?: number;
}

// Fallback data matching the new schema structure
// Node IDs must match the fallback nodes in mapData.ts
const FALLBACK_SECTIONS: Section[] = [
    { id: 's1', name: 'Billing', node_id: 'n016', icon: '💳', x: 4, z: 2 },
    { id: 's2', name: 'Electronics', node_id: 'n011', icon: '📱', x: 8, z: 6 },
    { id: 's3', name: 'Groceries', node_id: 'n007', icon: '🛒', x: -8, z: 6 },
    { id: 's4', name: 'Clothing', node_id: 'n013', icon: '👕', x: 8, z: 10 },
];

export async function fetchSections(): Promise<Section[]> {
    if (!supabase) {
        console.info('[AR Nav] Supabase not configured — using fallback sections');
        return FALLBACK_SECTIONS;
    }

    try {
        // We join with navigation_nodes to get x,z for convenience
        const { data, error } = await supabase
            .from('sections')
            .select(`
                id,
                name,
                node_id,
                icon,
                navigation_nodes (
                    x,
                    z
                )
            `)
            .order('name');

        if (error) {
            console.error('[AR Nav] Supabase fetch error:', error.message);
            return FALLBACK_SECTIONS;
        }

        interface SectionRow {
            id: string;
            name: string;
            node_id: string;
            icon: string | null;
            navigation_nodes: { x: number; z: number } | null;
        }

        return (data as unknown as SectionRow[]).map((item) => ({
            id: item.id,
            name: item.name,
            node_id: item.node_id,
            icon: item.icon,
            x: item.navigation_nodes?.x,
            z: item.navigation_nodes?.z,
        }));
    } catch (err) {
        console.error('[AR Nav] Failed to fetch sections:', err);
        return FALLBACK_SECTIONS;
    }
}

/**
 * Fetch sections for a specific store (uses the published version).
 */
export async function fetchSectionsForStore(storeId: string): Promise<Section[]> {
    if (!supabase) {
        return FALLBACK_SECTIONS;
    }

    try {
        const { data: version, error: vError } = await supabase
            .from('store_versions')
            .select('id')
            .eq('store_id', storeId)
            .eq('is_published', true)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

        if (vError || !version) {
            return FALLBACK_SECTIONS;
        }

        const { data: floors, error: fError } = await supabase
            .from('floors')
            .select('id')
            .eq('store_version_id', version.id);

        if (fError || !floors || floors.length === 0) {
            return FALLBACK_SECTIONS;
        }

        const floorIds = floors.map((f: { id: string }) => f.id);

        const { data, error } = await supabase
            .from('sections')
            .select(`
                id,
                name,
                node_id,
                icon,
                navigation_nodes (
                    x,
                    z
                )
            `)
            .in('floor_id', floorIds)
            .order('name');

        if (error || !data) {
            return FALLBACK_SECTIONS;
        }

        interface StoreSectionRow {
            id: string;
            name: string;
            node_id: string;
            icon: string | null;
            navigation_nodes: { x: number; z: number } | null;
        }

        return (data as unknown as StoreSectionRow[]).map((item) => ({
            id: item.id,
            name: item.name,
            node_id: item.node_id,
            icon: item.icon,
            x: item.navigation_nodes?.x,
            z: item.navigation_nodes?.z,
        }));
    } catch (err) {
        console.error('[AR Nav] Failed to fetch store sections:', err);
        return FALLBACK_SECTIONS;
    }
}

export function getSectionById(
    sections: Section[],
    id: string
): Section | undefined {
    return sections.find((s) => s.id === id);
}
