/**
 * BranchingService.ts
 * Analyzes the most common paths users take through the workflow.
 */
import {  sql } from "drizzle-orm";
import { workflowRunEvents } from "../../../shared/schema";
import { db } from "../../db";
export interface BranchNode {
    id: string; // pageId
    data: { label: string; value: number }; // value = flow count
}
export interface BranchEdge {
    source: string;
    target: string;
    value: number; // count of users traversing this edge
}
export interface BranchingGraph {
    nodes: BranchNode[];
    edges: BranchEdge[];
}
class BranchingService {
    async getBranchingGraph(workflowId: string, versionId: string): Promise<BranchingGraph> {
        // We need to construct sequences of page views per run
        // 1. Fetch all page.view events ordered by run, timestamp
        const query = sql`
        SELECT run_id, page_id, timestamp
        FROM ${workflowRunEvents}
        WHERE 
            workflow_id = ${workflowId} 
            AND version_id = ${versionId}
            AND type = 'page.view'
        ORDER BY run_id, timestamp
    `;
        const result = await db.execute(query);
        const rows = result.rows as any[];
        const transitions: Record<string, number> = {}; // "pageA->pageB" => count
        const pageCounts: Record<string, number> = {}; // "pageA" => visitors
        // 2. Process in memory (efficient enough for <10k rows, otherwise need sophisticated SQL window functions)
        let currentRunId: string | null = null;
        let lastPageId: string | null = null;
        rows.forEach((row: any) => {
            pageCounts[row.page_id] = (pageCounts[row.page_id] || 0) + 1;
            if (row.run_id !== currentRunId) {
                // New run
                currentRunId = row.run_id;
                lastPageId = row.page_id;
                // Start node -> first page? Optional.
            } else {
                // Same run, transition
                if (lastPageId && row.page_id) {
                    const key = `${lastPageId}->${row.page_id}`;
                    transitions[key] = (transitions[key] || 0) + 1;
                }
                lastPageId = row.page_id;
            }
        });
        // 3. Construct Graph
        const nodes: BranchNode[] = Object.keys(pageCounts).map(pageId => ({
            id: pageId,
            data: {
                label: `Page ${pageId.substring(0, 8)}`,
                value: pageCounts[pageId]
            }
        }));
        const edges: BranchEdge[] = Object.keys(transitions).map(key => {
            const [source, target] = key.split('->');
            return {
                source,
                target,
                value: transitions[key]
            };
        });
        return { nodes, edges };
    }
}
export const branchingService = new BranchingService();