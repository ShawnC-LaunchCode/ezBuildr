#!/usr/bin/env tsx
/**
 * Apply Migration 0011: Add Analytics & SLI Tables
 *
 * This script applies migration 0011 which creates the metrics_events,
 * metrics_rollups, sli_configs, and sli_windows tables needed for
 * analytics and SLI tracking.
 *
 * Usage:
 *   npx tsx scripts/applyMigration0011.ts
 *
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/applyMigration0011.ts
 */

import { neon } from '@neondatabase/serverless';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Split SQL into individual statements
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';

  const lines = sql.split('\n');

  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('--')) {
      continue;
    }

    currentStatement += line + '\n';

    // Statement end (semicolon)
    if (line.trim().endsWith(';')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(s => s && !s.startsWith('--'));
}

async function applyMigration() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('');
    console.error('Please set DATABASE_URL in your environment:');
    console.error('  DATABASE_URL="postgresql://user:pass@host/db" npx tsx scripts/applyMigration0011.ts');
    console.error('');
    console.error('Or add it to your .env file');
    process.exit(1);
  }

  console.log('🔧 VaultLogic Migration 0011: Add Analytics & SLI Tables');
  console.log('');
  console.log('This migration will create:');
  console.log('  ✓ metrics_event_type enum');
  console.log('  ✓ rollup_bucket enum');
  console.log('  ✓ sli_window enum');
  console.log('  ✓ metrics_events table');
  console.log('  ✓ metrics_rollups table');
  console.log('  ✓ sli_configs table');
  console.log('  ✓ sli_windows table');
  console.log('  ✓ All necessary indices');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    // Read migration file
    const migrationPath = join(__dirname, '..', 'migrations', '0011_add_analytics_sli_tables.sql');
    const migrationSql = await readFile(migrationPath, 'utf-8');

    console.log('📝 Applying migration...');
    console.log('');

    // Split SQL into individual statements
    const statements = splitSqlStatements(migrationSql);

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement.trim() || statement.trim().startsWith('--')) {
        continue;
      }

      try {
        await client(statement);
        successCount++;
        process.stdout.write('.');
      } catch (error: any) {
        // Ignore errors for already-applied changes
        if (error.message?.includes('already exists') ||
            error.message?.includes('duplicate')) {
          skipCount++;
          process.stdout.write('s');
        } else {
          console.error(`\n⚠️  Statement ${i + 1} warning:`, error.message);
          // Continue anyway - some errors might be non-critical
          process.stdout.write('w');
        }
      }
    }

    console.log('');
    console.log(`✅ Migration completed! (${successCount} applied, ${skipCount} skipped)`);
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. The metrics rollup job should now work correctly');
    console.log('   3. Check application logs for any remaining issues');
    console.log('');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   - Check that DATABASE_URL is correct');
    console.error('   - Ensure database is accessible');
    console.error('   - Verify you have necessary permissions');
    process.exit(1);
  }
}

applyMigration();
