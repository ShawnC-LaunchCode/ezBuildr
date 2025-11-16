#!/usr/bin/env node
/**
 * Apply migration 0027: Fix workflow_status enum
 * Run with: node --loader tsx scripts/applyMigration0027.ts
 * Or: DATABASE_URL=your-url node scripts/applyMigration0027.ts
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function applyMigration() {
  console.log('🔄 Applying migration 0027: Fix workflow_status enum...');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const client = await pool.connect();

    // Read migration file
    const migrationPath = join(process.cwd(), 'migrations', '0027_fix_workflow_status_enum.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('Executing migration SQL...');
    await client.query(migrationSQL);

    console.log('✅ Migration 0027 applied successfully!');

    // Verify the changes
    const result = await client.query(`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'workflow_status')
      ORDER BY enumsortorder;
    `);

    console.log('Current workflow_status enum values:', result.rows.map(r => r.enumlabel));

    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

applyMigration().catch((error) => {
  console.error('Failed to apply migration:', error);
  process.exit(1);
});
