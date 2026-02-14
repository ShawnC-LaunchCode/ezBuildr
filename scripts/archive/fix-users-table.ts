import { sql } from 'drizzle-orm';

// eslint-disable-next-line import/no-unresolved
import { getDb, dbInitPromise } from '../server/db';

async function fixUsersTable() {
  try {
    console.log('Initializing database connection...');
    await dbInitPromise;

    const db = getDb();
    console.log('Adding default_mode column to users table...');

    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS default_mode TEXT DEFAULT 'easy' NOT NULL;
    `);

    console.log('✓ Successfully added default_mode column');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing users table:', error);
    process.exit(1);
  }
}

fixUsersTable();
