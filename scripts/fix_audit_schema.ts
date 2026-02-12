
import { sql } from "drizzle-orm";

import { db } from "../server/db";

async function main() {
    console.log("Altering audit_logs table...");
    try {
        await db.execute(sql`ALTER TABLE audit_logs ALTER COLUMN workspace_id DROP NOT NULL;`);
        console.log("Successfully altered audit_logs table.");
    } catch (error: unknown) {
        console.error("Failed to alter table:", error instanceof Error ? error.message : String(error));
    }
    process.exit(0);
}

main();
