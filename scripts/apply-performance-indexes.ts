/**
 * Apply Performance Indexes from Migration 0061
 *
 * CREATE INDEX CONCURRENTLY cannot run in a transaction,
 * so we execute each index creation individually.
 */

import * as fs from 'fs';

import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function applyPerformanceIndexes() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Applying performance indexes from migration 0061...\n');

    // Read the migration file
    const migrationSql = fs.readFileSync('./migrations/0061_optimize_query_performance.sql', 'utf-8');

    // Extract all CREATE INDEX statements
    const indexStatements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.startsWith('CREATE INDEX'));

    console.log(`Found ${indexStatements.length} index creation statements\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const statement of indexStatements) {
      // Extract index name for logging
      const match = statement.match(/CREATE INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?(\w+)/);
      const indexName = match ? match[1] : 'unknown';

      try {
        await pool.query(statement);
        console.log(`✅ Created index: ${indexName}`);
        successCount++;
      } catch (error: unknown) {
        const pgError = error as { code?: string; message?: string };
        if (pgError.code === '42P07') {
          // Index already exists
          console.log(`⏭️  Skipped (already exists): ${indexName}`);
          skipCount++;
        } else {
          console.error(`❌ Error creating ${indexName}:`, pgError.message);
          errorCount++;
        }
      }
    }

    console.log(`\n${  '='.repeat(60)}`);
    console.log('📊 Summary:');
    console.log(`   ✅ Created: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount === 0) {
      console.log('\n✅ All performance indexes applied successfully!');
    } else {
      console.log(`\n⚠️  ${errorCount} indexes failed to create`);
    }

  } catch (error) {
    console.error('❌ Failed to apply indexes:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

applyPerformanceIndexes()
  .then(() => {
    console.log('\n✨ Performance optimization complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed to apply performance indexes:', error);
    process.exit(1);
  });
