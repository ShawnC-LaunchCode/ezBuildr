/**
 * Apply Migration 0039: Add select and multiselect column types
 * Adds 'select' and 'multiselect' to datavault_column_type enum
 * Adds 'options' jsonb column to datavault_columns table
 */

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
  console.log('🚀 Applying migration 0039: Add select and multiselect column types...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if 'select' type already exists in enum
    const checkEnum = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'select'
        AND enumtypid = (
          SELECT oid FROM pg_type WHERE typname = 'datavault_column_type'
        )
      );
    `);

    if (checkEnum.rows[0].exists) {
      console.log('✅ select and multiselect types already exist in enum');
    } else {
      // Read and execute migration SQL
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, '../migrations/0039_add_select_multiselect_columns.sql'),
        'utf-8'
      );

      await pool.query(migrationSQL);
      console.log('✅ Migration 0039 applied successfully!');
    }

    // Check if options column exists
    const checkColumn = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'datavault_columns'
        AND column_name = 'options'
      );
    `);

    if (checkColumn.rows[0].exists) {
      console.log('✅ options column exists in datavault_columns table');
    }

    console.log('📊 Changes:');
    console.log('  - Added "select" to datavault_column_type enum');
    console.log('  - Added "multiselect" to datavault_column_type enum');
    console.log('  - Added options jsonb column to datavault_columns table');
    console.log('  - Options column stores: {label, value, color}[] for select/multiselect columns');

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
