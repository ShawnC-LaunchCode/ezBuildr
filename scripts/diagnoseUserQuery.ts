import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import { users } from '../shared/schema';

async function diagnoseUserQuery() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  neonConfig.webSocketConstructor = ws.default as any;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const userId = '116568744155653496130';

  console.log("🔍 DIAGNOSTIC: Comparing Raw SQL vs Drizzle ORM\n");
  console.log("=" .repeat(60));

  // Test 1: Raw SQL query
  console.log("\n📍 Test 1: Raw SQL Query");
  console.log("-".repeat(60));
  try {
    const rawResult = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    console.log(`✅ Raw SQL found ${rawResult.rows.length} row(s)`);
    if (rawResult.rows.length > 0) {
      const user = rawResult.rows[0];
      console.log(`   ID: ${user.id} (type: ${typeof user.id})`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Tenant Role: ${user.tenant_role}`);
      console.log(`   Tenant ID: ${user.tenant_id}`);
    }
  } catch (error: unknown) {
    console.error("❌ Raw SQL error:", error instanceof Error ? error.message : String(error));
  }

  // Test 2: Drizzle ORM query (direct)
  console.log("\n📍 Test 2: Drizzle ORM Query (Direct)");
  console.log("-".repeat(60));
  try {
    const db = drizzle(pool);
    const drizzleResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    console.log(`✅ Drizzle ORM found ${drizzleResult.length} row(s)`);
    if (drizzleResult.length > 0) {
      const user = drizzleResult[0];
      console.log(`   ID: ${user.id} (type: ${typeof user.id})`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Tenant Role: ${user.tenantRole}`);
      console.log(`   Tenant ID: ${user.tenantId}`);
    }
  } catch (error: unknown) {
    console.error("❌ Drizzle ORM error:", error instanceof Error ? error.message : String(error));
  }

  // Test 3: Check table structure
  console.log("\n📍 Test 3: Table Structure");
  console.log("-".repeat(60));
  try {
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    console.log("✅ Users table columns:");
    tableInfo.rows.forEach((col: Record<string, unknown>) => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
  } catch (error: unknown) {
    console.error("❌ Table structure error:", error instanceof Error ? error.message : String(error));
  }

  // Test 4: Check actual ID values in database
  console.log("\n📍 Test 4: ID Values in Database");
  console.log("-".repeat(60));
  try {
    const idsResult = await client.query(
      'SELECT id, email, LENGTH(id) as id_length FROM users LIMIT 5'
    );
    console.log(`✅ Found ${idsResult.rows.length} user(s) in database:`);
    idsResult.rows.forEach((row: Record<string, unknown>) => {
      console.log(`   - ${row.email}: ID="${row.id}" (length: ${row.id_length})`);
      console.log(`     Match: ${row.id === userId ? '✓' : '✗'}`);
    });
  } catch (error: unknown) {
    console.error("❌ ID values error:", error instanceof Error ? error.message : String(error));
  }

  // Test 5: Check with userRepository (the actual method being used)
  console.log("\n📍 Test 5: UserRepository.findById()");
  console.log("-".repeat(60));
  try {
    const { userRepository } = await import('../server/repositories');
    const user = await userRepository.findById(userId);

    if (user) {
      console.log("✅ UserRepository found user:");
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Tenant Role: ${user.tenantRole}`);
    } else {
      console.log("❌ UserRepository returned undefined");
    }
  } catch (error: unknown) {
    console.error("❌ UserRepository error:", error instanceof Error ? error.message : String(error));
  }

  console.log(`\n${  "=".repeat(60)}`);
  console.log("🎯 DIAGNOSTIC COMPLETE\n");

  client.release();
  process.exit(0);
}

diagnoseUserQuery();
