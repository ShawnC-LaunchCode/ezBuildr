/**
 * AggregationService.ts
 * Computes aggregated metrics for runs and workflows.
 */
import { eq, and } from "drizzle-orm";

import {
    workflowRunEvents,
    workflowRunMetrics,
    blockMetrics,
    workflowAnalyticsSnapshots,
    workflowRuns
} from "../../../shared/schema";
import { db } from "../../db";
import logger from "../../logger";
class AggregationService {
    /**
     * Aggregate metrics for a single run after it completes
     */
    async aggregateRun(runId: string) {
        try {
            const events = await db
                .select()
                .from(workflowRunEvents)
                .where(eq(workflowRunEvents.runId, runId))
                .orderBy(workflowRunEvents.timestamp);
            if (events.length === 0) {return;}
            const startEvent = events[0];
            const endEvent = events[events.length - 1];
            const totalTimeMs = endEvent.timestamp.getTime() - startEvent.timestamp.getTime();
            // Count unique pages and blocks visited
            const pagesVisited = new Set(events.filter((e: any) => e.pageId).map((e: any) => e.pageId)).size;
            const blocksVisited = new Set(events.filter((e: any) => e.blockId).map((e: any) => e.blockId)).size;
            const validationErrors = events.filter((e: any) => e.type === 'validation.error').length;
            const scriptErrors = events.filter((e: any) => e.type === 'script.error').length;
            const isCompleted = events.some((e: any) => e.type === 'workflow.complete');
            // Upsert metrics
            await db.insert(workflowRunMetrics).values({
                runId,
                workflowId: startEvent.workflowId,
                versionId: startEvent.versionId,
                totalTimeMs,
                pagesVisited,
                blocksVisited,
                validationErrors,
                scriptErrors,
                completed: isCompleted,
                completedAt: isCompleted ? endEvent.timestamp : null,
                isPreview: startEvent.isPreview,
            }).onConflictDoUpdate({
                target: workflowRunMetrics.runId,
                set: {
                    totalTimeMs,
                    pagesVisited,
                    blocksVisited,
                    validationErrors,
                    scriptErrors,
                    completed: isCompleted,
                    completedAt: isCompleted ? endEvent.timestamp : null,
                }
            });
            // Update block stats (increment counts)
            this.updateBlockMetrics(events);
        } catch (error) {
            logger.error({ error, runId }, "Failed to aggregate run metrics");
        }
    }
    /**
     * Update aggregated block metrics incrementally
     * This is a naive implementation; for scale, we might want to do this in batches or background jobs
     */
    private async updateBlockMetrics(events: typeof workflowRunEvents.$inferSelect[]) {
        // Group events by blockId
        const blockEvents = events.reduce((acc, event) => {
            if (!event.blockId || !event.versionId) {return acc;}
            if (!acc[event.blockId]) {acc[event.blockId] = [];}
            acc[event.blockId].push(event);
            return acc;
        }, {} as Record<string, typeof workflowRunEvents.$inferSelect[]>);
        for (const [blockId, bEvents] of Object.entries(blockEvents)) {
            const visitCount = bEvents.filter((e: any) => e.type === 'block.enter' || e.type === 'block.start').length; // Assuming logical visit
            const errors = bEvents.filter((e: any) => e.type === 'validation.error').length;
            // Naive time spent: sum of (exit - enter) ... requires strict pairing logic, skipping for now
            // Just increment visit counts
            if (visitCount > 0 || errors > 0) {
                // Upsert block metrics
                const versionId = bEvents[0].versionId;
                const workflowId = bEvents[0].workflowId;
                // Check if exists
                const existing = await db.query.blockMetrics.findFirst({
                    where: and(
                        eq(blockMetrics.versionId, versionId),
                        eq(blockMetrics.blockId, blockId)
                    )
                });
                if (existing) {
                    await db.update(blockMetrics)
                        .set({
                            totalVisits: (existing.totalVisits || 0) + visitCount,
                            validationErrorCount: (existing.validationErrorCount || 0) + errors,
                        })
                        .where(eq(blockMetrics.id, existing.id));
                } else {
                    await db.insert(blockMetrics).values({
                        workflowId,
                        versionId,
                        blockId,
                        totalVisits: visitCount,
                        validationErrorCount: errors,
                    });
                }
            }
        }
    }
    /**
     * Nightly aggregation for dashboard
     * (Can be triggered via cron or manual API)
     */
    async computeDailySnapshot(workflowId: string, versionId: string, date: Date = new Date()) {
        // Logic to aggregate all runs/events for a day and store in workflow_analytics_snapshots
        // Implementation deferred to Part 3 refinement
    }
}
export const aggregationService = new AggregationService();