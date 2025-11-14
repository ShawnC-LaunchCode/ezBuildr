#!/usr/bin/env tsx
/**
 * Check which migrations have been applied
 */

import { neon } from '@neondatabase/serverless';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function checkMigrations() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('🔍 Checking migration status...\n');

  // Get all migration files
  const migrationDir = join(__dirname, '..', 'migrations');
  const files = await readdir(migrationDir);
  const migrations = files
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${migrations.length} migration files\n`);

  // Check each migration's key tables/columns
  const checks = [
    { name: '0000 - Base schema', check: 'surveys', type: 'table' },
    { name: '0001 - Remove participants', check: 'participants', type: 'table', shouldNotExist: true },
    { name: '0002 - Mode columns', check: 'mode_override', type: 'column', table: 'workflows' },
    { name: '0003 - Step aliases', check: 'alias', type: 'column', table: 'steps' },
    { name: '0004 - Teams and ACLs', check: 'teams', type: 'table' },
    { name: '0005 - Transform phases', check: 'phase', type: 'column', table: 'transform_blocks' },
    { name: '0006 - Updated at', check: 'updated_at', type: 'column', table: 'workflows' },
    { name: '0007 - JS question type', check: 'js', type: 'enum_value', enum: 'question_type' },
    { name: '0008 - Virtual steps', check: 'is_virtual', type: 'column', table: 'steps' },
    { name: '0009 - Multi-tenant', check: 'tenants', type: 'table' },
    { name: '0009a - Secrets types', check: 'secret_type', type: 'enum' },
    { name: '0010 - Trace and error', check: 'trace_id', type: 'column', table: 'workflow_runs' },
    { name: '0011 - Analytics/SLI', check: 'metrics_events', type: 'table' },
    { name: '0012 - Intake portal', check: 'is_public', type: 'column', table: 'workflows' },
    { name: '0013 - Versioning', check: 'pinned_version_id', type: 'column', table: 'workflows' },
    { name: '0014 - Intake config', check: 'intake_config', type: 'column', table: 'workflows' },
    { name: '0015 - Review/eSign', check: 'review_tasks', type: 'table' },
    { name: '0016 - Connections', check: 'connections', type: 'table' },
    { name: '0017 - Branding/domains', check: 'custom_domains', type: 'table' },
    { name: '0018 - Collections', check: 'collections', type: 'table' },
    { name: '0019 - Collection blocks', check: 'collection_block_type', type: 'enum' },
    { name: '0020 - Page conditions', check: 'visible_if', type: 'column', table: 'sections' },
    { name: '0021 - Question conditions', check: 'visible_if', type: 'column', table: 'steps' },
    { name: '0022 - Repeater type', check: 'repeater_config', type: 'column', table: 'steps' },
    { name: '0023 - Document engine', check: 'templates', type: 'table' },
    { name: '0024 - Fix workflows', check: 'name', type: 'column', table: 'workflows' },
    { name: '0025 - Fix schema', check: 'owner_id', type: 'column', table: 'projects' },
  ];

  for (const checkItem of checks) {
    try {
      let exists = false;

      if (checkItem.type === 'table') {
        const result = await client(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = '${checkItem.check}'
        `);
        exists = result.length > 0;
      } else if (checkItem.type === 'column') {
        const result = await client(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = '${checkItem.table}'
          AND column_name = '${checkItem.check}'
        `);
        exists = result.length > 0;
      } else if (checkItem.type === 'enum') {
        const result = await client(`
          SELECT typname
          FROM pg_type
          WHERE typname = '${checkItem.check}'
        `);
        exists = result.length > 0;
      } else if (checkItem.type === 'enum_value') {
        const result = await client(`
          SELECT e.enumlabel
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = '${checkItem.enum}'
          AND e.enumlabel = '${checkItem.check}'
        `);
        exists = result.length > 0;
      }

      if (checkItem.shouldNotExist) {
        exists = !exists; // Invert for "should not exist" checks
      }

      if (exists) {
        console.log(`✅ ${checkItem.name}`);
      } else {
        console.log(`❌ ${checkItem.name} - MISSING`);
      }
    } catch (error: any) {
      console.log(`⚠️  ${checkItem.name} - ERROR: ${error.message}`);
    }
  }

  console.log('\n✅ Migration check complete!');
}

checkMigrations();
