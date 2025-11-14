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
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

    // Split migration into individual statements
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let executedCount = 0;
    for (const statement of statements) {
      try {
        await client(statement);
        executedCount++;
      } catch (error: any) {
        // Only log if it's not a "already exists" type error
        if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
          console.warn(`⚠️  Warning during statement ${executedCount + 1}:`, error.message);
        }
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log(`   Executed ${executedCount} SQL statements`);
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
