
import { db, initializeDatabase } from "../server/db";
import { sql } from "drizzle-orm";
import { auditLogs, analyticsEvents } from "@shared/schema";

async function main() {
    await initializeDatabase();
    console.log("Checking Log Table Counts...");

    // Count audit_logs (Schema)
    const auditLogsCount = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);
    console.log(`audit_logs count: ${auditLogsCount[0].count}`);

    // Count analytics_events (Current Config)
    const analyticsEventsCount = await db.select({ count: sql<number>`count(*)` }).from(analyticsEvents);
    console.log(`analytics_events count: ${analyticsEventsCount[0].count}`);

    // Count audit_events (Mystery Table)
    let auditEventsCount = 0;
    try {
        const res = await db.execute(sql`SELECT count(*) as count FROM audit_events`);
        auditEventsCount = (res.rows[0] as any).count;
        console.log(`audit_events count: ${auditEventsCount}`);
    } catch (e) {
        console.log(`audit_events table does not exist or error: ${(e as Error).message}`);
    }

    // Show sample of audit_logs to see if they look like admin actions
    if (auditLogsCount[0].count > 0) {
        const samples = await db.select().from(auditLogs).limit(5);
        console.log("Sample audit_logs:", JSON.stringify(samples, null, 2));
    }

    process.exit(0);
}

main().catch(console.error);
