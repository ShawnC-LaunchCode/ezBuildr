#!/usr/bin/env tsx
/**
 * Apply Stage 20 Migrations (0020, 0021, 0022)
 *
 * This script applies migrations for Stage 20 features:
 * - 0020: Page-level conditions (visible_if, skip_if in sections)
 * - 0021: Question-level conditions (visible_if in steps)
 * - 0022: Repeater type (repeater_config in steps)
 *
 * Usage:
 *   npx tsx scripts/applyStage20Migrations.ts
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

  console.log('🔧 VaultLogic: Apply Stage 20 Migrations');
  console.log('');
  console.log('This will apply:');
  console.log('  • Migration 0020: Page-level conditions (visible_if, skip_if)');
  console.log('  • Migration 0021: Question-level conditions (visible_if)');
  console.log('  • Migration 0022: Repeater type (repeater_config)');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    await applyMigration(client, 'Migration 0020 (Page Conditions)', '0020_add_page_conditions.sql');
    await applyMigration(client, 'Migration 0021 (Question Conditions)', '0021_add_question_conditions.sql');
    await applyMigration(client, 'Migration 0022 (Repeater Type)', '0022_add_repeater_type.sql');

    console.log('');
    console.log('✅ All Stage 20 migrations completed successfully!');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. Try fetching workflows - should work now');
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
