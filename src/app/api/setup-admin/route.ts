/**
 * Temporary admin setup route — DELETE after use.
 * Visit http://localhost:3000/api/setup-admin to create/fix the admin role.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
        return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set in .env.local' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. List auth users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
        return NextResponse.json({ error: 'Failed to list auth users', details: authError.message }, { status: 500 });
    }

    const adminEmail = 'invinciblx777@gmail.com';
    const authUser = authData?.users?.find(
        (u) => u.email?.toLowerCase() === adminEmail
    );

    if (!authUser) {
        // Create the admin user
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: 'Invinciblx777@gmail.com',
            password: 'Invinciblx93',
            email_confirm: true,
        });

        if (createError) {
            return NextResponse.json({ error: 'Failed to create auth user', details: createError.message }, { status: 500 });
        }

        // Set admin role
        const { error: roleError } = await supabase
            .from('users')
            .upsert({ id: newUser.user.id, role: 'admin' }, { onConflict: 'id' });

        return NextResponse.json({
            status: 'created',
            message: 'Admin user created and role set to admin',
            userId: newUser.user.id,
            roleError: roleError?.message || null,
        });
    }

    // 2. Check users table
    const { data: dbUser, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

    // 3. Fix role
    const { error: upsertError } = await supabase
        .from('users')
        .upsert({ id: authUser.id, role: 'admin' }, { onConflict: 'id' });

    return NextResponse.json({
        status: 'fixed',
        authUserId: authUser.id,
        authEmail: authUser.email,
        previousDbUser: dbUser,
        dbError: dbError?.message || null,
        upsertError: upsertError?.message || null,
        message: upsertError
            ? 'Failed to set admin role — have you run supabase-schema-v4-saas.sql?'
            : 'Admin role set successfully! You can now login at /admin/login',
    });
}
