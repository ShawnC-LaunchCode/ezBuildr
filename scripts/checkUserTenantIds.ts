import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const result = await pool.query('SELECT id, email, tenant_id FROM users LIMIT 5');
    console.log('Sample users:');
    result.rows.forEach((row: any) => {
      console.log(`  User: ${row.email}, tenantId: ${row.tenant_id || '(NULL)'}`);
    });
    await pool.end();
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
