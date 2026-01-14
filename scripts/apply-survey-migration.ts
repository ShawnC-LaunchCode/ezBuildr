/**
 * Apply Survey System Removal Migration (0062)
 *
 * This migration:
 * 1. Creates archive tables for all survey data
 * 2. Copies data to archive tables
 * 3. Drops the original survey tables
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function applySurveyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Applying survey system removal migration (0062)...\n');

    // Read the migration file
    const migrationSql = fs.readFileSync('./migrations/0062_archive_and_remove_surveys.sql', 'utf-8');

    // Split into sections
    const sections = [
      'STEP 1: Create Archive Tables',
      'STEP 2: Copy Data to Archive Tables',
      'STEP 3: Drop Survey Tables',
      'STEP 4: Drop Survey-Related Enums',
      'STEP 5: Add Migration Tracking'
    ];

    // Execute the entire migration in a single transaction
    // (except for CONCURRENT indexes which aren't in this migration)
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      console.log('📦 Step 1: Creating archive tables...');
      await client.query(migrationSql);

      await client.query('COMMIT');
      console.log('✅ Migration 0062 applied successfully!\n');

      // Check what was archived
      const result = await client.query(`
        SELECT
          'surveys_archive' as table_name, COUNT(*) as row_count FROM surveys_archive
        UNION ALL
        SELECT 'survey_pages_archive', COUNT(*) FROM survey_pages_archive
        UNION ALL
        SELECT 'questions_archive', COUNT(*) FROM questions_archive
        UNION ALL
        SELECT 'responses_archive', COUNT(*) FROM responses_archive
        UNION ALL
        SELECT 'answers_archive', COUNT(*) FROM answers_archive
        ORDER BY table_name
      `);

      console.log('📊 Archived data:');
      for (const row of result.rows) {
        console.log(`   ${row.table_name}: ${row.row_count} rows`);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('❌ Failed to apply migration:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

applySurveyMigration()
  .then(() => {
    console.log('\n✅ Survey system successfully removed!');
    console.log('📋 Archive tables created with all historical data preserved.');
    console.log('\n✨ Migration complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
