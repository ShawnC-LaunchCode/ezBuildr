// Simple script to check DataVault table schema
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load DATABASE_URL from .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^DATABASE_URL=(.*)$/m);
  if (match) {
    process.env.DATABASE_URL = match[1];
  }
}

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Checking datavault_tables schema...\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'datavault_tables'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Table "datavault_tables" does not exist!');
      console.log('You need to run the migration: npx tsx scripts/applyDatavaultMigrations.ts');
      return;
    }

    console.log('✅ Table "datavault_tables" exists\n');

    // Get column information
    const columns = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'datavault_tables'
      ORDER BY ordinal_position
    `);

    console.log('Columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check specifically for tenant_id
    const hasTenantId = columns.rows.some(col => col.column_name === 'tenant_id');

    console.log('\n');
    if (hasTenantId) {
      console.log('✅ Column "tenant_id" exists');
    } else {
      console.log('❌ Column "tenant_id" is MISSING!');
      console.log('\nThis is causing the 500 error. The table was created without the tenant_id column.');
      console.log('Solution: Drop and recreate the table, or add the column manually.\n');
      console.log('To fix:');
      console.log('  1. Run: DROP TABLE IF EXISTS datavault_values CASCADE;');
      console.log('  2. Run: DROP TABLE IF EXISTS datavault_rows CASCADE;');
      console.log('  3. Run: DROP TABLE IF EXISTS datavault_columns CASCADE;');
      console.log('  4. Run: DROP TABLE IF EXISTS datavault_tables CASCADE;');
      console.log('  5. Run: npx tsx scripts/applyDatavaultMigrations.ts');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
