import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

async function countMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
    `);

    console.log(`\n✅ Total migrations applied: ${result.rows[0].count}\n`);
  } catch (error) {
    console.error('Error counting migrations:', error);
  } finally {
    await pool.end();
  }
}

countMigrations().catch(console.error);
