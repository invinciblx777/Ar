/**
 * Server-side API route for Map Builder data operations.
 * Uses service role key to bypass RLS policies for all CRUD operations.
 * 
 * Actions:
 *   - save:        Full save of nodes, edges, sections for a floor
 *   - addNode:     Insert a single node
 *   - deleteNode:  Delete a single node (and its edges/sections)
 *   - addEdge:     Insert a bidirectional edge
 *   - deleteEdge:  Delete a bidirectional edge
 *   - updateNode:  Update node properties
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function getAuthenticatedAdmin() {
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
    if (!user) return { error: 'Not authenticated', status: 401 };

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        return { error: 'Admin access required', status: 403 };
    }

    return { supabase, user };
}

export async function POST(request: Request) {
    try {
        const auth = await getAuthenticatedAdmin();
        if ('error' in auth) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const { supabase } = auth;

        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'loadFloorData':
                return handleLoadFloorData(supabase, body);
            case 'save':
                return handleSave(supabase, body);
            case 'addNode':
                return handleAddNode(supabase, body);
            case 'deleteNode':
                return handleDeleteNode(supabase, body);
            case 'addEdge':
                return handleAddEdge(supabase, body);
            case 'deleteEdge':
                return handleDeleteEdge(supabase, body);
            case 'updateNode':
                return handleUpdateNode(supabase, body);
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (err) {
        console.error('[map-builder-data] Error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLoadFloorData(supabase: any, body: any) {
    const { floorId } = body;
    if (!floorId) {
        return NextResponse.json({ error: 'floorId is required' }, { status: 400 });
    }

    const [nodesRes, edgesRes, sectionsRes] = await Promise.all([
        supabase.from('navigation_nodes').select('*').eq('floor_id', floorId),
        supabase.from('navigation_edges').select('*').eq('floor_id', floorId),
        supabase.from('sections').select('*').eq('floor_id', floorId),
    ]);

    return NextResponse.json({
        success: true,
        nodes: nodesRes.data || [],
        edges: edgesRes.data || [],
        sections: sectionsRes.data || [],
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSave(supabase: any, body: any) {
    const { floorId, nodes, edges, sections } = body;
    if (!floorId) {
        return NextResponse.json({ error: 'floorId is required' }, { status: 400 });
    }

    // 1. Upsert all current nodes
    if (nodes && nodes.length > 0) {
        const { error: nodesErr } = await supabase
            .from('navigation_nodes')
            .upsert(
                nodes.map((n: { id: string; x: number; z: number; type: string; label: string | null }) => ({
                    id: n.id,
                    x: n.x,
                    z: n.z,
                    floor_id: floorId,
                    type: n.type,
                    label: n.label,
                    walkable: true,
                }))
            );
        if (nodesErr) {
            return NextResponse.json({ error: `Nodes save failed: ${nodesErr.message}` }, { status: 500 });
        }
    }

    // 2. Delete removed nodes
    const { data: dbNodes } = await supabase
        .from('navigation_nodes')
        .select('id')
        .eq('floor_id', floorId);

    const currentNodeIds = new Set((nodes || []).map((n: { id: string }) => n.id));
    const removedNodeIds = (dbNodes || [])
        .filter((n: { id: string }) => !currentNodeIds.has(n.id))
        .map((n: { id: string }) => n.id);

    if (removedNodeIds.length > 0) {
        // Delete edges referencing removed nodes first
        await supabase
            .from('navigation_edges')
            .delete()
            .or(removedNodeIds.map((id: string) => `from_node.eq.${id},to_node.eq.${id}`).join(','));
        // Delete sections for removed nodes
        await supabase
            .from('sections')
            .delete()
            .in('node_id', removedNodeIds);
        // Delete the nodes
        await supabase
            .from('navigation_nodes')
            .delete()
            .in('id', removedNodeIds);
    }

    // 3. Replace all edges
    await supabase
        .from('navigation_edges')
        .delete()
        .eq('floor_id', floorId);

    if (edges && edges.length > 0) {
        const edgeRows = edges.flatMap((e: { nodeA: string; nodeB: string }) => [
            { from_node: e.nodeA, to_node: e.nodeB, floor_id: floorId },
            { from_node: e.nodeB, to_node: e.nodeA, floor_id: floorId },
        ]);
        const { error: edgesErr } = await supabase
            .from('navigation_edges')
            .insert(edgeRows);
        if (edgesErr) {
            return NextResponse.json({ error: `Edges save failed: ${edgesErr.message}` }, { status: 500 });
        }
    }

    // 4. Replace all sections
    await supabase.from('sections').delete().eq('floor_id', floorId);

    if (sections && sections.length > 0) {
        const { error: secErr } = await supabase.from('sections').insert(
            sections.map((s: { id: string; name: string; node_id: string; category?: string; description?: string }) => ({
                id: s.id,
                name: s.name,
                node_id: s.node_id,
                floor_id: floorId,
                category: s.category || null,
                description: s.description || null,
            }))
        );
        if (secErr) {
            return NextResponse.json({ error: `Sections save failed: ${secErr.message}` }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddNode(supabase: any, body: any) {
    const { id, x, z, floorId, type, label } = body;
    if (!floorId) {
        return NextResponse.json({ error: 'floorId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('navigation_nodes')
        .insert({
            id,
            x,
            z,
            floor_id: floorId,
            type: type || 'normal',
            label: label || null,
            walkable: true,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: `Add node failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true, node: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteNode(supabase: any, body: any) {
    const { nodeId, floorId } = body;
    if (!nodeId) {
        return NextResponse.json({ error: 'nodeId is required' }, { status: 400 });
    }

    // Delete edges first
    if (floorId) {
        await supabase
            .from('navigation_edges')
            .delete()
            .eq('floor_id', floorId)
            .or(`from_node.eq.${nodeId},to_node.eq.${nodeId}`);
    }
    // Delete sections
    await supabase.from('sections').delete().eq('node_id', nodeId);
    // Delete node
    const { error } = await supabase
        .from('navigation_nodes')
        .delete()
        .eq('id', nodeId);

    if (error) {
        return NextResponse.json({ error: `Delete node failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddEdge(supabase: any, body: any) {
    const { nodeA, nodeB, floorId } = body;
    if (!floorId || !nodeA || !nodeB) {
        return NextResponse.json({ error: 'floorId, nodeA, nodeB are required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('navigation_edges')
        .insert([
            { from_node: nodeA, to_node: nodeB, floor_id: floorId },
            { from_node: nodeB, to_node: nodeA, floor_id: floorId },
        ]);

    if (error) {
        return NextResponse.json({ error: `Add edge failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteEdge(supabase: any, body: any) {
    const { nodeA, nodeB, floorId } = body;
    if (!floorId || !nodeA || !nodeB) {
        return NextResponse.json({ error: 'floorId, nodeA, nodeB are required' }, { status: 400 });
    }

    await supabase
        .from('navigation_edges')
        .delete()
        .eq('floor_id', floorId)
        .or(`and(from_node.eq.${nodeA},to_node.eq.${nodeB}),and(from_node.eq.${nodeB},to_node.eq.${nodeA})`);

    return NextResponse.json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdateNode(supabase: any, body: any) {
    const { nodeId, updates } = body;
    if (!nodeId) {
        return NextResponse.json({ error: 'nodeId is required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('navigation_nodes')
        .update(updates)
        .eq('id', nodeId);

    if (error) {
        return NextResponse.json({ error: `Update node failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
