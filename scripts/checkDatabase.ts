import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const databaseId = '9159eca7-bf5f-4dae-8cba-aa3d5b3ed4dd';

(async () => {
  try {
    console.log(`Checking for database: ${databaseId}`);

    const result = await pool.query(
      'SELECT * FROM datavault_databases WHERE id = $1',
      [databaseId]
    );

    if (result.rows.length === 0) {
      console.log('❌ Database NOT FOUND');
    } else {
      console.log('✅ Database found:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    }

    console.log('\nAll databases:');
    const allDbs = await pool.query('SELECT id, name, tenant_id FROM datavault_databases LIMIT 10');
    allDbs.rows.forEach((row: any) => {
      console.log(`  - ${row.name} (${row.id}) - tenant: ${row.tenant_id}`);
    });

    await pool.end();
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
