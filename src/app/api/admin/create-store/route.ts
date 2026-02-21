/**
 * Server-side API route for creating a new store.
 * Uses service role key to bypass RLS policies.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        // 1. Verify the user is authenticated and is admin
        const cookieStore = await cookies();
        const supabaseAuth = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll() { /* read-only in API routes */ },
                },
            }
        );

        const { data: { user } } = await supabaseAuth.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Use service role to check admin + perform operations
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Verify admin role
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // 2. Parse request body
        const body = await request.json();
        const { name, length_meters, width_meters, aisle_count, aisle_width, corridor_spacing, grid_cell_size, nodes, edges } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Store name is required' }, { status: 400 });
        }

        // 3. Create store
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .insert({
                name: name.trim(),
                length_meters,
                width_meters,
                aisle_count,
                aisle_width,
                corridor_spacing,
                grid_cell_size,
                created_by: user.id,
            })
            .select()
            .single();

        if (storeError || !store) {
            return NextResponse.json({ error: storeError?.message || 'Failed to create store' }, { status: 500 });
        }

        // 4. Create version 1
        const { data: version, error: vError } = await supabase
            .from('store_versions')
            .insert({
                store_id: store.id,
                version_number: 1,
                is_published: false,
                is_draft: true,
            })
            .select()
            .single();

        if (vError || !version) {
            return NextResponse.json({ error: vError?.message || 'Failed to create version' }, { status: 500 });
        }

        // 5. Create default floor
        const { data: floor, error: fError } = await supabase
            .from('floors')
            .insert({
                name: 'Ground Floor',
                level_number: 0,
                store_version_id: version.id,
            })
            .select()
            .single();

        if (fError || !floor) {
            return NextResponse.json({ error: fError?.message || 'Failed to create floor' }, { status: 500 });
        }

        // 6. Save auto-generated grid nodes
        if (nodes && nodes.length > 0) {
            const nodeInserts = nodes.map((n: { x: number; z: number; type: string; label?: string }) => ({
                x: n.x,
                z: n.z,
                floor_id: floor.id,
                walkable: true,
                type: n.type,
                label: n.label || null,
            }));

            const { data: insertedNodes, error: nError } = await supabase
                .from('navigation_nodes')
                .insert(nodeInserts)
                .select('id');

            if (nError || !insertedNodes) {
                return NextResponse.json({ error: nError?.message || 'Failed to insert nodes' }, { status: 500 });
            }

            // 7. Save edges
            if (edges && edges.length > 0) {
                const nodeIds = insertedNodes.map((n: { id: string }) => n.id);
                const edgeInserts = edges.map((e: { fromIndex: number; toIndex: number }) => ({
                    from_node: nodeIds[e.fromIndex],
                    to_node: nodeIds[e.toIndex],
                    floor_id: floor.id,
                }));

                // Batch insert
                const BATCH_SIZE = 500;
                for (let i = 0; i < edgeInserts.length; i += BATCH_SIZE) {
                    const batch = edgeInserts.slice(i, i + BATCH_SIZE);
                    const { error: eError } = await supabase
                        .from('navigation_edges')
                        .insert(batch);

                    if (eError) {
                        return NextResponse.json({ error: eError.message }, { status: 500 });
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            storeId: store.id,
            versionId: version.id,
            floorId: floor.id,
        });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
