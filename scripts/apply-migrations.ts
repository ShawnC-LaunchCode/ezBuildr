/**
 * Apply Database Index Migrations
 *
 * Applies the three index migration files to the database
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured in .env');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const migrations = [
  '0057_add_step_values_composite_index.sql',
  '0058_add_logic_rules_indexes.sql',
  '0059_add_performance_indexes.sql',
];

async function applyMigrations() {
  console.log('🚀 Starting database index migrations...\n');

  for (const migrationFile of migrations) {
    const migrationPath = join(__dirname, '..', 'migrations', migrationFile);

    try {
      console.log(`📝 Applying ${migrationFile}...`);
      const migrationSQL = readFileSync(migrationPath, 'utf8');

      // Split SQL into individual statements (Neon doesn't support multiple statements)
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      // Execute each statement
      for (const statement of statements) {
        if (statement.includes('ROLLBACK') || statement.includes('DROP INDEX IF EXISTS')) {
          // Skip rollback commands
          continue;
        }
        try {
          await sql(statement);
        } catch (stmtError: unknown) {
          // If COMMENT fails because index already exists, that's okay
          const stmtMsg = stmtError instanceof Error ? stmtError.message : String(stmtError);
          if (statement.includes('COMMENT ON INDEX') && stmtMsg.includes('does not exist')) {
            console.log(`   ℹ️  Skipping comment (index may already exist)`);
            continue;
          }
          // Rethrow other errors
          throw stmtError;
        }
      }

      console.log(`✅ ${migrationFile} applied successfully!\n`);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to apply ${migrationFile}:`);
      console.error(`   Error: ${errMsg}\n`);

      // If it's a "relation already exists" error, that's okay (idempotent)
      if (errMsg.includes('already exists')) {
        console.log(`   ℹ️  Index already exists - skipping\n`);
        continue;
      }

      // Otherwise, exit with error
      process.exit(1);
    }
  }

  console.log('🎉 All migrations applied successfully!');
  console.log('\n📊 Run verification script to confirm indexes:');
  console.log('   psql $DATABASE_URL -f scripts/verify-indexes.sql');
}

applyMigrations().catch(error => {
  console.error('❌ Migration process failed:', error);
  process.exit(1);
});
