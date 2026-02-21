/**
 * Debug route - tests the exact same query the login page uses.
 * Hit http://localhost:3000/api/debug-login to see what happens.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Test with service role (should always work)
    const adminClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Test with anon key (simulates what login page does)
    const anonClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Sign in with anon client
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: 'Invinciblx777@gmail.com',
        password: 'Invinciblx93',
    });

    const results: Record<string, unknown> = {
        signInSuccess: !signInError,
        signInError: signInError?.message || null,
        userId: signInData?.user?.id || null,
    };

    if (signInData?.user) {
        // 2. Query users table with the now-authenticated anon client
        const { data: anonProfile, error: anonError } = await anonClient
            .from('users')
            .select('role')
            .eq('id', signInData.user.id)
            .single();

        results.anonQueryResult = anonProfile;
        results.anonQueryError = anonError?.message || null;

        // 3. Also query with service role for comparison
        const { data: adminProfile, error: adminError } = await adminClient
            .from('users')
            .select('role')
            .eq('id', signInData.user.id)
            .single();

        results.adminQueryResult = adminProfile;
        results.adminQueryError = adminError?.message || null;
    }

    // Sign out to clean up
    await anonClient.auth.signOut();

    return NextResponse.json(results, { status: 200 });
}
