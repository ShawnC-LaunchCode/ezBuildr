/**
 * AnalyticsService.ts
 * Core service for ingesting workflow execution events and retrieving run timelines.
 */
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { workflowRunEvents } from "../../../shared/schema";
import { db } from "../../db";
import logger from "../../logger";
// Validation schema for incoming events
// Preview mode events use non-UUID identifiers (e.g., "preview-session", "draft")
export const eventSchema = z.object({
    runId: z.string(), // Allow any string (UUID in production, "preview-*" in preview mode)
    workflowId: z.string().uuid(),
    versionId: z.string(), // Allow any string (UUID in production, "draft" in preview mode)
    type: z.string(),
    // Context
    blockId: z.string().optional(),
    pageId: z.string().optional(), // Allow any string (UUID or section ID)
    // Metadata
    payload: z.record(z.any()).optional(),
    timestamp: z.string().datetime().optional(), // ISO string from client
    isPreview: z.boolean().default(false),
});
export type AnalyticsEventInput = z.infer<typeof eventSchema>;
class AnalyticsService {
    /**
     * Record a new analytics event
     * Preview events are silently skipped (not stored in database)
     * Handles redaction of sensitive fields (future implementation)
     */
    async recordEvent(input: AnalyticsEventInput) {
        try {
            // Basic validation
            const data = eventSchema.parse(input);
            // Skip storing preview events (non-UUID versions other than 'draft') in database
            // We allow 'draft' for runs initiated from a workflow without a published version
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.versionId);
            if (data.isPreview || (!isUuid && data.versionId !== 'draft')) {
                logger.debug({ event: data }, "Skipping preview/invalid analytics event");
                return;
            }
            // Redaction logic can be added here
            // Redaction logic can be added here
            // For now, we assume payload is safe or mocked
            await db.insert(workflowRunEvents).values({
                runId: data.runId,
                workflowId: data.workflowId,
                versionId: data.versionId,
                type: data.type,
                blockId: data.blockId,
                pageId: data.pageId,
                payload: data.payload,
                isPreview: data.isPreview,
                timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
            });
            // If event ends a run, we might want to trigger aggregation immediately
            // e.g. if (data.type === 'workflow.complete') AggregationService.aggregateRun(data.runId);
        } catch (error) {
            logger.error({ error, input }, "Failed to record analytics event");
            // We do NOT throw here to prevent blocking the runner
        }
    }
    /**
     * Get chronological timeline of events for a specific run
     */
    async getRunTimeline(runId: string) {
        const events = await db
            .select()
            .from(workflowRunEvents)
            .where(eq(workflowRunEvents.runId, runId))
            .orderBy(desc(workflowRunEvents.timestamp)); // Show newest first? Or oldest? Chrome devtools is usually oldest first.
        // Let's return oldest first for a "timeline" view
        return events.reverse();
    }
    /**
     * Batch record events (for performance)
     */
    async recordEvents(inputs: AnalyticsEventInput[]) {
        // optimize with single insert
        if (inputs.length === 0) {return;}
        try {
            const values = inputs.map(input => ({
                runId: input.runId,
                workflowId: input.workflowId,
                versionId: input.versionId,
                type: input.type,
                blockId: input.blockId,
                pageId: input.pageId,
                payload: input.payload,
                isPreview: input.isPreview,
                timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
            }));
            await db.insert(workflowRunEvents).values(values);
        } catch (error) {
            logger.error({ error, count: inputs.length }, "Failed to batch record analytics events");
        }
    }
}
export const analyticsService = new AnalyticsService();