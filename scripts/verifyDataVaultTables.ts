import dotenv from 'dotenv';
import { _drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

async function verifyTables() {
  console.log('🔍 Verifying DataVault tables...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name LIKE 'datavault_%'
      ORDER BY table_name
    `);

    if (result.rows.length === 0) {
      console.log('❌ No DataVault tables found!');
      console.log('Run: npx tsx scripts/applyMigration0028.ts');
      process.exit(1);
    }

    console.log('✅ DataVault tables found:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    console.log();

    // Also check for the enum type
    const enumCheck = await pool.query(`
      SELECT typname
      FROM pg_type
      WHERE typname = 'datavault_column_type'
    `);

    if (enumCheck.rows.length > 0) {
      console.log('✅ datavault_column_type enum exists');
    }

    console.log('\n✨ DataVault migration verified successfully!');
  } catch (error: any) {
    console.error('❌ Error verifying tables:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

verifyTables().catch((error) => {
  console.error('Failed to verify tables:', error);
  process.exit(1);
});
