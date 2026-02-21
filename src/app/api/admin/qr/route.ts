/**
 * QR Code Generation API
 * POST /api/admin/qr — Generate QR code for a node
 *
 * Body: { store_id, floor_id, node_id, version_id }
 * Returns: { qrDataUrl: string } (PNG data URL)
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';

async function getAuthUserId(): Promise<string | null> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { /* read-only */ },
            },
        }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
}

function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { store_id, floor_id, node_id, version_id } = body;

    if (!store_id || !node_id || !version_id) {
        return NextResponse.json(
            { error: 'store_id, node_id, and version_id are required' },
            { status: 400 }
        );
    }

    // Verify the node exists
    const { data: node, error: nodeError } = await supabase
        .from('navigation_nodes')
        .select('id, x, z, label, type')
        .eq('id', node_id)
        .single();

    if (nodeError || !node) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Build QR payload
    const qrPayload = JSON.stringify({
        store_id,
        floor_id: floor_id || null,
        node_id,
        version_id,
        x: node.x,
        z: node.z,
    });

    try {
        // Generate QR as data URL (PNG)
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
            width: 512,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
            errorCorrectionLevel: 'H',
        });

        return NextResponse.json({
            qrDataUrl,
            payload: qrPayload,
            node: {
                id: node.id,
                x: node.x,
                z: node.z,
                label: node.label,
                type: node.type,
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: `QR generation failed: ${String(err)}` },
            { status: 500 }
        );
    }
}
