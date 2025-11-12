import 'dotenv/config';
import { getDb, dbInitPromise } from '../server/db';
import { sql } from 'drizzle-orm';

async function checkWorkflowsTable() {
  console.log('Checking workflows table structure...');

  // Wait for database to initialize
  await dbInitPromise;
  const db = getDb();

  try {
    // Get table structure
    const result = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'workflows'
      ORDER BY ordinal_position;
    `);

    console.log('\nWorkflows table columns:');
    console.log('========================');
    for (const row of result.rows) {
      console.log(`${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    }

  } catch (error) {
    console.error('❌ Error checking table:', error);
    process.exit(1);
  }

  process.exit(0);
}

checkWorkflowsTable();
