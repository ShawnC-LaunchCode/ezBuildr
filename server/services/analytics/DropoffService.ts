/**
 * DropoffService.ts
 * Analyzes where users abandon the workflow.
 */

import { eq, and, desc, sql } from "drizzle-orm";

import { workflowRunEvents } from "../../../shared/schema";
import { db } from "../../db";

export interface FunnelStep {
    stepId: string; // pageId or blockId
    label: string;
    visitors: number;
    dropoffs: number;
    dropoffRate: number;
}

class DropoffService {
    async getDropoffFunnel(workflowId: string, versionId: string): Promise<FunnelStep[]> {
        // 1. Get all page view events for this version
        // Group by pageId and count unique runIds

        // Note: We need the order of pages to build a proper funnel.
        // For linear flows, "Section Order" from DB helps.
        // For non-linear, we might just list top drop-off pages by count.

        // SQL aggregation:
        // SELECT page_id, count(distinct run_id) as visitors
        // FROM events WHERE type = 'page.view' AND ... GROUP BY page_id

        const pageViews = await db.execute(sql`
        SELECT 
            page_id as "pageId",
            count(distinct run_id) as "visitors"
        FROM ${workflowRunEvents}
        WHERE 
            workflow_id = ${workflowId} 
            AND version_id = ${versionId}
            AND type = 'page.view'
            AND page_id IS NOT NULL
        GROUP BY page_id
    `);

        // Calculate dropoffs... 
        // Dropoff = Visitors of Page X - Visitors of Page X+1? 
        // That only works for linear.
        // Better definition of dropoff:
        // A run "dropped off at Page X" if the LAST event of the run was on Page X and run !completed.

        const dropoffCounts = await db.execute(sql`
        WITH LastEvents AS (
            SELECT DISTINCT ON (run_id) 
                run_id, 
                page_id, 
                type
            FROM ${workflowRunEvents}
            WHERE 
                workflow_id = ${workflowId} 
                AND version_id = ${versionId}
                AND page_id IS NOT NULL
            ORDER BY run_id, timestamp DESC
        )
        SELECT 
            page_id as "pageId", 
            count(*) as "dropoffs"
        FROM LastEvents
        WHERE type != 'workflow.complete' 
        GROUP BY page_id
    `);

        // Merge data
        const funnel: Record<string, FunnelStep> = {};

        // Populate visitors
        for (const row of pageViews.rows as any[]) {
            funnel[row.pageId] = {
                stepId: row.pageId,
                label: `Page ${  row.pageId.substring(0, 8)}`, // Todo: Join with Sections table for real title
                visitors: Number(row.visitors),
                dropoffs: 0,
                dropoffRate: 0
            };
        }

        // Populate dropoffs
        for (const row of dropoffCounts.rows as any[]) {
            if (funnel[row.pageId]) {
                funnel[row.pageId].dropoffs = Number(row.dropoffs);
                funnel[row.pageId].dropoffRate = funnel[row.pageId].visitors > 0
                    ? (Number(row.dropoffs) / funnel[row.pageId].visitors) * 100
                    : 0;
            }
        }

        // Return as array (sorted by some logic? maybe visitors desc)
        return Object.values(funnel).sort((a, b) => b.visitors - a.visitors);
    }
}

export const dropoffService = new DropoffService();
