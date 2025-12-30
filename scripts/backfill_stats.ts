
import { db, initializeDatabase } from "../server/db";
import { users, workflows, systemStats } from "@shared/schema";
import { count, eq } from "drizzle-orm";

async function main() {
    await initializeDatabase();
    console.log("Starting backfill of system stats...");

    // Get current counts directly from tables
    const [userCount] = await db.select({ count: count() }).from(users);
    const [workflowCount] = await db.select({ count: count() }).from(workflows);

    const currentUsers = userCount?.count || 0;
    const currentWorkflows = workflowCount?.count || 0;

    console.log(`Found ${currentUsers} users and ${currentWorkflows} workflows.`);

    // Update system_stats
    // Assuming ID 1 exists (it should if app has run, or upsert)

    // First ensure row exists
    const existingStats = await db.select().from(systemStats).where(eq(systemStats.id, 1));

    if (existingStats.length === 0) {
        console.log("Initializing system_stats row...");
        await db.insert(systemStats).values({
            id: 1,
            totalUsersCreated: currentUsers,
            totalWorkflowsCreated: currentWorkflows,
        });
    } else {
        console.log("Updating existing system_stats...");
        await db.update(systemStats)
            .set({
                totalUsersCreated: currentUsers,
                totalWorkflowsCreated: currentWorkflows,
                updatedAt: new Date()
            })
            .where(eq(systemStats.id, 1));
    }

    console.log("Backfill complete.");
    process.exit(0);
}

main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
