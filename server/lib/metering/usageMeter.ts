
import { sql } from "drizzle-orm";

import { usageRecords } from "@shared/schema";

import { db } from "../../db";

export interface UsageEvent {
    organizationId: string;
    metric: 'workflow_run' | 'document_generated' | 'signature_requested' | 'storage_bytes' | 'ai_tokens' | 'script_execution';
    quantity: number;
    workflowId?: string;
    metadata?: Record<string, any>;
}

export class UsageMeter {
    /**
     * Records a usage event.
     * This is designed to be fire-and-forget and highly performant.
     * In a high-scale system, this would push to a queue (Kafka/Redis).
     * For now, we write directly to Postgres.
     */
    static async record(event: UsageEvent): Promise<void> {
        try {
            await db.insert(usageRecords).values({
                organizationId: event.organizationId,
                metric: event.metric,
                quantity: event.quantity,
                workflowId: event.workflowId,
                metadata: event.metadata
            });
        } catch (error) {
            console.error("Failed to record usage:", error);
            // Non-blocking failure
        }
    }

    /**
     * Get total usage for an organization within a time period.
     */
    static async getUsage(organizationId: string, metric: string, from: Date, to: Date): Promise<number> {
        const result = await db
            .select({
                total: sql<number>`sum(${usageRecords.quantity})`
            })
            .from(usageRecords)
            .where(sql`${usageRecords.organizationId} = ${organizationId} 
                   AND ${usageRecords.metric} = ${metric}
                   AND ${usageRecords.recordedAt} >= ${from}
                   AND ${usageRecords.recordedAt} <= ${to}`);

        return Number(result[0]?.total || 0);
    }
}
