/**
 * Store Version Manager
 *
 * Handles the lifecycle of store map versions:
 * - Create initial version (with auto-generated grid)
 * - Clone version to draft
 * - Publish a version (unpublishes others)
 * - Revert to a previous version (clones it as new draft)
 * - List all versions for a store
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────

export interface StoreVersion {
    id: string;
    store_id: string;
    version_number: number;
    is_published: boolean;
    is_draft: boolean;
    created_at: string;
}

export interface VersionCreateResult {
    success: boolean;
    version?: StoreVersion;
    floorId?: string;
    error?: string;
}

// ── Version Manager Functions ──────────────────────────────────

/**
 * Create the initial version (v1) for a new store.
 * Creates the version record and a default floor.
 */
export async function createInitialVersion(
    supabase: SupabaseClient,
    storeId: string
): Promise<VersionCreateResult> {
    try {
        // Create version 1
        const { data: version, error: vError } = await supabase
            .from('store_versions')
            .insert({
                store_id: storeId,
                version_number: 1,
                is_published: false,
                is_draft: true,
            })
            .select()
            .single();

        if (vError || !version) {
            return { success: false, error: vError?.message || 'Failed to create version' };
        }

        // Create default floor
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
            return { success: false, error: fError?.message || 'Failed to create floor' };
        }

        return { success: true, version, floorId: floor.id };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Save auto-generated grid data (nodes + edges) to a floor.
 */
export async function saveGridToFloor(
    supabase: SupabaseClient,
    floorId: string,
    nodes: { x: number; z: number; type: string; label?: string }[],
    edges: { fromIndex: number; toIndex: number }[]
): Promise<{ success: boolean; error?: string }> {
    try {
        // Insert nodes
        const nodeInserts = nodes.map((n) => ({
            x: n.x,
            z: n.z,
            floor_id: floorId,
            walkable: true,
            type: n.type,
            label: n.label || null,
        }));

        const { data: insertedNodes, error: nError } = await supabase
            .from('navigation_nodes')
            .insert(nodeInserts)
            .select('id');

        if (nError || !insertedNodes) {
            return { success: false, error: nError?.message || 'Failed to insert nodes' };
        }

        // Build node ID map (index → uuid)
        const nodeIds = insertedNodes.map((n: { id: string }) => n.id);

        // Insert edges (bidirectional)
        const edgeInserts = edges.map((e) => ({
            from_node: nodeIds[e.fromIndex],
            to_node: nodeIds[e.toIndex],
            floor_id: floorId,
        }));

        // Batch insert edges (Supabase handles up to ~1000 at a time)
        const BATCH_SIZE = 500;
        for (let i = 0; i < edgeInserts.length; i += BATCH_SIZE) {
            const batch = edgeInserts.slice(i, i + BATCH_SIZE);
            const { error: eError } = await supabase
                .from('navigation_edges')
                .insert(batch);

            if (eError) {
                return { success: false, error: eError.message };
            }
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * List all versions for a store, ordered by version_number desc.
 */
export async function getVersions(
    supabase: SupabaseClient,
    storeId: string
): Promise<StoreVersion[]> {
    const { data, error } = await supabase
        .from('store_versions')
        .select('*')
        .eq('store_id', storeId)
        .order('version_number', { ascending: false });

    if (error || !data) return [];
    return data;
}

/**
 * Get the latest published version for a store (used by AR).
 */
export async function getPublishedVersion(
    supabase: SupabaseClient,
    storeId: string
): Promise<StoreVersion | null> {
    const { data, error } = await supabase
        .from('store_versions')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_published', true)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;
    return data;
}

/**
 * Publish a version. Unpublishes all other versions for the same store.
 */
export async function publishVersion(
    supabase: SupabaseClient,
    versionId: string,
    storeId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Unpublish all versions for this store
        const { error: unpubError } = await supabase
            .from('store_versions')
            .update({ is_published: false })
            .eq('store_id', storeId);

        if (unpubError) {
            return { success: false, error: unpubError.message };
        }

        // Publish the target version
        const { error: pubError } = await supabase
            .from('store_versions')
            .update({ is_published: true, is_draft: false })
            .eq('id', versionId);

        if (pubError) {
            return { success: false, error: pubError.message };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Create a new draft version by cloning an existing version's data.
 * Copies floors, nodes, edges, and sections.
 */
export async function cloneVersionAsDraft(
    supabase: SupabaseClient,
    sourceVersionId: string,
    storeId: string
): Promise<VersionCreateResult> {
    try {
        // Get current max version number
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
            return { success: false, error: vError?.message || 'Failed to create version' };
        }

        // Get source floors
        const { data: sourceFloors } = await supabase
            .from('floors')
            .select('*')
            .eq('store_version_id', sourceVersionId);

        if (!sourceFloors || sourceFloors.length === 0) {
            return { success: true, version: newVersion };
        }

        // Clone each floor and its data
        for (const srcFloor of sourceFloors) {
            // Create new floor
            const { data: newFloor, error: fError } = await supabase
                .from('floors')
                .insert({
                    name: srcFloor.name,
                    level_number: srcFloor.level_number,
                    store_version_id: newVersion.id,
                    floorplan_image_url: srcFloor.floorplan_image_url,
                })
                .select()
                .single();

            if (fError || !newFloor) continue;

            // Get source nodes for this floor
            const { data: srcNodes } = await supabase
                .from('navigation_nodes')
                .select('*')
                .eq('floor_id', srcFloor.id);

            if (!srcNodes || srcNodes.length === 0) continue;

            // Clone nodes
            const nodeInserts = srcNodes.map((n: Record<string, unknown>) => ({
                x: n.x,
                z: n.z,
                floor_id: newFloor.id,
                walkable: n.walkable,
                type: n.type || 'normal',
                label: n.label,
            }));

            const { data: newNodes } = await supabase
                .from('navigation_nodes')
                .insert(nodeInserts)
                .select('id');

            if (!newNodes) continue;

            // Build old→new node ID mapping
            const nodeIdMap = new Map<string, string>();
            srcNodes.forEach((src: { id: string }, i: number) => {
                if (newNodes[i]) {
                    nodeIdMap.set(src.id, newNodes[i].id);
                }
            });

            // Clone edges
            const { data: srcEdges } = await supabase
                .from('navigation_edges')
                .select('*')
                .eq('floor_id', srcFloor.id);

            if (srcEdges && srcEdges.length > 0) {
                const edgeInserts = srcEdges
                    .filter((e: { from_node: string; to_node: string }) =>
                        nodeIdMap.has(e.from_node) && nodeIdMap.has(e.to_node)
                    )
                    .map((e: { from_node: string; to_node: string }) => ({
                        from_node: nodeIdMap.get(e.from_node)!,
                        to_node: nodeIdMap.get(e.to_node)!,
                        floor_id: newFloor.id,
                    }));

                if (edgeInserts.length > 0) {
                    const BATCH_SIZE = 500;
                    for (let i = 0; i < edgeInserts.length; i += BATCH_SIZE) {
                        await supabase
                            .from('navigation_edges')
                            .insert(edgeInserts.slice(i, i + BATCH_SIZE));
                    }
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
                        name: s.name,
                        node_id: nodeIdMap.get(s.node_id)!,
                        floor_id: newFloor.id,
                        icon: s.icon || null,
                    }));

                if (sectionInserts.length > 0) {
                    await supabase.from('sections').insert(sectionInserts);
                }
            }
        }

        return { success: true, version: newVersion };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Revert to a previous version — creates a new draft cloned from the target version.
 */
export async function revertToVersion(
    supabase: SupabaseClient,
    targetVersionId: string,
    storeId: string
): Promise<VersionCreateResult> {
    return cloneVersionAsDraft(supabase, targetVersionId, storeId);
}
