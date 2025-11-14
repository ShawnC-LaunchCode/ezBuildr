#!/usr/bin/env tsx
/**
 * Check workflows table schema
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

  console.log('🔍 Checking workflows table schema...\n');

  // Get all columns from workflows table
  const columns = await client(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'workflows'
    ORDER BY ordinal_position
  `);

  console.log('📊 Workflows table columns:');
  console.table(columns);

  // Check specifically for the columns the code expects
  const expectedColumns = [
    'id',
    'title',
    'description',
    'creator_id',
    'owner_id',
    'mode_override',
    'public_link',
    'name',
    'project_id',
    'current_version_id',
    'is_public',
    'slug',
    'require_login',
    'intake_config',
    'pinned_version_id',
    'status',
    'created_at',
    'updated_at'
  ];

  console.log('\n✓ Checking expected columns:');
  const columnNames = columns.map((c: any) => c.column_name);

  for (const col of expectedColumns) {
    if (columnNames.includes(col)) {
      console.log(`  ✅ ${col}`);
    } else {
      console.log(`  ❌ ${col} - MISSING`);
    }
  }

  console.log('\n📝 Extra columns not in expected list:');
  for (const col of columnNames) {
    if (!expectedColumns.includes(col)) {
      console.log(`  ⚠️  ${col}`);
    }
  }
}

checkSchema();
