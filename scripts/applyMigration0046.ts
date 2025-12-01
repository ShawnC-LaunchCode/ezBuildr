/**
 * Apply migration 0046: Fix workflow_runs section constraint
 * Allows sections to be deleted by setting current_section_id to NULL
 */

import { initializeDatabase, getDb } from '../server/db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  try {
    console.log('Applying migration 0046: Fix workflow_runs section constraint...');

    // Initialize database connection
    await initializeDatabase();
    const db = getDb();

    // Read migration SQL
    const migrationPath = path.join(process.cwd(), 'migrations', '0046_fix_workflow_runs_section_constraint.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    await db.execute(sql.raw(migrationSQL));

    console.log('✅ Migration 0046 applied successfully!');
    console.log('You can now delete sections without errors.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
