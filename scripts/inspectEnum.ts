
import { sql } from 'drizzle-orm';

import { db, dbInitPromise } from '../server/db';

async function inspectEnum() {
    await dbInitPromise;
    try {
        const result = await db.execute(sql`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'block_type'
    `);
        console.log('Enum values:', result.rows);
    } catch (error: unknown) {
        console.error('Error inspecting enum:', error instanceof Error ? error.message : String(error));
    }
}

inspectEnum();
