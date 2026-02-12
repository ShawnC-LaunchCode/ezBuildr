/**
 * Apply Migration 0041: Add DataVault Row Notes (v4 Micro-Phase 3)
 * - Creates datavault_row_notes table
 * - Adds indexes for performance
 * - Adds CASCADE deletion on row/tenant/user delete
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
  console.log('🚀 Applying migration 0041: Row Notes...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if table already exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_row_notes'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('✅ datavault_row_notes table already exists');
    } else {
      // Read and execute migration SQL
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, '../migrations/0041_add_datavault_row_notes.sql'),
        'utf-8'
      );

      await pool.query(migrationSQL);
      console.log('✅ Migration 0041 applied successfully!');
    }

    console.log('📊 Changes:');
    console.log('  - Created datavault_row_notes table');
    console.log('  - Added indexes for performance (row_id, tenant_id, user_id)');
    console.log('  - Added CASCADE deletion on row/tenant/user delete');
    console.log('\n📡 Row notes API endpoints:');
    console.log('  - GET  /api/datavault/rows/:rowId/notes');
    console.log('  - POST /api/datavault/rows/:rowId/notes');
    console.log('  - DELETE /api/datavault/notes/:noteId');

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
