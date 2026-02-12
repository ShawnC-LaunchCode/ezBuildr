import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function checkDatabaseState() {
  neonConfig.webSocketConstructor = ws.default as typeof WebSocket;

  console.log("🔍 CHECKING DATABASE STATE\n");
  console.log("=" .repeat(70));
  console.log(`\n📍 Database URL: ${process.env.DATABASE_URL?.substring(0, 50)}...`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Check if users table exists
    console.log("\n📊 1. Checking if 'users' table exists...");
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `);
    console.log(`   ${tableCheck.rows[0].exists ? '✅' : '❌'} Users table ${tableCheck.rows[0].exists ? 'exists' : 'does not exist'}`);

    if (!tableCheck.rows[0].exists) {
      console.log("\n❌ CRITICAL: Users table doesn't exist!");
      console.log("   You need to run database migrations first.");
      console.log("   Run: npm run db:push");
      client.release();
      process.exit(1);
    }

    // Count users
    console.log("\n📊 2. Counting users in database...");
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    console.log(`   Found ${userCount.rows[0].count} user(s)`);

    // List all users
    if (parseInt(userCount.rows[0].count) > 0) {
      console.log("\n📊 3. Listing all users:");
      const allUsers = await client.query(`
        SELECT id, email, role, tenant_role, tenant_id, created_at
        FROM users
        ORDER BY created_at DESC
      `);
      allUsers.rows.forEach((user, index) => {
        console.log(`\n   User ${index + 1}:`);
        console.log(`     ID: ${user.id}`);
        console.log(`     Email: ${user.email}`);
        console.log(`     Role: ${user.role}`);
        console.log(`     Tenant Role: ${user.tenant_role}`);
        console.log(`     Tenant ID: ${user.tenant_id}`);
        console.log(`     Created: ${user.created_at}`);
      });
    } else {
      console.log("\n⚠️  No users found in database!");
      console.log("   The createAdminUser script may not have worked.");
    }

    // Check tenants table
    console.log("\n📊 4. Checking tenants...");
    const tenantCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'tenants'
      );
    `);

    if (tenantCheck.rows[0].exists) {
      const tenantCount = await client.query('SELECT COUNT(*) FROM tenants');
      console.log(`   ✅ Tenants table exists with ${tenantCount.rows[0].count} tenant(s)`);

      if (parseInt(tenantCount.rows[0].count) > 0) {
        const tenants = await client.query('SELECT id, name, created_at FROM tenants LIMIT 5');
        tenants.rows.forEach((tenant) => {
          console.log(`     - ${tenant.name} (${tenant.id})`);
        });
      }
    } else {
      console.log(`   ❌ Tenants table does not exist`);
    }

    // Check workflows table
    console.log("\n📊 5. Checking workflows...");
    const workflowCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'workflows'
      );
    `);

    if (workflowCheck.rows[0].exists) {
      const workflowCount = await client.query('SELECT COUNT(*) FROM workflows');
      console.log(`   ✅ Workflows table exists with ${workflowCount.rows[0].count} workflow(s)`);
    } else {
      console.log(`   ❌ Workflows table does not exist`);
    }

    // Check database version/migrations
    console.log("\n📊 6. Checking migrations...");
    const migrationCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '__drizzle_migrations'
      );
    `);

    if (migrationCheck.rows[0].exists) {
      const migrations = await client.query(`
        SELECT id, hash, created_at
        FROM __drizzle_migrations
        ORDER BY created_at DESC
        LIMIT 1
      `);
      if (migrations.rows.length > 0) {
        console.log(`   ✅ Latest migration: ${migrations.rows[0].created_at}`);
      } else {
        console.log(`   ⚠️  No migrations found`);
      }
    } else {
      console.log(`   ❌ Migrations table does not exist`);
    }

  } catch (error: unknown) {
    console.error("\n❌ ERROR:", error instanceof Error ? error.message : String(error));
  } finally {
    client.release();
  }

  console.log(`\n${  "=".repeat(70)}`);
  console.log("🎯 DATABASE STATE CHECK COMPLETE\n");
  process.exit(0);
}

checkDatabaseState();
