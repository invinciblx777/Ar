/**
 * One-time script to create the admin user in Supabase Auth.
 * Run with: node scripts/setup-admin.mjs
 *
 * After running, you can delete this file.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = 'Invinciblx777@gmail.com';
const ADMIN_PASSWORD = 'Invinciblx93';

async function main() {
    console.log('🔧 Setting up admin account...\n');

    // 1. Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );

    let userId;

    if (existing) {
        console.log(`⚡ User ${ADMIN_EMAIL} already exists (id: ${existing.id})`);
        console.log('   Updating password...');

        const { error } = await supabase.auth.admin.updateUserById(existing.id, {
            password: ADMIN_PASSWORD,
        });

        if (error) {
            console.error('❌ Failed to update password:', error.message);
            process.exit(1);
        }

        userId = existing.id;
        console.log('   ✅ Password updated!\n');
    } else {
        console.log(`📝 Creating user ${ADMIN_EMAIL}...`);

        const { data, error } = await supabase.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true,
        });

        if (error) {
            console.error('❌ Failed to create user:', error.message);
            process.exit(1);
        }

        userId = data.user.id;
        console.log(`   ✅ User created (id: ${userId})\n`);
    }

    // 2. Ensure user profile exists with admin role
    console.log('👑 Setting admin role...');

    // Upsert into users table
    const { error: upsertError } = await supabase
        .from('users')
        .upsert({ id: userId, role: 'admin' }, { onConflict: 'id' });

    if (upsertError) {
        console.error('❌ Failed to set admin role:', upsertError.message);
        console.log('\n⚠️  If the "users" table doesn\'t exist yet, run supabase-schema-v4-saas.sql first!');
        process.exit(1);
    }

    console.log('   ✅ Admin role set!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Admin account ready!');
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Login:    http://localhost:3000/admin/login`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main();
