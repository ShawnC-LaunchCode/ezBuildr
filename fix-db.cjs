const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await pool.query('ALTER TABLE public.workflows DROP CONSTRAINT "workflows_pinned_version_fk" CASCADE;');
    console.log('Constraint dropped');
  } catch(e) {
    console.log('Error dropping constraint:', e.message);
  }
  process.exit();
}
main();
