/**
 * HeatmapService.ts
 * Provides block-level metrics for heatmap visualization.
 */

import { db } from "../../db";
import { blockMetrics } from "../../../shared/schema";
import { eq, and } from "drizzle-orm";

export interface BlockHeatmapData {
    blockId: string;
    avgTimeMs: number;
    errorRate: number;
    visits: number;
    score: number; // 0-100 "pain score"
}

class HeatmapService {
    async getBlockHeatmap(workflowId: string, versionId: string): Promise<BlockHeatmapData[]> {
        const metrics = await db
            .select()
            .from(blockMetrics)
            .where(
                and(
                    eq(blockMetrics.workflowId, workflowId),
                    eq(blockMetrics.versionId, versionId)
                )
            );

        return metrics.map((m: any) => {
            const visits = m.totalVisits || 0;
            const errors = m.validationErrorCount || 0;
            const errorRate = visits > 0 ? (errors / visits) * 100 : 0;

            // Calculate a "pain score"
            // Factors: Error rate (high weight), Time spent (medium weight - tricky without baseline)
            let score = errorRate * 5; // e.g. 20% error rate = 100 score
            if (score > 100) score = 100;

            return {
                blockId: m.blockId,
                avgTimeMs: m.avgTimeMs || 0,
                errorRate,
                visits,
                score
            };
        });
    }
}

export const heatmapService = new HeatmapService();
