import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function dropTestSchemas() {
  const baseConnectionString = process.env.DATABASE_URL;

  if (!baseConnectionString) {
    throw new Error('DATABASE_URL not found in environment');
  }

  const client = new Client({ connectionString: baseConnectionString });

  try {
    await client.connect();
    console.log('Connected to database');

    // Find all test schemas
    const result = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'test_schema_%' ORDER BY schema_name`
    );

    console.log(`Found ${result.rows.length} test schemas to drop\\n`);

    // Drop all test schemas
    for (const row of result.rows) {
      const schemaName = row.schema_name;
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        console.log(`✅ Dropped schema: ${schemaName}`);
      } catch (err: unknown) {
        console.error(`❌ Failed to drop ${schemaName}:`, err instanceof Error ? err.message : String(err));
      }
    }

    console.log(`\\n✅ All ${result.rows.length} test schemas dropped successfully`);
  } catch (error: unknown) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

dropTestSchemas();
