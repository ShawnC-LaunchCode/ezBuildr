
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
}

async function runRawMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: true
    });

    const client = await pool.connect();

    try {
        console.log("Connected to DB via pg driver directly.");

        await client.query('BEGIN');

        console.log("Updating projects...");
        await client.query(`ALTER TABLE "projects" ALTER COLUMN "owner_uuid" TYPE VARCHAR;`);

        console.log("Updating workflows...");
        await client.query(`ALTER TABLE "workflows" ALTER COLUMN "owner_uuid" TYPE VARCHAR;`);

        console.log("Updating datavault_databases...");
        await client.query(`ALTER TABLE "datavault_databases" ALTER COLUMN "owner_uuid" TYPE VARCHAR;`);

        console.log("Updating workflow_runs...");
        await client.query(`ALTER TABLE "workflow_runs" ALTER COLUMN "owner_uuid" TYPE VARCHAR;`);

        await client.query('COMMIT');
        console.log("✅ COMMIT successful.");

    } catch (err: unknown) {
        console.error("❌ Error running migration:", err instanceof Error ? err.message : String(err));
        await client.query('ROLLBACK');
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runRawMigration();
