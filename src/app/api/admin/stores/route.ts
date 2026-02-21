/**
 * Server-side API route for admin data fetching.
 * Bypasses RLS using service role key.
 * 
 * GET /api/admin/stores — list all stores
 * GET /api/admin/stores?id=xxx — get single store
 * GET /api/admin/stores?id=xxx&versions=true — get store + versions
 * GET /api/admin/stores?versionId=xxx&nodes=true — get nodes for version (QR manager)
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

async function getAuthUserId() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { },
            },
        }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
}

function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

export async function GET(request: NextRequest) {
    const userId = await getAuthUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = getAdminClient();

    // Verify admin
    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (!profile || profile.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('id');
    const withVersions = searchParams.get('versions') === 'true';
    const versionId = searchParams.get('versionId');
    const withNodes = searchParams.get('nodes') === 'true';

    // Nodes for a specific version (used by QR Manager)
    if (versionId && withNodes) {
        const { data: floors } = await supabase
            .from('floors')
            .select('id')
            .eq('store_version_id', versionId)
            .order('level_number')
            .limit(1);

        const floorId = floors?.[0]?.id || '';

        if (floorId) {
            const { data: nodes } = await supabase
                .from('navigation_nodes')
                .select('id, x, z, label, type')
                .eq('floor_id', floorId)
                .order('type');

            return NextResponse.json({ nodes: nodes || [], floorId });
        }

        return NextResponse.json({ nodes: [], floorId: '' });
    }

    // Single store
    if (storeId) {
        const { data: store, error } = await supabase
            .from('stores')
            .select('*')
            .eq('id', storeId)
            .single();

        if (error || !store) {
            return NextResponse.json({ error: error?.message || 'Store not found' }, { status: 404 });
        }

        let versions = null;
        if (withVersions) {
            const { data } = await supabase
                .from('store_versions')
                .select('*')
                .eq('store_id', storeId)
                .order('version_number', { ascending: false });
            versions = data || [];
        }

        return NextResponse.json({ store, versions });
    }

    // List all stores
    const { data: stores, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ stores: stores || [] });
}

/**
 * POST /api/admin/stores — publish/clone version operations
 */
export async function POST(request: NextRequest) {
    const userId = await getAuthUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (!profile || profile.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, versionId, storeId } = body;

    if (action === 'publish') {
        // Unpublish all
        await supabase
            .from('store_versions')
            .update({ is_published: false })
            .eq('store_id', storeId);

        // Publish target
        const { error } = await supabase
            .from('store_versions')
            .update({ is_published: true, is_draft: false })
            .eq('id', versionId);

        return NextResponse.json({ success: !error, error: error?.message });
    }

    if (action === 'clone') {
        // Get max version number
        const { data: versions } = await supabase
            .from('store_versions')
            .select('version_number')
            .eq('store_id', storeId)
            .order('version_number', { ascending: false })
            .limit(1);

        const nextVersion = (versions?.[0]?.version_number || 0) + 1;

        // Create new version
        const { data: newVersion, error: vError } = await supabase
            .from('store_versions')
            .insert({
                store_id: storeId,
                version_number: nextVersion,
                is_published: false,
                is_draft: true,
            })
            .select()
            .single();

        if (vError || !newVersion) {
            return NextResponse.json({ success: false, error: vError?.message });
        }

        // Clone floors and their data from source version
        const { data: sourceFloors } = await supabase
            .from('floors')
            .select('*')
            .eq('store_version_id', versionId);

        if (sourceFloors) {
            for (const srcFloor of sourceFloors) {
                const { data: newFloor } = await supabase
                    .from('floors')
                    .insert({
                        name: srcFloor.name,
                        level_number: srcFloor.level_number,
                        store_version_id: newVersion.id,
                        floorplan_image_url: srcFloor.floorplan_image_url,
                    })
                    .select()
                    .single();

                if (!newFloor) continue;

                // Clone nodes
                const { data: srcNodes } = await supabase
                    .from('navigation_nodes')
                    .select('*')
                    .eq('floor_id', srcFloor.id);

                if (!srcNodes || srcNodes.length === 0) continue;

                const nodeInserts = srcNodes.map((n: Record<string, unknown>) => ({
                    x: n.x, z: n.z, floor_id: newFloor.id,
                    walkable: n.walkable, type: n.type || 'normal', label: n.label,
                }));

                const { data: newNodes } = await supabase
                    .from('navigation_nodes')
                    .insert(nodeInserts)
                    .select('id');

                if (!newNodes) continue;

                const nodeIdMap = new Map<string, string>();
                srcNodes.forEach((src: { id: string }, i: number) => {
                    if (newNodes[i]) nodeIdMap.set(src.id, newNodes[i].id);
                });

                // Clone edges
                const { data: srcEdges } = await supabase
                    .from('navigation_edges')
                    .select('*')
                    .eq('floor_id', srcFloor.id);

                if (srcEdges && srcEdges.length > 0) {
                    const edgeInserts = srcEdges
                        .filter((e: { from_node: string; to_node: string }) =>
                            nodeIdMap.has(e.from_node) && nodeIdMap.has(e.to_node))
                        .map((e: { from_node: string; to_node: string }) => ({
                            from_node: nodeIdMap.get(e.from_node)!,
                            to_node: nodeIdMap.get(e.to_node)!,
                            floor_id: newFloor.id,
                        }));

                    const BATCH_SIZE = 500;
                    for (let i = 0; i < edgeInserts.length; i += BATCH_SIZE) {
                        await supabase.from('navigation_edges').insert(edgeInserts.slice(i, i + BATCH_SIZE));
                    }
                }

                // Clone sections
                const { data: srcSections } = await supabase
                    .from('sections')
                    .select('*')
                    .eq('floor_id', srcFloor.id);

                if (srcSections && srcSections.length > 0) {
                    const sectionInserts = srcSections
                        .filter((s: { node_id: string }) => nodeIdMap.has(s.node_id))
                        .map((s: { name: string; node_id: string; icon?: string }) => ({
                            name: s.name, node_id: nodeIdMap.get(s.node_id)!,
                            floor_id: newFloor.id, icon: s.icon || null,
                        }));

                    if (sectionInserts.length > 0) {
                        await supabase.from('sections').insert(sectionInserts);
                    }
                }
            }
        }

        return NextResponse.json({ success: true, version: newVersion });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
