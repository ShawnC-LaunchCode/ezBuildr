import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

async function applyDatavaultMigrations() {
  console.log('🔄 Checking and applying DataVault migrations...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if datavault_tables table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_tables'
      );
    `);

    if (!checkTable.rows[0].exists) {
      console.log('📄 DataVault tables do not exist, applying migration 0029...');

      // Read and apply migration 0029
      const migration29Path = path.join(process.cwd(), 'migrations', '0029_add_datavault_tables.sql');
      const migration29SQL = fs.readFileSync(migration29Path, 'utf-8');

      console.log('⚙️  Executing migration 0029...');
      await pool.query(migration29SQL);

      console.log('✅ Migration 0029 applied successfully!');
    } else {
      console.log('✅ DataVault tables already exist');
    }

    // Check if auto_number column type exists
    const checkAutoNumber = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'datavault_column_type'
        AND e.enumlabel = 'auto_number'
      );
    `);

    if (!checkAutoNumber.rows[0].exists) {
      console.log('📄 Auto-number column type does not exist, applying migration 0030...');

      // Read and apply migration 0030
      const migration30Path = path.join(process.cwd(), 'migrations', '0030_add_auto_number_column_type.sql');
      const migration30SQL = fs.readFileSync(migration30Path, 'utf-8');

      console.log('⚙️  Executing migration 0030...');
      await pool.query(migration30SQL);

      console.log('✅ Migration 0030 applied successfully!');
    } else {
      console.log('✅ Auto-number column type already exists');
    }

    // Verify the schema
    console.log('\n🔍 Verifying DataVault schema...');

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'datavault_%'
      ORDER BY table_name;
    `);

    console.log('📋 DataVault tables:');
    tables.rows.forEach((row: any) => {
      console.log(`   - ${row.table_name}`);
    });

    const enumValues = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'datavault_column_type'
      ORDER BY e.enumsortorder;
    `);

    console.log('\n📋 DataVault column types:');
    enumValues.rows.forEach((row: any) => {
      console.log(`   - ${row.enumlabel}`);
    });

    console.log('\n✅ DataVault schema is ready!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    throw error;
  } finally {
    await pool.end();
  }
}

applyDatavaultMigrations().catch((error) => {
  console.error('Failed to apply migrations:', error);
  process.exit(1);
});
