import dotenv from 'dotenv';
import { eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { tenants, users, projects } from '../shared/schema';


const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

async function fixMissingTenantIds() {
  console.log('🔄 Fixing missing tenant IDs...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    // Step 1: Check if default tenant exists
    console.log('\n📋 Step 1: Checking for default tenant...');
    let defaultTenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.name, 'Default Tenant'))
      .limit(1);

    if (defaultTenant.length === 0) {
      console.log('   Creating default tenant...');
      defaultTenant = await db
        .insert(tenants)
        .values({
          name: 'Default Tenant',
          plan: 'free',
        })
        .returning();
      console.log('   ✅ Default tenant created:', defaultTenant[0].id);
    } else {
      console.log('   ✅ Default tenant exists:', defaultTenant[0].id);
    }

    const tenantId = defaultTenant[0].id;

    // Step 2: Update users without tenantId
    console.log('\n📋 Step 2: Updating users without tenant_id...');
    const usersWithoutTenant = await db
      .select()
      .from(users)
      .where(isNull(users.tenantId));

    if (usersWithoutTenant.length === 0) {
      console.log('   ✅ All users already have tenant_id');
    } else {
      console.log(`   Found ${usersWithoutTenant.length} users without tenant_id`);
      await db
        .update(users)
        .set({
          tenantId,
          tenantRole: 'owner', // Set all users as owners for now
        })
        .where(isNull(users.tenantId));
      console.log('   ✅ Users updated with tenant_id');
    }

    // Step 3: Update projects without tenantId
    console.log('\n📋 Step 3: Updating projects without tenant_id...');
    const projectsWithoutTenant = await db
      .select()
      .from(projects)
      .where(isNull(projects.tenantId));

    if (projectsWithoutTenant.length === 0) {
      console.log('   ✅ All projects already have tenant_id');
    } else {
      console.log(`   Found ${projectsWithoutTenant.length} projects without tenant_id`);
      await db
        .update(projects)
        .set({ tenantId })
        .where(isNull(projects.tenantId));
      console.log('   ✅ Projects updated with tenant_id');
    }

    // Step 4: Verify the fix
    console.log('\n📋 Step 4: Verifying fix...');
    const remainingUsersWithoutTenant = await db
      .select()
      .from(users)
      .where(isNull(users.tenantId));

    const remainingProjectsWithoutTenant = await db
      .select()
      .from(projects)
      .where(isNull(projects.tenantId));

    if (remainingUsersWithoutTenant.length === 0 && remainingProjectsWithoutTenant.length === 0) {
      console.log('   ✅ All users and projects have tenant_id');
      console.log('\n✨ Fix completed successfully!');
      console.log('   You can now use DataVault features.');
      console.log('   Please logout and login again to refresh your session.');
    } else {
      console.log(`   ⚠️  Still have ${remainingUsersWithoutTenant.length} users and ${remainingProjectsWithoutTenant.length} projects without tenant_id`);
    }

  } catch (error: any) {
    console.error('❌ Failed to fix tenant IDs:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

fixMissingTenantIds().catch((error) => {
  console.error('Failed to fix tenant IDs:', error);
  process.exit(1);
});
