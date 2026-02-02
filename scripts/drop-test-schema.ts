
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

// Use DATABASE_URL
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
}

const client = new pg.Client({ connectionString });

async function main() {
    await client.connect();
    const workerId = process.env.VITEST_WORKER_ID || '0';
    const schemaName = `test_schema_w${workerId}`;

    console.log(`Dropping schema: ${schemaName}`);
    try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        console.log('Schema dropped successfully.');
    } catch (err) {
        console.error('Error dropping schema:', err);
    } finally {
        await client.end();
    }
}

main();
