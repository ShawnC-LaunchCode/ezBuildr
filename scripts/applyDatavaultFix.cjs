#!/usr/bin/env node
/**
 * Fix for DataVault table viewing error
 * Applies migrations 0029 and 0030 to create DataVault tables
 */

const fs = require('fs');
const path = require('path');

const { Pool } = require('pg');

// Load DATABASE_URL from .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^DATABASE_URL=(.*)$/m);
  if (match) {
    process.env.DATABASE_URL = match[1];
  }
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment or .env.local');
  process.exit(1);
}

async function applyDatavaultMigrations() {
  console.log('🔄 Checking and applying DataVault migrations...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Check if datavault_tables table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_tables'
      );
    `);

    if (!checkTable.rows[0].exists) {
      console.log('📄 DataVault tables do not exist, applying migration 0029...');

      // Read and apply migration 0029
      const migration29Path = path.join(__dirname, '../migrations/0029_add_datavault_tables.sql');
      const migration29SQL = fs.readFileSync(migration29Path, 'utf-8');

      console.log('⚙️  Executing migration 0029...');
      await pool.query(migration29SQL);

      console.log('✅ Migration 0029 applied successfully!\n');
    } else {
      console.log('✅ DataVault tables already exist\n');
    }

    // Check if auto_number column type exists
    const checkAutoNumber = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'datavault_column_type'
        AND e.enumlabel = 'auto_number'
      );
    `);

    if (!checkAutoNumber.rows[0].exists) {
      console.log('📄 Auto-number column type does not exist, applying migration 0030...');

      // Check if migration 0030 exists
      const migration30Path = path.join(__dirname, '../migrations/0030_add_auto_number_column_type.sql');
      if (fs.existsSync(migration30Path)) {
        const migration30SQL = fs.readFileSync(migration30Path, 'utf-8');

        console.log('⚙️  Executing migration 0030...');
        await pool.query(migration30SQL);

        console.log('✅ Migration 0030 applied successfully!\n');
      } else {
        console.log('ℹ️  Migration 0030 not found, skipping...\n');
      }
    } else {
      console.log('✅ Auto-number column type already exists\n');
    }

    // Verify the schema
    console.log('🔍 Verifying DataVault schema...');

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'datavault_%'
      ORDER BY table_name;
    `);

    console.log('📋 DataVault tables:');
    if (tables.rows.length === 0) {
      console.log('   ⚠️  No DataVault tables found!');
    } else {
      tables.rows.forEach((row) => {
        console.log(`   ✓ ${row.table_name}`);
      });
    }

    const enumValues = await pool.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'datavault_column_type'
      ORDER BY e.enumsortorder;
    `);

    console.log('\n📋 DataVault column types:');
    if (enumValues.rows.length === 0) {
      console.log('   ⚠️  No column types found!');
    } else {
      enumValues.rows.forEach((row) => {
        console.log(`   ✓ ${row.enumlabel}`);
      });
    }

    console.log('\n✅ DataVault schema is ready!');
    console.log('\n💡 Next step: Restart your dev server with: npm run dev');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
    throw error;
  } finally {
    await pool.end();
  }
}

applyDatavaultMigrations().catch((error) => {
  console.error('\nFailed to apply migrations:', error.message);
  process.exit(1);
});
