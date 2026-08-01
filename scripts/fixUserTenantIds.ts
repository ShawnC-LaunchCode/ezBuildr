#!/usr/bin/env tsx
/**
 * Fix missing tenantIds for users
 * This script ensures all users have a valid tenantId assigned
 */

import 'dotenv/config';
import { resolve } from 'path';

import { config } from 'dotenv';

// Load .env.local if it exists
config({ path: resolve(process.cwd(), '.env.local') });

import { eq, isNull } from 'drizzle-orm';

import { users, tenants } from '@shared/schema';

import { initializeDatabase, getDb } from '../server/db';

async function fixUserTenantIds() {
  // Initialize database connection
  await initializeDatabase();
  const db = getDb();

  console.log('🔍 Checking for users without tenantId...');

  // Get all users without tenantId
  const usersWithoutTenant = await db
    .select()
    .from(users)
    .where(isNull(users.tenantId));

  console.log(`Found ${usersWithoutTenant.length} users without tenantId`);

  if (usersWithoutTenant.length === 0) {
    console.log('✅ All users have tenantId assigned');
    return;
  }

  // Get or create default tenant
  let defaultTenant = await db.select().from(tenants).limit(1);

  if (defaultTenant.length === 0) {
    console.log('📝 Creating default tenant...');
    const [newTenant] = await db
      .insert(tenants)
      // @ts-expect-error - TODO: fix type
      .values({
        name: 'Default Organization',
        slug: 'default',
        description: 'Default organization for VaultLogic users',
      })
      .returning();
    defaultTenant = [newTenant];
    console.log(`✅ Created default tenant: ${newTenant.id}`);
  }

  const tenantId = defaultTenant[0].id;
  console.log(`🔧 Assigning tenantId ${tenantId} to ${usersWithoutTenant.length} users...`);

  // Update all users without tenantId
  for (const user of usersWithoutTenant) {
    await db
      .update(users)
      .set({ tenantId })
      .where(eq(users.id, user.id));
    console.log(`  ✅ Updated user ${user.email}`);
  }

  console.log('✅ All users now have tenantId assigned');
  console.log('');
  console.log('⚠️  IMPORTANT: Users need to log out and log back in for changes to take effect');
}

fixUserTenantIds()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
