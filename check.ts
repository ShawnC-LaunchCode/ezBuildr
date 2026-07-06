import { Pool } from 'pg';
import { config } from 'dotenv';
config({ override: true });

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT * FROM email_queue ORDER BY created_at DESC LIMIT 5;');
    if (res.rows.length === 0) {
      console.log("No emails waiting to be sent.");
    } else {
      console.log("Last 5 emails in queue:");
      console.log(JSON.stringify(res.rows, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
