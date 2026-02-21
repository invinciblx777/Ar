/**
 * Server-side API route for Map Builder initialization.
 * Ensures a store → version → floor chain exists for the legacy (no-props) path.
 * Uses service role key to bypass RLS policies.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
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

        // Use service role to bypass RLS
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

        // 2. Get or create store
        let { data: stores } = await supabase
            .from('stores')
            .select('*')
            .limit(1);

        let storeId: string;
        let storeName: string;

        if (!stores || stores.length === 0) {
            const { data: newStore, error: storeError } = await supabase
                .from('stores')
                .insert({ name: 'My Store', created_by: user.id })
                .select()
                .single();
            if (storeError || !newStore) {
                return NextResponse.json(
                    { error: storeError?.message || 'Failed to create store' },
                    { status: 500 }
                );
            }
            storeId = newStore.id;
            storeName = newStore.name;
        } else {
            storeId = stores[0].id;
            storeName = stores[0].name;
        }

        // 3. Get or create store_version
        let { data: versions } = await supabase
            .from('store_versions')
            .select('*')
            .eq('store_id', storeId)
            .order('version_number', { ascending: false })
            .limit(1);

        let versionId: string;

        if (!versions || versions.length === 0) {
            const { data: newVersion, error: vError } = await supabase
                .from('store_versions')
                .insert({
                    store_id: storeId,
                    version_number: 1,
                    is_draft: true,
                    is_published: false,
                })
                .select()
                .single();
            if (vError || !newVersion) {
                return NextResponse.json(
                    { error: vError?.message || 'Failed to create version' },
                    { status: 500 }
                );
            }
            versionId = newVersion.id;
        } else {
            versionId = versions[0].id;
        }

        // 4. Get or create floor for this version
        let { data: floors } = await supabase
            .from('floors')
            .select('*')
            .eq('store_version_id', versionId)
            .order('level_number')
            .limit(1);

        let floor: { id: string; name: string; level_number: number; store_version_id: string; floorplan_image_url: string | null };

        if (!floors || floors.length === 0) {
            // Check for orphan floors (no version assigned)
            const { data: orphanFloors } = await supabase
                .from('floors')
                .select('*')
                .is('store_version_id', null)
                .order('level_number')
                .limit(1);

            if (orphanFloors && orphanFloors.length > 0) {
                await supabase
                    .from('floors')
                    .update({ store_version_id: versionId })
                    .eq('id', orphanFloors[0].id);
                floor = {
                    id: orphanFloors[0].id,
                    name: orphanFloors[0].name,
                    level_number: orphanFloors[0].level_number,
                    store_version_id: versionId,
                    floorplan_image_url: orphanFloors[0].floorplan_image_url,
                };
            } else {
                const { data: newFloor, error: fError } = await supabase
                    .from('floors')
                    .insert({
                        name: 'Ground Floor',
                        level_number: 0,
                        store_version_id: versionId,
                    })
                    .select()
                    .single();
                if (fError || !newFloor) {
                    return NextResponse.json(
                        { error: fError?.message || 'Failed to create floor' },
                        { status: 500 }
                    );
                }
                floor = {
                    id: newFloor.id,
                    name: newFloor.name,
                    level_number: newFloor.level_number,
                    store_version_id: versionId,
                    floorplan_image_url: newFloor.floorplan_image_url,
                };
            }
        } else {
            floor = {
                id: floors[0].id,
                name: floors[0].name,
                level_number: floors[0].level_number,
                store_version_id: floors[0].store_version_id,
                floorplan_image_url: floors[0].floorplan_image_url,
            };
        }

        return NextResponse.json({
            success: true,
            storeId,
            storeName,
            versionId,
            floor,
        });
    } catch (err) {
        console.error('[map-builder-init] Error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
