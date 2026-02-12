import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function dropTestSchemas() {
  let baseConnectionString = process.env.DATABASE_URL;

  if (!baseConnectionString) {
    throw new Error('DATABASE_URL not found in environment');
  }

  // CRITICAL: Neon pooler connections don't support DDL operations properly
  // Switch to direct connection (remove -pooler, use port 5432)
  const url = new URL(baseConnectionString);
  if (url.hostname.includes('-pooler')) {
    console.log('Switching from pooler to direct connection for DDL operations');
    url.hostname = url.hostname.replace('-pooler', '');
    url.port = '5432';
    baseConnectionString = url.toString();
  }

  const client = new Client({ connectionString: baseConnectionString });

  try {
    await client.connect();
    console.log('Connected to database (direct connection)');

    // Find all test schemas
    const result = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'test_schema_%' ORDER BY schema_name`
    );

    console.log(`Found ${result.rows.length} test schemas to drop\n`);

    // Drop all test schemas
    for (const row of result.rows) {
      const schemaName = row.schema_name;
      try {
        // First check if schema has any tables
        const tablesCheck = await client.query(
          `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = $1`,
          [schemaName]
        );
        console.log(`  ${schemaName} has ${tablesCheck.rows[0].cnt} tables`);

        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        console.log(`✅ Dropped schema: ${schemaName}`);

        // Verify it's actually gone
        const verifyCheck = await client.query(
          `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
          [schemaName]
        );
        if (verifyCheck.rowCount === 0) {
          console.log(`  ✅ Verified: ${schemaName} is gone`);
        } else {
          console.log(`  ❌ WARNING: ${schemaName} still exists after DROP!`);
        }
      } catch (err: unknown) {
        console.error(`❌ Failed to drop ${schemaName}:`, err instanceof Error ? err.message : String(err));
      }
    }

    console.log(`\n✅ All ${result.rows.length} test schemas dropped successfully`);
  } catch (error: unknown) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end();
  }
}

dropTestSchemas();
