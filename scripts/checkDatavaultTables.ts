import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Check if DataVault tables exist and apply migration if needed
 */
async function checkDatavaultTables() {
  try {
    console.log('Checking if DataVault tables exist...');

    // Check if datavault_tables exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_tables'
      ) as table_exists;
    `);

    const tableExists = (result.rows[0] as any).table_exists;

    if (tableExists) {
      console.log('✅ DataVault tables exist');

      // Check if enum exists
      const enumCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM pg_type
          WHERE typname = 'datavault_column_type'
        ) as enum_exists;
      `);

      const enumExists = (enumCheck.rows[0] as any).enum_exists;
      console.log(`Enum exists: ${enumExists}`);

      return;
    }

    console.log('❌ DataVault tables do not exist');
    console.log('Applying migration 0029...');

    // Read and execute migration
    const migrationPath = join(__dirname, '../migrations/0029_add_datavault_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await db.execute(sql.raw(migrationSQL));

    console.log('✅ Migration 0029 applied successfully');

  } catch (error) {
    console.error('❌ Error checking/applying DataVault tables:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

checkDatavaultTables();
