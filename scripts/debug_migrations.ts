import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set.');
}

async function debugMigrations() {
    console.log('🕵️‍♀️ Debugging migrations...');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const db = drizzle(pool);

    try {
        // 1. Check if the table exists and what it is called.
        // Drizzle default is __drizzle_migrations
        const checkTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'drizzle'
    `);

        console.log('Found tables in drizzle schema:', checkTable.rows);

        // Drizzle usually stores migrations in `drizzle.__drizzle_migrations` or `public.__drizzle_migrations`?
        // Let's check public schema too just in case.
        const checkPublicTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%migration%'
    `);
        console.log('Found migration-like tables in public schema:', checkPublicTable.rows);

        // Assuming it is drizzle.__drizzle_migrations (based on common drizzle setup) or we find it.
        // Let's try to select from the most likely candidate.

        let tableName = 'drizzle.__drizzle_migrations';
        // If not found in drizzle schema, maybe we need to find where it is.
        // For now, let's just try to query it.

        // Attempt to list recent migrations
        try {
            const res = await pool.query(`SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 10`);
            console.log('Recent migrations in drizzle.__drizzle_migrations:', res.rows);
        } catch (e: unknown) {
            const error = e as { message?: string };
            console.log('Could not query drizzle.__drizzle_migrations:', error.message ?? String(e));
            try {
                const res = await pool.query(`SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10`);
                console.log('Recent migrations in public.__drizzle_migrations:', res.rows);
                tableName = '__drizzle_migrations';
            } catch (e2: unknown) {
                console.log('Could not query public.__drizzle_migrations either.');
            }
        }

        // Checking specifically for the ones we modified
        console.log('-----');
        console.log('To force re-run, we should delete entries for: 0040, 0048, 0049');

        // Delete the last 15 migrations to force re-run of the problematic ones (0040+)
        // The max ID seen was 32, so deleting > 17 covers the recent batch.
        const deleteRes = await pool.query(`
            DELETE FROM drizzle.__drizzle_migrations 
            WHERE id > 17
        `);
        console.log(`Deleted ${deleteRes.rowCount ?? 0} migration entries from drizzle.__drizzle_migrations.`);

    } catch (error: unknown) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    } finally {
        await pool.end();
    }
}

debugMigrations();
