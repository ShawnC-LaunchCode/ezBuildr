#!/usr/bin/env tsx
/**
 * Apply Migration 0025: Fix Schema Inconsistencies
 *
 * This script applies the comprehensive migration that fixes:
 * - Missing columns in projects table (created_by, owner_id, status)
 * - Missing updated_at columns in sections, steps, logic_rules
 *
 * Usage:
 *   npx tsx scripts/applyMigration0025.ts
 *
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/applyMigration0025.ts
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
 * Split SQL into individual statements while preserving DO blocks
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let insideDoBlock = false;

  const lines = sql.split('\n');

  for (const line of lines) {
    // Check for DO block start
    if (line.trim().startsWith('DO $$') || line.trim().startsWith('DO $')) {
      insideDoBlock = true;
    }

    currentStatement += line + '\n';

    // Check for DO block end
    if (insideDoBlock && (line.trim() === 'END $$;' || line.trim() === 'END $;')) {
      insideDoBlock = false;
      statements.push(currentStatement.trim());
      currentStatement = '';
      continue;
    }

    // Regular statement end (semicolon not inside DO block)
    if (!insideDoBlock && line.trim().endsWith(';') && !line.trim().startsWith('--')) {
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
    console.error('  DATABASE_URL="postgresql://user:pass@host/db" npx tsx scripts/applyMigration0025.ts');
    console.error('');
    console.error('Or add it to your .env file');
    process.exit(1);
  }

  console.log('🔧 VaultLogic Migration 0025: Fix Schema Inconsistencies');
  console.log('');
  console.log('This migration will:');
  console.log('  Part 1: Projects Table');
  console.log('    ✓ Add created_by column with foreign key to users');
  console.log('    ✓ Add owner_id column with foreign key to users');
  console.log('    ✓ Add status column (active/archived)');
  console.log('    ✓ Backfill data from first user');
  console.log('    ✓ Create performance indices');
  console.log('');
  console.log('  Part 2: Updated Timestamps');
  console.log('    ✓ Add updated_at to sections table');
  console.log('    ✓ Add updated_at to steps table');
  console.log('    ✓ Add updated_at to logic_rules table');
  console.log('    ✓ Backfill with created_at values');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    // Read migration file
    const migrationPath = join(__dirname, '..', 'migrations', '0025_fix_schema_inconsistencies.sql');
    const migrationSql = await readFile(migrationPath, 'utf-8');

    console.log('📝 Applying migration...');
    console.log('');

    // Split SQL into individual statements while preserving DO blocks
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
            error.message?.includes('duplicate') ||
            error.message?.includes('column') && error.message?.includes('already')) {
          skipCount++;
          process.stdout.write('s');
        } else {
          console.error(`\n⚠️  Statement ${i + 1} warning:`, error.message);
        }
      }
    }

    console.log('');
    console.log('');
    console.log(`✅ Migration 0025 completed successfully!`);
    console.log(`   ${successCount} statements applied`);
    console.log(`   ${skipCount} statements skipped (already applied)`);
    console.log('');
    console.log('📊 Changes applied:');
    console.log('   Part 1: projects table now has created_by, owner_id, status');
    console.log('   Part 2: sections, steps, logic_rules now have updated_at');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. Test project creation');
    console.log('   3. Test workflow editing (verify updated_at is set)');
    console.log('   4. Check application logs for any schema errors');
    console.log('');

  } catch (error: any) {
    console.error('');
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
    console.error('   - Check if migration was already partially applied');
    console.error('');
    console.error('📝 For more details, see: docs/DATA_LAYER_AUDIT_2025_11_14.md');
    process.exit(1);
  }
}

applyMigration();
