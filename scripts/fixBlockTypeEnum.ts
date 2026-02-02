
import { sql } from 'drizzle-orm';

import { db, dbInitPromise } from '../server/db';

async function fixBlockTypeEnum() {
    await dbInitPromise;
    console.log('Manually adding read_table and list_tools to block_type enum...');
    try {
        await db.execute(sql`ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'read_table'`);
        await db.execute(sql`ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'list_tools'`);
        console.log('Successfully updated enum');
    } catch (error) {
        console.error('Error updating enum:', error);
    }
}

fixBlockTypeEnum();
