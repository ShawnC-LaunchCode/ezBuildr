import { config } from 'dotenv';
config({ override: true });
import { db, initializeDatabase } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
    await initializeDatabase();
    const res = await db.execute(sql`SELECT now(), current_timestamp`);
    console.log(res);
    process.exit(0);
}
run();
