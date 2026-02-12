import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('Applying migration 0043: Add DataVault Table Permissions...');

  try {
    const migrationPath = join(__dirname, '..', 'migrations', '0043_add_datavault_table_permissions.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await db.execute(sql.raw(migrationSQL));

    console.log('✓ Migration 0043 applied successfully');
    console.log('✓ Added datavault_table_permissions table');
    console.log('✓ Added datavault_table_role enum (owner/write/read)');
    console.log('✓ Created indices for efficient permission lookups');
    console.log('\nPermission hierarchy:');
    console.log('  - owner: full control (includes write + read)');
    console.log('  - write: can modify data (includes read)');
    console.log('  - read: read-only access');
    console.log('\nNext steps:');
    console.log('  1. Table creators automatically have owner permission (via ownerUserId column)');
    console.log('  2. Use API endpoints to grant permissions to other users');
    console.log('  3. All DataVault endpoints now enforce RBAC');
  } catch (error: unknown) {
    console.error('✗ Failed to apply migration 0043:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    process.exit(0);
  }
}

applyMigration();
