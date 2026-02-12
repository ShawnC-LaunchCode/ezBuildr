import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function createAdminUserProper() {
  neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  // User details
  const userId = '116568744155653496130'; // Google OAuth sub ID
  const userEmail = 'scooter4356@gmail.com';
  const tenantId = '2181d3ab-9a00-42c2-a9b6-0d202df1e5f0'; // Default Tenant from database

  console.log("🔧 CREATING ADMIN USER (PROPER)\n");
  console.log("=" .repeat(70));

  try {
    // Step 1: Verify tenant exists
    console.log("\n📍 Step 1: Verifying tenant exists...");
    const tenantCheck = await client.query(
      'SELECT id, name FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      console.log("❌ Tenant not found! Creating default tenant...");
      await client.query(`
        INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
      `, [tenantId, 'Default Tenant']);
      console.log("✅ Default tenant created");
    } else {
      console.log(`✅ Tenant exists: ${tenantCheck.rows[0].name}`);
    }

    // Step 2: Check if user already exists
    console.log("\n📍 Step 2: Checking if user already exists...");
    const existingUser = await client.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length > 0) {
      console.log(`⚠️  User already exists: ${existingUser.rows[0].email}`);
      console.log("   Updating to admin role...");

      await client.query(`
        UPDATE users
        SET
          role = 'admin',
          tenant_role = 'owner',
          tenant_id = $2,
          updated_at = NOW()
        WHERE id = $1
      `, [userId, tenantId]);

      console.log("✅ User updated to admin");
    } else {
      // Step 3: Insert new user
      console.log("\n📍 Step 3: Creating new admin user...");
      await client.query(`
        INSERT INTO users (
          id,
          email,
          first_name,
          last_name,
          full_name,
          role,
          tenant_role,
          tenant_id,
          auth_provider,
          default_mode,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        )
      `, [
        userId,
        userEmail,
        'Admin',
        'User',
        'Admin User',
        'admin',
        'owner',
        tenantId,
        'google',
        'easy'
      ]);

      console.log("✅ Admin user created successfully!");
    }

    // Step 4: Verify user was created/updated
    console.log("\n📍 Step 4: Verifying user in database...");
    const verifyUser = await client.query(
      'SELECT id, email, role, tenant_role, tenant_id FROM users WHERE id = $1',
      [userId]
    );

    if (verifyUser.rows.length > 0) {
      const user = verifyUser.rows[0];
      console.log("✅ USER VERIFIED IN DATABASE:");
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Tenant Role: ${user.tenant_role}`);
      console.log(`   Tenant ID: ${user.tenant_id}`);
    } else {
      console.log("❌ VERIFICATION FAILED: User not found after insert!");
    }

    // Step 5: Count total users
    console.log("\n📍 Step 5: Counting total users in database...");
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    console.log(`   Total users: ${userCount.rows[0].count}`);

  } catch (error: unknown) {
    console.error("\n❌ ERROR:", error);
    throw error;
  } finally {
    client.release();
  }

  console.log(`\n${  "=".repeat(70)}`);
  console.log("🎉 ADMIN USER CREATION COMPLETE!");
  console.log("\n💡 Next steps:");
  console.log("   1. Clear your browser cookies and session storage");
  console.log("   2. Log out and log back in with scooter4356@gmail.com");
  console.log("   3. You should now have admin/owner access\n");

  process.exit(0);
}

createAdminUserProper();
