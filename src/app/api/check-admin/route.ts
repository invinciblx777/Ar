/**
 * API route to check if the current authenticated user has admin role.
 * Called after client-side sign-in to verify admin access.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const userId = body.userId;

        if (!userId) {
            return NextResponse.json({ admin: false, error: 'No userId provided' }, { status: 400 });
        }

        // Use service role to bypass RLS and check user role
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceKey) {
            return NextResponse.json({ admin: false, error: 'Server misconfigured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: profile, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            return NextResponse.json({ admin: false, error: error?.message || 'User not found' });
        }

        return NextResponse.json({ admin: profile.role === 'admin', role: profile.role });
    } catch (err) {
        return NextResponse.json({ admin: false, error: String(err) }, { status: 500 });
    }
}
