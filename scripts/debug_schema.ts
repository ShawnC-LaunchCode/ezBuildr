
import { sql } from "drizzle-orm";

import { db, initializeDatabase } from "../server/db";

async function checkSchema() {
    await initializeDatabase();
    try {
        const result = await db.execute(sql`
      SELECT table_schema, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'workflows'
      AND table_schema = 'public'
      AND column_name IN ('creator_id', 'owner_id', 'project_id', 'id');
    `);

        console.log("Workflows Table Schema:");
        console.log(JSON.stringify(result.rows, null, 2));

        const usersResult = await db.execute(sql`
      SELECT table_schema, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND table_schema = 'public'
      AND column_name = 'id';
    `);

        console.log("Users Table Schema:");
        console.log(JSON.stringify(usersResult.rows, null, 2));

        process.exit(0);
    } catch (error: unknown) {
        console.error("Error checking schema:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

checkSchema();
