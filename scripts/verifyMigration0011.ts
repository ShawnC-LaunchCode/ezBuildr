#!/usr/bin/env tsx
/**
 * Verify Migration 0011: Check if metrics tables exist
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function verifyMigration() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('🔍 Verifying Migration 0011...\n');

  const tables = [
    'metrics_events',
    'metrics_rollups',
    'sli_configs',
    'sli_windows'
  ];

  const enums = [
    'metrics_event_type',
    'rollup_bucket',
    'sli_window'
  ];

  // Check tables
  console.log('📊 Checking tables:');
  for (const table of tables) {
    try {
      const result = await client(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '${table}'
      `);

      if (result.length > 0) {
        console.log(`  ✅ ${table}`);
      } else {
        console.log(`  ❌ ${table} - MISSING`);
      }
    } catch (error) {
      console.log(`  ❌ ${table} - ERROR`);
    }
  }

  // Check enums
  console.log('\n🏷️  Checking enums:');
  for (const enumName of enums) {
    try {
      const result = await client(`
        SELECT typname
        FROM pg_type
        WHERE typname = '${enumName}'
      `);

      if (result.length > 0) {
        console.log(`  ✅ ${enumName}`);
      } else {
        console.log(`  ❌ ${enumName} - MISSING`);
      }
    } catch (error) {
      console.log(`  ❌ ${enumName} - ERROR`);
    }
  }

  console.log('\n✅ Verification complete!\n');
}

verifyMigration();
