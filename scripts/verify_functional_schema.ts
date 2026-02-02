
import { sql } from "drizzle-orm";

import { db, initializeDatabase } from "../server/db";

async function verifyInsert() {
    await initializeDatabase();
    try {
        console.log("Attempting to inserting a test project with string owner_uuid...");

        // We can't really insert a full project easily due to foreign keys (creatorId etc), 
        // but we can try to update an existing one or just rely on the error message during a dummy select/cast?

        // Better test: Try to cast a uuid column to text in a select, that always works. 
        // Try to select where owner_uuid = 'some-string'

        // valid uuid: 00000000-0000-0000-0000-000000000000
        // invalid uuid: not-a-uuid

        const result = await db.execute(sql`
      SELECT count(*) as count 
      FROM projects 
      WHERE owner_uuid = 'not-a-uuid-string'
    `);

        console.log("✅ Success! Query with string owner_uuid worked. Column must be VARCHAR.");
        process.exit(0);
    } catch (error: any) {
        if (error.code === '22P02') {
            console.error("❌ Failed! Postgres error 22P02 detected. Column is likely still UUID.");
        } else {
            console.error("❌ Error during verification:", error);
        }
        process.exit(1);
    }
}

verifyInsert();
