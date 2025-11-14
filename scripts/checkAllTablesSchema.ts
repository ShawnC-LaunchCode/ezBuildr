#!/usr/bin/env tsx
/**
 * Check all related tables schema
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkSchema() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('🔍 Checking all workflow-related tables...\n');

  const tables = ['workflows', 'sections', 'steps', 'logic_rules', 'workflow_runs'];

  for (const tableName of tables) {
    console.log(`\n📊 Table: ${tableName}`);
    console.log('='.repeat(50));

    try {
      const columns = await client(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = '${tableName}'
        ORDER BY ordinal_position
      `);

      if (columns.length === 0) {
        console.log('  ❌ TABLE DOES NOT EXIST');
      } else {
        console.table(columns);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

checkSchema();
