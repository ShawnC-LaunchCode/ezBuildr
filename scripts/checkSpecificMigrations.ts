#!/usr/bin/env tsx
/**
 * Check specific migration items that are showing as missing
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('🔍 Checking specific items...\n');

  // Check 0007 - JS question type
  console.log('0007 - JS question type:');
  try {
    const result = await client(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'question_type'
      AND e.enumlabel = 'js'
    `);
    console.log(`  question_type enum exists: ${result.length > 0 ? 'YES' : 'NO'}`);
    console.log(`  'js' value: ${result.length > 0 ? 'YES' : 'NO'}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // Check if step_type enum exists instead
  try {
    const result = await client(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'step_type'
      ORDER BY e.enumlabel
    `);
    console.log(`  step_type enum exists: YES`);
    console.log(`  Values:`, result.map((r: any) => r.enumlabel).join(', '));
  } catch (e: any) {
    console.log(`  step_type enum: ${e.message}`);
  }

  // Check 0010 - trace_id
  console.log('\n0010 - Trace and error:');
  const tables = await client(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE '%run%'
    ORDER BY table_name
  `);
  console.log('  Tables with "run":', tables.map((t: any) => t.table_name).join(', '));

  try {
    const cols = await client(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workflow_runs'
    `);
    console.log('  workflow_runs columns:', cols.map((c: any) => c.column_name).join(', '));
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // Check 0015 - review_tasks
  console.log('\n0015 - Review/eSign:');
  try {
    const result = await client(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'review_tasks'
    `);
    console.log(`  review_tasks table: ${result.length > 0 ? 'YES' : 'NO'}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // Check 0017 - custom_domains
  console.log('\n0017 - Branding/domains:');
  try {
    const result = await client(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'custom_domains'
    `);
    console.log(`  custom_domains table: ${result.length > 0 ? 'YES' : 'NO'}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // Check 0019 - collection_block_type
  console.log('\n0019 - Collection blocks:');
  try {
    const result = await client(`
      SELECT typname FROM pg_type WHERE typname = 'collection_block_type'
    `);
    console.log(`  collection_block_type enum: ${result.length > 0 ? 'YES' : 'NO'}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // Check 0023 - templates
  console.log('\n0023 - Document engine:');
  try {
    const result = await client(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'templates'
    `);
    console.log(`  templates table: ${result.length > 0 ? 'YES' : 'NO'}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  // List all tables
  console.log('\n📊 All tables in database:');
  const allTables = await client(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  for (const t of allTables) {
    console.log(`  - ${t.table_name}`);
  }
}

check();
