/**
 * Apply migration 0026: Fix metrics_rollups unique index
 */
import fs from 'fs';
import path from 'path';

import { sql } from 'drizzle-orm';

// eslint-disable-next-line import/no-unresolved
import { getDb, dbInitPromise } from '../server/db';

async function applyMigration() {
  try {
    console.log('Initializing database connection...');
    await dbInitPromise;
    const db = getDb();

    console.log('Reading migration file...');
    const migrationPath = path.join(process.cwd(), 'migrations', '0026_fix_metrics_rollups_unique_index.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Applying migration 0026...');
    await db.execute(sql.raw(migrationSQL));

    console.log('✅ Migration 0026 applied successfully!');
    console.log('The metrics_rollups unique index now includes tenant_id for proper multi-tenant isolation.');

  } catch (error: unknown) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

applyMigration();
