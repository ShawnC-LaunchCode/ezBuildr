import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config();

/**
 * Migrations need DDL, and from RLS-4 onward `DATABASE_URL` is the
 * least-privilege APPLICATION role — which deliberately cannot create schemas
 * or tables. So this prefers `MIGRATION_DATABASE_URL` (the owner) and falls
 * back to `DATABASE_URL` for every environment that has not cut over yet.
 *
 * Found the hard way: the first dev cutover repointed `DATABASE_URL` at the app
 * role and the deploy died on `CREATE SCHEMA IF NOT EXISTS "drizzle"`, because
 * `npm run db:migrate` runs as part of container start. Production would have
 * failed identically.
 */
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    'MIGRATION_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?'
  );
}

async function runMigrations() {
  console.log(
    process.env.MIGRATION_DATABASE_URL
      ? '🔄 Running database migrations (using MIGRATION_DATABASE_URL)...'
      : '🔄 Running database migrations...'
  );

  const pool = new Pool({
    connectionString: migrationUrl,
  });

  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('✅ Migrations completed successfully!');
  } catch (error: unknown) {
    console.error('❌ Migration failed:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  console.error('Failed to run migrations:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
