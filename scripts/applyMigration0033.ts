import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

async function applyMigration() {
  console.log('🚀 Applying migration 0033: Add datavault_databases...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if datavault_databases table already exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_databases'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('✅ datavault_databases table already exists');
      process.exit(0);
    }

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/0033_add_datavault_databases.sql'),
      'utf-8'
    );

    await pool.query(migrationSQL);

    console.log('✅ Migration 0033 applied successfully!');
    console.log('📊 Changes:');
    console.log('  - Created datavault_databases table');
    console.log('  - Added database_id column to datavault_tables');
    console.log('  - Created indexes for performance');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
