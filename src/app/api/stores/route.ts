/**
 * Public API — List stores with published versions
 * GET /api/stores — returns stores that have a published version
 * GET /api/stores?id=xxx — returns store + published sections
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

function getClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        return null;
    }
    return createClient(url, key);
}

export async function GET(request: NextRequest) {
    const supabase = getClient();

    if (!supabase) {
        // Return fallback data when Supabase is not configured
        return NextResponse.json({
            stores: [{
                id: 'fallback',
                name: 'Demo Store',
                length_meters: 20,
                width_meters: 15,
            }],
        });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('id');

    if (storeId) {
        // Get single store with published version sections
        const { data: store } = await supabase
            .from('stores')
            .select('id, name, length_meters, width_meters')
            .eq('id', storeId)
            .single();

        if (!store) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // Get published version
        const { data: version } = await supabase
            .from('store_versions')
            .select('id')
            .eq('store_id', storeId)
            .eq('is_published', true)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

        let sections: Array<Record<string, unknown>> = [];
        if (version) {
            // Get floors for this version
            const { data: floors } = await supabase
                .from('floors')
                .select('id')
                .eq('store_version_id', version.id);

            if (floors && floors.length > 0) {
                const floorIds = floors.map((f: { id: string }) => f.id);
                const { data: secs } = await supabase
                    .from('sections')
                    .select('id, name, node_id, icon, description, category')
                    .in('floor_id', floorIds)
                    .order('name');
                sections = secs || [];
            }
        }

        return NextResponse.json({ store, sections, versionId: version?.id });
    }

    // List all stores with published versions
    const { data: versions } = await supabase
        .from('store_versions')
        .select('store_id')
        .eq('is_published', true);

    const publishedStoreIds = [...new Set((versions || []).map((v: { store_id: string }) => v.store_id))];

    if (publishedStoreIds.length === 0) {
        return NextResponse.json({ stores: [] });
    }

    const { data: stores } = await supabase
        .from('stores')
        .select('id, name, length_meters, width_meters')
        .in('id', publishedStoreIds)
        .order('name');

    return NextResponse.json({ stores: stores || [] });
}
