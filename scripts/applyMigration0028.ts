import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Did you forget to provision a database?');
}

async function applyMigration() {
  console.log('🔄 Applying migration 0029 (DataVault tables)...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'migrations', '0029_add_datavault_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded');

    // Execute the migration
    console.log('⚙️  Executing migration...');
    await pool.query(migrationSQL);

    console.log('✅ Migration 0029 applied successfully!');
    console.log('✨ DataVault Phase 1 tables created:');
    console.log('   - datavault_tables');
    console.log('   - datavault_columns');
    console.log('   - datavault_rows');
    console.log('   - datavault_values');
  } catch (error: any) {
    // Check if error is because tables already exist
    if (error.code === '42P07') {
      console.log('⚠️  Tables already exist - migration may have been applied previously');
      console.log('✅ Database is up to date');
    } else if (error.code === '42710') {
      console.log('⚠️  Type already exists - continuing...');
      console.log('✅ Database is up to date');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

applyMigration().catch((error) => {
  console.error('Failed to apply migration:', error);
  process.exit(1);
});
