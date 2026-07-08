import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function createAdminUser() {
  try {
    // @ts-ignore - TODO: fix type
    neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    console.log("🔧 Creating admin user...\n");

    // First, check if default tenant exists, if not create it
    const tenantResult = await client.query(`
      SELECT id FROM tenants WHERE name = 'Default Tenant' LIMIT 1
    `);

    let tenantId;
    if (tenantResult.rows.length === 0) {
      console.log("Creating default tenant...");
      const newTenantResult = await client.query(`
        INSERT INTO tenants (name, created_at, updated_at)
        VALUES ('Default Tenant', NOW(), NOW())
        RETURNING id
      `);
      tenantId = newTenantResult.rows[0].id;
      console.log(`✅ Default tenant created: ${tenantId}\n`);
    } else {
      tenantId = tenantResult.rows[0].id;
      console.log(`✅ Using existing tenant: ${tenantId}\n`);
    }

    // Create or update the user
    const userId = "116568744155653496130";  // From the login logs
    const email = "scooter4356@gmail.com";

    // Check if user exists
    const existingUser = await client.query('SELECT id FROM users WHERE id = $1', [userId]);

    if (existingUser.rows.length > 0) {
      console.log("User already exists, updating...");
      await client.query(`
        UPDATE users
        SET role = 'admin', tenant_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [tenantId, userId]);
      console.log("✅ User updated to admin");
    } else {
      console.log("Creating new user...");
      await client.query(`
        INSERT INTO users (
          id, email, first_name, last_name, role, tenant_id,
          auth_provider, default_mode, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      `, [
        userId,
        email,
        "Scooter",  // You can change this
        "User",     // You can change this
        "admin",
        tenantId,
        "google",
        "easy"
      ]);
      console.log("✅ User created as admin");
    }

    // Verify the user was created
    const verifyResult = await client.query(
      'SELECT id, email, role, tenant_id FROM users WHERE id = $1',
      [userId]
    );

    if (verifyResult.rows.length > 0) {
      const user = verifyResult.rows[0];
      console.log("\n✅ SUCCESS! User details:");
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   TenantID: ${user.tenant_id}`);
      console.log("\n🎉 You should now be able to access the dashboard!");
      console.log("   Please refresh your browser (you may need to log out and log back in)");
    } else {
      console.log("❌ Failed to verify user creation");
    }

    client.release();
    process.exit(0);
  } catch (error: unknown) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

createAdminUser();
