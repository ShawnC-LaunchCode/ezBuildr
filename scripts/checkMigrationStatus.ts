import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

async function checkMigrationStatus() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(`
      SELECT * FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log('\n📊 Applied Migrations:');
    console.log('─'.repeat(80));
    result.rows.forEach(row => {
      console.log(`✅ ${row.hash} - ${new Date(row.created_at).toLocaleString()}`);
    });
    console.log('─'.repeat(80));
    console.log(`Total: ${result.rows.length} migrations applied\n`);
  } catch (error: any) {
    if (error.code === '42P01') {
      console.log('❌ Migration table does not exist. No migrations have been applied yet.');
    } else {
      console.error('Error checking migration status:', error);
    }
  } finally {
    await pool.end();
  }
}

checkMigrationStatus().catch(console.error);
