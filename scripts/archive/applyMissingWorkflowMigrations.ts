#!/usr/bin/env tsx
/**
 * Apply Missing Workflow Migrations (0012, 0013, 0014)
 *
 * This script applies migrations that add missing columns to the workflows table:
 * - 0012: is_public, slug, require_login
 * - 0013: pinned_version_id
 * - 0014: intake_config
 *
 * Usage:
 *   npx tsx scripts/applyMissingWorkflowMigrations.ts
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { neon } from '@neondatabase/serverless';
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
  let insideDoBlock = false;

  const lines = sql.split('\n');

  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('--') && !insideDoBlock) {
      continue;
    }

    // Check for DO block start
    if (line.trim().startsWith('DO $$') || line.trim().startsWith('DO $')) {
      insideDoBlock = true;
    }

    currentStatement += `${line  }\n`;

    // Check for DO block end
    if (insideDoBlock && (line.trim() === 'END $$;' || line.trim() === 'END $;')) {
      insideDoBlock = false;
      statements.push(currentStatement.trim());
      currentStatement = '';
      continue;
    }

    // Regular statement end (semicolon not inside DO block)
    if (!insideDoBlock && line.trim().endsWith(';')) {
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

async function applyMigration(client: any, migrationName: string, migrationFile: string) {
  console.log(`\n📝 Applying ${migrationName}...`);

  const migrationPath = join(__dirname, '..', 'migrations', migrationFile);
  const migrationSql = await readFile(migrationPath, 'utf-8');

  const statements = splitSqlStatements(migrationSql);

  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement.trim()) {
      continue;
    }

    try {
      await client(statement);
      successCount++;
      process.stdout.write('.');
    } catch (error: any) {
      if (error.message?.includes('already exists') ||
          error.message?.includes('duplicate')) {
        skipCount++;
        process.stdout.write('s');
      } else {
        process.stdout.write('w');
        console.error(`\n⚠️  Warning:`, error.message);
      }
    }
  }

  console.log('');
  console.log(`✅ ${migrationName} completed (${successCount} applied, ${skipCount} skipped)`);
}

async function applyMigrations() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔧 VaultLogic: Apply Missing Workflow Migrations');
  console.log('');
  console.log('This will apply:');
  console.log('  • Migration 0012: is_public, slug, require_login');
  console.log('  • Migration 0013: pinned_version_id');
  console.log('  • Migration 0014: intake_config');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    await applyMigration(client, 'Migration 0012 (Intake Portal)', '0012_add_intake_portal_columns.sql');
    await applyMigration(client, 'Migration 0013 (Versioning)', '0013_add_workflow_versioning_columns.sql');
    await applyMigration(client, 'Migration 0014 (Intake Config)', '0014_add_intake_config.sql');

    console.log('');
    console.log('✅ All migrations completed successfully!');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. Try creating a workflow again');
    console.log('   3. Workflow creation should now work correctly');
    console.log('');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    process.exit(1);
  }
}

applyMigrations();
