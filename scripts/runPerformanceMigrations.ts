/**
 * Run Performance & Template Migrations
 *
 * Executes SQL migration files using the database connection.
 * Runs both performance indexes and template versioning migrations.
 */

import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(filename: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running migration: ${filename}`);
  console.log('='.repeat(60));

  const migrationPath = path.join(__dirname, '..', 'migrations', filename);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    return false;
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  // Smart SQL statement splitter that handles dollar-quoted strings ($$)
  const statements: string[] = [];
  let currentStatement = '';
  let dollarQuoteCount = 0; // Track nesting of $$ blocks

  const lines = migrationSQL.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comment-only lines (but keep them if inside a function)
    if (dollarQuoteCount === 0 && (trimmed.startsWith('--') || trimmed.length === 0)) {
      continue;
    }

    // Count dollar quote markers (each $$ toggles the state)
    const dollarQuoteMatches = (line.match(/\$\$/g) || []).length;
    dollarQuoteCount += dollarQuoteMatches;

    // If dollarQuoteCount is odd, we're inside a $$ block
    const inDollarQuote = dollarQuoteCount % 2 !== 0;

    currentStatement += line + '\n';

    // Only split on semicolon if not inside dollar quotes
    if (!inDollarQuote && line.includes(';')) {
      // Split and process each statement
      const parts = currentStatement.split(';');

      for (let i = 0; i < parts.length - 1; i++) {
        const stmt = parts[i].trim();
        if (stmt && !stmt.startsWith('--')) {
          statements.push(stmt);
        }
      }

      // Keep the remainder (might be start of next statement)
      currentStatement = parts[parts.length - 1].trim();
      if (currentStatement && !currentStatement.startsWith('--')) {
        currentStatement += '\n';
      } else {
        currentStatement = '';
      }
    }
  }

  // Add final statement if any
  if (currentStatement.trim() && !currentStatement.trim().startsWith('--')) {
    statements.push(currentStatement.trim());
  }

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Skip comments and empty statements
    if (!statement || statement.startsWith('--')) {
      continue;
    }

    try {
      // Extract first few words for logging
      const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

      await db.execute(sql.raw(statement));
      successCount++;
      console.log(`✅ Success`);

    } catch (error: unknown) {
      const pgError = error as { message?: string; detail?: string; code?: string };
      // Check if error is "already exists" - these are OK
      if (pgError.message?.includes('already exists') ||
          pgError.message?.includes('duplicate key')) {
        console.log(`⚠️  Skipped (already exists)`);
        skipCount++;
      } else {
        console.error(`❌ Error: ${pgError.message ?? String(error)}`);
        console.error(`Statement: ${statement.substring(0, 200)}...`);
        throw error;
      }
    }
  }

  console.log(`\n✅ Migration complete: ${successCount} executed, ${skipCount} skipped`);
  return true;
}

async function main() {
  console.log('\n🚀 Starting database migrations...\n');

  try {
    // Initialize database connection
    console.log('Initializing database connection...');
    const { dbInitPromise } = await import('../server/db.js');
    await dbInitPromise;
    console.log('✅ Database connected\n');

    // Migration 1: Performance Indexes
    await runMigration('add_performance_indexes.sql');

    // Migration 2: Template Versioning
    await runMigration('add_template_versioning.sql');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All migrations completed successfully!');
    console.log('='.repeat(60));

    // Verify indexes were created
    console.log('\n📊 Verifying indexes...\n');

    const indexes = await db.execute(sql`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename IN ('step_values', 'logic_rules', 'template_versions', 'template_generation_metrics')
      ORDER BY tablename, indexname;
    `);

    console.log('Indexes found:');
    for (const row of indexes.rows) {
      console.log(`  ✓ ${row.tablename}.${row.indexname}`);
    }

    console.log('\n✅ Database migrations verified!\n');
    process.exit(0);

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('\n❌ Migration failed:', errorMsg);
    if (errorStack) {
      console.error(errorStack);
    }
    process.exit(1);
  }
}

main();
