import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function debugDatabase() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // @ts-expect-error - TODO: fix type
    neonConfig.webSocketConstructor = ws.default as any;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    console.log("🔍 Database Connection Test:");
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.substring(0, 50)}...`);
    console.log("");

    // Test connection
    const client = await pool.connect();
    console.log("✅ Successfully connected to database");

    // Check if users table exists
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'users'
    `);
    console.log(`\n📋 Users table exists: ${tablesResult.rows.length > 0}`);

    // Check all tables in public schema
    const allTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`\n📊 All tables in public schema (${allTablesResult.rows.length} total):`);
    allTablesResult.rows.forEach((row: Record<string, unknown>) => {
      console.log(`  - ${row.table_name}`);
    });

    // Count users
    const countResult = await client.query('SELECT COUNT(*) as count FROM users');
    console.log(`\n👥 User count: ${countResult.rows[0]?.count ?? 0}`);

    // Get all users
    const usersResult = await client.query('SELECT id, email, role, tenant_id, first_name, last_name FROM users');
    console.log(`\n📝 Users (${usersResult.rows.length}):`);
    usersResult.rows.forEach((user: Record<string, unknown>) => {
      console.log(`  - ID: ${user.id}`);
      console.log(`    Email: ${user.email}`);
      console.log(`    Role: ${user.role}`);
      console.log(`    TenantId: ${user.tenant_id}`);
      console.log(`    Name: ${user.first_name} ${user.last_name}`);
      console.log("");
    });

    client.release();
    process.exit(0);
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

debugDatabase();
