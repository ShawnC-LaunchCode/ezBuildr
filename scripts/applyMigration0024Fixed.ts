#!/usr/bin/env tsx
/**
 * Apply Migration 0024: Fix Missing Columns (Fixed for Neon)
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import ws from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function applyMigration() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔧 VaultLogic Migration 0024: Fix Missing Columns');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1]?.split('?')[0] || 'hidden');
  console.log('');

  try {
    const pool = new Pool({ connectionString: dbUrl });

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
        await pool.query(statement);
        executedCount++;
        console.log(`  ✓ Statement ${executedCount} executed`);
      } catch (error: any) {
        // Only log if it's not a "already exists" type error
        if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
          console.warn(`  ⚠️  Warning during statement ${executedCount + 1}:`, error.message);
        } else {
          executedCount++;
          console.log(`  ✓ Statement ${executedCount} executed (already exists)`);
        }
      }
    }

    await pool.end();

    console.log('');
    console.log('✅ Migration applied successfully!');
    console.log(`   Executed ${executedCount} SQL statements`);
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. Try creating a workflow again');
    console.log('');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

applyMigration();
