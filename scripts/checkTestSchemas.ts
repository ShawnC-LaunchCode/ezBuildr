import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function checkTestSchemas() {
  const baseConnectionString = process.env.DATABASE_URL;

  if (!baseConnectionString) {
    throw new Error('DATABASE_URL not found in environment');
  }

  const client = new Client({ connectionString: baseConnectionString });

  try {
    await client.connect();
    console.log('Connected to database\\n');

    // Check for test schemas
    const result = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'test_schema_%' ORDER BY schema_name`
    );

    if (result.rows.length === 0) {
      console.log('✅ No test schemas found');
    } else {
      console.log(`Found ${result.rows.length} test schemas:`);
      result.rows.forEach((row: Record<string, unknown>) => console.log(`  - ${row.schema_name}`));
    }
  } catch (error: unknown) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkTestSchemas();
