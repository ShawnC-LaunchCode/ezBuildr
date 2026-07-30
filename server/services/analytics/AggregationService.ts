/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/**
 * AggregationService.ts
 * Computes aggregated metrics for runs and workflows.
 */
import { eq, and } from "drizzle-orm";

import { workflowRunEvents, workflowRunMetrics, blockMetrics } from "../../../shared/schema";
import { db } from "../../db";
import logger from "../../logger";
class AggregationService {
    /**
     * Aggregate metrics for a single run after it completes
     */
    async aggregateRun(runId: string): Promise<void> {
        try {
            const events = await db
                .select()
                .from(workflowRunEvents)
                .where(eq(workflowRunEvents.runId, runId))
                .orderBy(workflowRunEvents.timestamp);
            if (events.length === 0) {return;}
            const startEvent = events[0];
            const endEvent = events[events.length - 1];
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!startEvent || !endEvent) {return;}
            const totalTimeMs = endEvent.timestamp.getTime() - startEvent.timestamp.getTime();
            // Count unique pages and blocks visited
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pagesVisited = new Set(events.filter((e: any) => e.pageId).map((e: any) => e.pageId as string)).size;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blocksVisited = new Set(events.filter((e: any) => e.blockId).map((e: any) => e.blockId as string)).size;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const validationErrors = events.filter((e: any) => e.type === 'validation.error').length;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scriptErrors = events.filter((e: any) => e.type === 'script.error').length;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            void this.updateBlockMetrics(events);
        } catch (error) {
            logger.error({ error, runId }, "Failed to aggregate run metrics");
        }
    }
    /**
     * Update aggregated block metrics incrementally
     * This is a naive implementation; for scale, we might want to do this in batches or background jobs
     */
    private async updateBlockMetrics(events: Array<typeof workflowRunEvents.$inferSelect>): Promise<void> {
        // Group events by blockId
        const blockEvents = events.reduce<Record<string, Array<typeof workflowRunEvents.$inferSelect>>>((acc, event) => {
            if (!event.blockId || !event.versionId) {return acc;}
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!acc[event.blockId]) {acc[event.blockId] = [];}
            acc[event.blockId].push(event);
            return acc;
        }, {});
        for (const [blockId, bEvents] of Object.entries(blockEvents)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const visitCount = bEvents.filter((e: any) => e.type === 'block.enter' || e.type === 'block.start').length;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errors = bEvents.filter((e: any) => e.type === 'validation.error').length;
            // Naive time spent: sum of (exit - enter) ... requires strict pairing logic, skipping for now
            // Just increment visit counts
            if (visitCount > 0 || errors > 0) {
                // Upsert block metrics
                const versionId = bEvents[0]?.versionId;
                const workflowId = bEvents[0]?.workflowId;
                if (!versionId || !workflowId) {continue;}
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
                            totalVisits: (existing.totalVisits ?? 0) + visitCount,
                            validationErrorCount: (existing.validationErrorCount ?? 0) + errors,
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
    async computeDailySnapshot(_workflowId: string, _versionId: string, _date: Date = new Date()): Promise<void> {
        // Logic to aggregate all runs/events for a day and store in workflow_analytics_snapshots
        // Implementation deferred to Part 3 refinement
    }
}
export const aggregationService = new AggregationService();