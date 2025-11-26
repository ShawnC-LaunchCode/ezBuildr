/**
 * Apply migration 0045: Sync project createdBy field
 * Run with: npx tsx scripts/applyMigration0045.ts
 */

import { getDb, initializeDatabase } from '../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('Applying migration 0045...\n');

    const migrationPath = path.join(__dirname, '../migrations/0045_sync_project_created_by.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    await db.execute(sql.raw(migrationSql));

    console.log('✓ Migration 0045 applied successfully!\n');

    // Verify the fix
    console.log('Verifying changes...');
    const result = await db.execute(sql`
      SELECT id, title, creator_id, created_by, owner_id
      FROM projects
    `);

    console.log('\nProject ownership after migration:');
    for (const row of result.rows) {
      console.log(`  ${row.title}:`);
      console.log(`    creatorId: ${row.creator_id}`);
      console.log(`    createdBy: ${row.created_by}`);
      console.log(`    ownerId: ${row.owner_id}`);
    }

  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    process.exit(0);
  }
}

applyMigration();
