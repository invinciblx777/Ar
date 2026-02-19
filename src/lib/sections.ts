import { supabase } from './supabase';

export interface Section {
    id: string;
    name: string;
    x: number;
    z: number;
}

// Fallback sections when Supabase is not configured
const FALLBACK_SECTIONS: Section[] = [
    { id: '1', name: 'Billing', x: 0, z: 8 },
    { id: '2', name: 'Electronics', x: 6, z: 4 },
    { id: '3', name: 'Groceries', x: -5, z: 6 },
    { id: '4', name: 'Clothing', x: 4, z: -3 },
];

export async function fetchSections(): Promise<Section[]> {
    if (!supabase) {
        console.info('[AR Nav] Supabase not configured — using fallback sections');
        return FALLBACK_SECTIONS;
    }

    try {
        const { data, error } = await supabase
            .from('sections')
            .select('id, name, x, z')
            .order('name');

        if (error) {
            console.error('[AR Nav] Supabase fetch error:', error.message);
            return FALLBACK_SECTIONS;
        }

        return data as Section[];
    } catch (err) {
        console.error('[AR Nav] Failed to fetch sections:', err);
        return FALLBACK_SECTIONS;
    }
}

export function getSectionById(
    sections: Section[],
    id: string
): Section | undefined {
    return sections.find((s) => s.id === id);
}
