import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function checkAllUsers() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  neonConfig.webSocketConstructor = ws.default as any; // WebSocket constructor type compatibility
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  console.log("🔍 CHECKING ALL USERS WITH EMAIL scooter4356@gmail.com\n");

  const result = await client.query(`
    SELECT id, email, tenant_role, tenant_id, auth_provider, role, created_at, updated_at
    FROM users
    WHERE email = $1
    ORDER BY created_at DESC
  `, ['scooter4356@gmail.com']);

  console.log(`Found ${result.rows.length} user(s) with this email:\n`);

  result.rows.forEach((user, index) => {
    console.log(`User ${index + 1}:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Tenant Role: ${user.tenant_role}`);
    console.log(`  Tenant ID: ${user.tenant_id}`);
    console.log(`  Auth Provider: ${user.auth_provider}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Created: ${user.created_at}`);
    console.log(`  Updated: ${user.updated_at}`);
    console.log();
  });

  client.release();
  process.exit(0);
}

checkAllUsers();
