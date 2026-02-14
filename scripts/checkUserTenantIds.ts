import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const result = await pool.query('SELECT id, email, tenant_id FROM users LIMIT 5');
    console.log('Sample users:');
    result.rows.forEach((row: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      console.log(`  User: ${row.email}, tenantId: ${row.tenant_id ?? '(NULL)'}`);
    });
    await pool.end();
  } catch (error: unknown) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();
