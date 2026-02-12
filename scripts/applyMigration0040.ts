/**
 * Apply Migration 0040: Autonumber Enhancements (DataVault v4 Micro-Phase 2)
 * - Adds autonumber_reset_policy enum
 * - Adds autonumber_prefix, autonumber_padding, autonumber_reset_policy columns to datavault_columns
 * - Creates datavault_number_sequences table
 * - Adds atomic increment function
 * - Migrates existing auto_number columns to autonumber
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
  console.log('🚀 Applying migration 0040: Autonumber enhancements...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if autonumber type already exists in enum
    const checkEnum = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'autonumber'
        AND enumtypid = (
          SELECT oid FROM pg_type WHERE typname = 'datavault_column_type'
        )
      );
    `);

    if (checkEnum.rows[0].exists) {
      console.log('✅ autonumber type already exists in enum');
    } else {
      // Read and execute migration SQL
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, '../migrations/0040_add_autonumber_enhancements.sql'),
        'utf-8'
      );

      await pool.query(migrationSQL);
      console.log('✅ Migration 0040 applied successfully!');
    }

    // Check if datavault_number_sequences table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_number_sequences'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('✅ datavault_number_sequences table exists');
    }

    // Check if autonumber columns exist
    const checkColumns = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'datavault_columns'
        AND column_name = 'autonumber_prefix'
      );
    `);

    if (checkColumns.rows[0].exists) {
      console.log('✅ autonumber columns exist in datavault_columns table');
    }

    console.log('📊 Changes:');
    console.log('  - Added "autonumber" to datavault_column_type enum');
    console.log('  - Added autonumber_reset_policy enum (never, yearly)');
    console.log('  - Added autonumber_prefix, autonumber_padding, autonumber_reset_policy columns');
    console.log('  - Created datavault_number_sequences table');
    console.log('  - Added datavault_get_next_autonumber() function');
    console.log('  - Migrated existing auto_number columns to autonumber');

    process.exit(0);
  } catch (error: unknown) {
    const pgError = error as { message?: string; detail?: string };
    console.error('❌ Migration failed:', pgError.message ?? String(error));
    if (pgError.detail) {
      console.error('   Details:', pgError.detail);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
