
import { sql } from "drizzle-orm";

import { db, initializeDatabase } from "../server/db";

async function checkOwnerUuid() {
    await initializeDatabase();
    try {
        const result = await db.execute(sql`
      SELECT table_schema, table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE column_name = 'owner_uuid'
      AND table_schema = 'public';
    `);

        console.log("Owner UUID Columns:");
        console.table(result.rows);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkOwnerUuid();
