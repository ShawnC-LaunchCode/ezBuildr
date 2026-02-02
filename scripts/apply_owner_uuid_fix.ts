
import { sql } from "drizzle-orm";

import { db, initializeDatabase } from "../server/db";

async function applyFix() {
    await initializeDatabase();
    try {
        console.log("Applying fix for owner_uuid type mismatch...");

        await db.execute(sql`ALTER TABLE "projects" ALTER COLUMN "owner_uuid" SET DATA TYPE VARCHAR;`);
        console.log("✅ projects table updated");

        await db.execute(sql`ALTER TABLE "workflows" ALTER COLUMN "owner_uuid" SET DATA TYPE VARCHAR;`);
        console.log("✅ workflows table updated");

        await db.execute(sql`ALTER TABLE "datavault_databases" ALTER COLUMN "owner_uuid" SET DATA TYPE VARCHAR;`);
        console.log("✅ datavault_databases table updated");

        await db.execute(sql`ALTER TABLE "workflow_runs" ALTER COLUMN "owner_uuid" SET DATA TYPE VARCHAR;`);
        console.log("✅ workflow_runs table updated");

        console.log("All tables updated successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error applying fix:", error);
        process.exit(1);
    }
}

applyFix();
