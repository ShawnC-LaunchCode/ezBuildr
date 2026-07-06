import { Pool } from 'pg';
import { config } from 'dotenv';
config({ override: true });

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("Dropping survey_templates table...");
    await pool.query('DROP TABLE IF EXISTS survey_templates CASCADE;');
    console.log("Dropped survey_templates.");

    console.log("Cleaning up ai_settings columns...");
    await pool.query('ALTER TABLE ai_settings DROP COLUMN IF EXISTS created_at CASCADE;');
    console.log("Cleaned ai_settings.");
    
    console.log("Cleaning up system columns...");
    await pool.query('ALTER TABLE system DROP COLUMN IF EXISTS total_surveys_created CASCADE;');
    await pool.query('ALTER TABLE system DROP COLUMN IF EXISTS total_surveys_deleted CASCADE;');
    console.log("Cleaned system.");
    
    console.log("Done!");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
