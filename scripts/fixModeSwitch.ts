#!/usr/bin/env tsx
/**
 * Fix Mode Switching Issue
 *
 * This script ensures all required columns exist in the workflows table
 * to support mode switching functionality.
 *
 * Adds:
 * - mode_override column (if missing)
 * - owner_id column (if missing)
 *
 * Usage:
 *   npx tsx scripts/fixModeSwitch.ts
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function fixModeSwitch() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('');
    console.error('Please set DATABASE_URL in your .env file or environment');
    process.exit(1);
  }

  console.log('🔧 Fixing Mode Switch Functionality');
  console.log('');
  console.log('This script will:');
  console.log('  ✓ Check for mode_override column in workflows table');
  console.log('  ✓ Check for owner_id column in workflows table');
  console.log('  ✓ Add missing columns if needed');
  console.log('  ✓ Add necessary constraints and indices');
  console.log('');
  console.log('📍 Database:', dbUrl.split('@')[1] || 'hidden');
  console.log('');

  try {
    const client = neon(dbUrl);

    // Check if mode_override column exists
    console.log('📋 Checking mode_override column...');
    const modeOverrideExists = await client(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'workflows'
      AND column_name = 'mode_override'
    `);

    if (modeOverrideExists.length === 0) {
      console.log('  Adding mode_override column...');
      await client(`ALTER TABLE workflows ADD COLUMN mode_override TEXT`);

      // Add check constraint
      await client(`
        ALTER TABLE workflows
        ADD CONSTRAINT workflows_mode_override_check
        CHECK (mode_override IS NULL OR mode_override IN ('easy', 'advanced'))
      `).catch(err => {
        if (!err.message?.includes('already exists')) {
          throw err;
        }
      });

      // Add index
      await client(`CREATE INDEX IF NOT EXISTS idx_workflows_mode_override ON workflows(mode_override)`);

      console.log('  ✅ mode_override column added');
    } else {
      console.log('  ✅ mode_override column already exists');
    }

    // Check if owner_id column exists
    console.log('📋 Checking owner_id column...');
    const ownerIdExists = await client(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'workflows'
      AND column_name = 'owner_id'
    `);

    if (ownerIdExists.length === 0) {
      console.log('  Adding owner_id column...');
      await client(`ALTER TABLE workflows ADD COLUMN owner_id VARCHAR`);

      // Backfill owner_id with creator_id
      console.log('  Backfilling owner_id with creator_id...');
      await client(`UPDATE workflows SET owner_id = creator_id WHERE owner_id IS NULL`);

      // Make owner_id NOT NULL
      await client(`ALTER TABLE workflows ALTER COLUMN owner_id SET NOT NULL`);

      // Add foreign key constraint
      await client(`
        ALTER TABLE workflows
        ADD CONSTRAINT workflows_owner_id_users_id_fk
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE no action ON UPDATE no action
      `).catch(err => {
        if (!err.message?.includes('already exists')) {
          throw err;
        }
      });

      // Add index
      await client(`CREATE INDEX IF NOT EXISTS workflows_owner_idx ON workflows(owner_id)`);

      console.log('  ✅ owner_id column added');
    } else {
      console.log('  ✅ owner_id column already exists');
    }

    // Verify default_mode column exists in users table
    console.log('📋 Checking default_mode column in users table...');
    const defaultModeExists = await client(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'default_mode'
    `);

    if (defaultModeExists.length === 0) {
      console.log('  Adding default_mode column...');
      await client(`ALTER TABLE users ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'easy'`);

      // Add check constraint
      await client(`
        ALTER TABLE users
        ADD CONSTRAINT users_default_mode_check
        CHECK (default_mode IN ('easy', 'advanced'))
      `).catch(err => {
        if (!err.message?.includes('already exists')) {
          throw err;
        }
      });

      // Add index
      await client(`CREATE INDEX IF NOT EXISTS idx_users_default_mode ON users(default_mode)`);

      console.log('  ✅ default_mode column added');
    } else {
      console.log('  ✅ default_mode column already exists');
    }

    console.log('');
    console.log('✅ Mode switch fix completed successfully!');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server if it\'s running');
    console.log('   2. Try switching modes again');
    console.log('   3. The error should be resolved');
    console.log('');

  } catch (error: any) {
    console.error('❌ Fix failed:', error.message);
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
    console.error('   - Check if workflows table exists');
    process.exit(1);
  }
}

fixModeSwitch();
