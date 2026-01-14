
import { sql, eq, and, gte, lte } from "drizzle-orm";

import { usageRecords } from "@shared/schema";

import { db } from "../../db";

export class UsageAggregator {
    /**
     * Aggregates daily usage for billing purposes.
     * In a real system, this would write to a separate 'daily_usage' table.
     * For now, we'll just query the raw records efficiently.
     */
    static async getDailyUsage(organizationId: string, date: Date): Promise<Record<string, number>> {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const results = await db
            .select({
                metric: usageRecords.metric,
                total: sql<number>`sum(${usageRecords.quantity})`
            })
            .from(usageRecords)
            .where(and(
                eq(usageRecords.organizationId, organizationId),
                gte(usageRecords.recordedAt, start),
                lte(usageRecords.recordedAt, end)
            ))
            .groupBy(usageRecords.metric);

        const usage: Record<string, number> = {};
        for (const r of results) {
            usage[r.metric] = Number(r.total);
        }
        return usage;
    }

    /**
     * Get aggregate usage for the current billing period
     */
    static async getPeriodUsage(organizationId: string, periodStart: Date, periodEnd: Date): Promise<Record<string, number>> {
        const results = await db
            .select({
                metric: usageRecords.metric,
                total: sql<number>`sum(${usageRecords.quantity})`
            })
            .from(usageRecords)
            .where(and(
                eq(usageRecords.organizationId, organizationId),
                gte(usageRecords.recordedAt, periodStart),
                lte(usageRecords.recordedAt, periodEnd)
            ))
            .groupBy(usageRecords.metric);

        const usage: Record<string, number> = {};
        for (const r of results) {
            usage[r.metric] = Number(r.total);
        }
        return usage;
    }
}
