/**
 * Temporary route to fix RLS infinite recursion on users table.
 * Visit http://localhost:3000/api/fix-rls to apply the fix.
 * DELETE THIS FILE AFTER USE.
 */
import { NextResponse } from 'next/server';

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
        return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 });
    }

    // Use raw fetch to execute SQL via the Supabase Management API (pg endpoint)
    const sql = `
        -- 1. Drop the recursive admin policy on users table
        DROP POLICY IF EXISTS "Admin read all users" ON users;

        -- 2. Create a SECURITY DEFINER function to check admin role (breaks recursion)
        CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID)
        RETURNS BOOLEAN
        LANGUAGE SQL
        SECURITY DEFINER
        STABLE
        AS $$
            SELECT EXISTS (
                SELECT 1 FROM public.users WHERE id = check_user_id AND role = 'admin'
            );
        $$;

        -- 3. Recreate admin read policy using the function
        CREATE POLICY "Admin read all users" ON users
        FOR SELECT USING (is_admin(auth.uid()));

        -- 4. Fix admin manage policies on all tables to use the function
        DROP POLICY IF EXISTS "Admin manage stores" ON stores;
        CREATE POLICY "Admin manage stores" ON stores
        FOR ALL USING (is_admin(auth.uid()))
        WITH CHECK (is_admin(auth.uid()));

        DROP POLICY IF EXISTS "Admin manage versions" ON store_versions;
        CREATE POLICY "Admin manage versions" ON store_versions
        FOR ALL USING (is_admin(auth.uid()))
        WITH CHECK (is_admin(auth.uid()));

        DROP POLICY IF EXISTS "Admin read all versions" ON store_versions;
        CREATE POLICY "Admin read all versions" ON store_versions
        FOR SELECT USING (is_admin(auth.uid()));

        DROP POLICY IF EXISTS "Admin manage floors" ON floors;
        CREATE POLICY "Admin manage floors" ON floors
        FOR ALL USING (is_admin(auth.uid()))
        WITH CHECK (is_admin(auth.uid()));

        DROP POLICY IF EXISTS "Admin manage nodes" ON navigation_nodes;
        CREATE POLICY "Admin manage nodes" ON navigation_nodes
        FOR ALL USING (is_admin(auth.uid()))
        WITH CHECK (is_admin(auth.uid()));

        DROP POLICY IF EXISTS "Admin manage edges" ON navigation_edges;
        CREATE POLICY "Admin manage edges" ON navigation_edges
        FOR ALL USING (is_admin(auth.uid()))
        WITH CHECK (is_admin(auth.uid()));

        DROP POLICY IF EXISTS "Admin manage sections" ON sections;
        CREATE POLICY "Admin manage sections" ON sections
        FOR ALL USING (is_admin(auth.uid()))
        WITH CHECK (is_admin(auth.uid()));
    `;

    try {
        // Use Supabase's built-in SQL execution via the REST endpoint
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
            },
            // This won't work via RPC — need to use the SQL Editor
        });

        // Since raw SQL execution isn't available via REST API,
        // output the SQL for the user to run manually
        return NextResponse.json({
            message: 'Cannot execute raw SQL via API. Please run the following SQL in Supabase SQL Editor.',
            sql: sql.trim(),
        });
    } catch (err) {
        return NextResponse.json({
            message: 'Please run this SQL in your Supabase SQL Editor to fix the infinite recursion:',
            sql: sql.trim(),
        });
    }
}
