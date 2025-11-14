#!/usr/bin/env tsx
/**
 * Apply Migration 0024: Fix Missing Columns
 *
 * This script applies the critical migration that fixes missing columns
 * in users, projects, and workflows tables that prevent workflows from
 * being created or displayed.
 *
 * Usage:
 *   npx tsx scripts/applyMigration0024.ts
 *
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/applyMigration0024.ts
 */

import { neon } from '@neondatabase/serverless';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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
    console.error('  DATABASE_URL="postgresql://user:pass@host/db" npx tsx scripts/applyMigration0024.ts');
    console.error('');
    console.error('Or add it to your .env file');
    process.exit(1);
  }

  console.log('🔧 VaultLogic Migration 0024: Fix Missing Columns');
  console.log('');
  console.log('This migration will:');
  console.log('  ✓ Create tenants table if missing');
  console.log('  ✓ Add missing columns to users table (tenant_id, full_name, etc.)');
  console.log('  ✓ Add missing columns to projects table (tenant_id, name, archived)');
  console.log('  ✓ Add missing columns to workflows table (project_id, name, current_version_id)');
  console.log('  ✓ Create default tenant and project');
  console.log('  ✓ Populate foreign key relationships');
  console.log('  ✓ Create necessary indices');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    // Read migration file
    const migrationPath = join(__dirname, '..', 'migrations', '0024_fix_workflows_missing_columns.sql');
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
            error.message?.includes('duplicate')) {
          skipCount++;
          process.stdout.write('s');
        } else {
          console.error(`\n⚠️  Statement ${i + 1} warning:`, error.message);
        }
      }
    }

    console.log('');
    console.log(`✅ Migration completed! (${successCount} applied, ${skipCount} skipped)`);
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. Try creating a workflow again');
    console.log('   3. If issues persist, check application logs');
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
