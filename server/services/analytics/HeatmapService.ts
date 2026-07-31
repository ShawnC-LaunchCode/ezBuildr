/**
 * HeatmapService.ts
 * Provides block-level metrics for heatmap visualization.
 */

import { eq, and } from "drizzle-orm";

import { blockMetrics } from "../../../shared/schema";
import { db } from "../../db";

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return metrics.map((m: any) => {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Analytics query rows are dynamically typed.
            const visits = m.totalVisits || 0;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Analytics query rows are dynamically typed.
            const errors = m.validationErrorCount || 0;
            const errorRate = visits > 0 ? (errors / visits) * 100 : 0;

            // Calculate a "pain score"
            // Factors: Error rate (high weight), Time spent (medium weight - tricky without baseline)
            let score = errorRate * 5; // e.g. 20% error rate = 100 score
            if (score > 100) {score = 100;}

            return {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Analytics query rows are dynamically typed.
                blockId: m.blockId,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Analytics query rows are dynamically typed.
                avgTimeMs: m.avgTimeMs || 0,
                errorRate,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Analytics query rows are dynamically typed.
                visits,
                score
            };
        });
    }
}

export const heatmapService = new HeatmapService();
