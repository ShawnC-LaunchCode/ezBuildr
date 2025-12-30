
import { db, initializeDatabase } from "../server/db";
import { users, systemStats, auditLogs, surveys, workspaceInvitations, workflows, workflowVersions } from "@shared/schema";
import { count, eq, like, inArray, or, sql } from "drizzle-orm";
import { systemStatsRepository } from "../server/repositories/SystemStatsRepository";

async function main() {
    await initializeDatabase();
    console.log("Cleanup Users Script");
    console.log("====================");

    // Argument parsing (simple)
    const args = process.argv.slice(2);
    const pattern = args[0]; // e.g. "%@test.com"

    if (!pattern) {
        console.error("Please provide a SQL ILIKE pattern for email deletion. Example: 'test-%'");
        process.exit(1);
    }

    // Preview deletion
    const usersToDelete = await db
        .select()
        .from(users)
        .where(like(users.email, pattern));

    console.log(`Found ${usersToDelete.length} users matching pattern '${pattern}'`);

    if (usersToDelete.length === 0) {
        console.log("No users found. Exiting.");
        process.exit(0);
    }

    const userIds = usersToDelete.map(u => u.id);

    // Snapshot stats before
    const statsBefore = await systemStatsRepository.getStats();
    console.log(`Stats Before: Lifetime Created=${statsBefore.totalUsersCreated}`);

    // 1. Nullify audit_events (using raw SQL as table is not in schema)
    // We use subquery logic to avoid massive IN clause
    console.log("Nullifying audit_events...");
    // Note: pattern is like '%@example.com'.
    await db.execute(sql`UPDATE audit_events SET actor_id = NULL WHERE actor_id IN (SELECT id FROM users WHERE email LIKE ${pattern})`);

    // 2. Nullify audit logs
    console.log("Nullifying audit logs...");
    await db.update(auditLogs)
        .set({ userId: null })
        .where(inArray(auditLogs.userId, userIds));

    // 3. Delete dependent surveys
    console.log("Deleting dependent surveys...");
    await db.delete(surveys).where(inArray(surveys.creatorId, userIds));

    // 4. Delete dependent invitations
    console.log("Deleting dependent workspace invitations...");
    await db.delete(workspaceInvitations).where(inArray(workspaceInvitations.invitedBy, userIds));

    // 5. Delete workflows (Creator or Owner)
    // This will cascade delete versions belonging to these workflows
    console.log("Deleting dependent workflows...");
    await db.delete(workflows).where(
        or(
            inArray(workflows.creatorId, userIds),
            inArray(workflows.ownerId, userIds)
        )
    );

    // 6. Delete workflow versions created by users (on workflows owned by OTHERS)
    console.log("Deleting remaining workflow versions...");
    // Note: versions belonging to the workflows in step 4 are already gone. 
    // This catches stragglers.
    await db.delete(workflowVersions).where(inArray(workflowVersions.createdBy, userIds));

    // 7. Delete users
    console.log("Deleting users...");
    await db.delete(users).where(inArray(users.id, userIds));

    // Snapshot stats after
    const statsAfter = await systemStatsRepository.getStats();
    console.log(`Stats After: Lifetime Created=${statsAfter.totalUsersCreated}`);

    if (statsAfter.totalUsersCreated >= statsBefore.totalUsersCreated) {
        console.log("SUCCESS: Lifetime stats preserved.");
    } else {
        console.error("WARNING: Lifetime stats decremented! (This should not happen)");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
});
