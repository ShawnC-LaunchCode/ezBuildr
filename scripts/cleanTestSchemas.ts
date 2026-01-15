import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function cleanTestSchemas() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not defined');
        process.exit(1);
    }

    // Use direct connection (5432) for admin ops if on Neon
    let connectionString = process.env.DATABASE_URL;
    if (connectionString.includes('neon.tech') && !connectionString.includes('sslmode=require')) {
        connectionString += '?sslmode=require';
    }

    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('Connected to DB');

        // Find all test schemas
        const res = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'test_schema_w%'
    `);

        const schemas = res.rows.map(r => r.schema_name);
        console.log(`Found ${schemas.length} test schemas to drop.`);

        for (const schema of schemas) {
            console.log(`Dropping ${schema}...`);
            await client.query(`DROP SCHEMA "${schema}" CASCADE`);
        }

        console.log('All test schemas dropped.');
    } catch (err) {
        console.error('Error cleaning schemas:', err);
    } finally {
        await client.end();
    }
}

cleanTestSchemas();
