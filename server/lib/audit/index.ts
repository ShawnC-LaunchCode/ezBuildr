import { logger } from "../observability/logger";

import { BlockAudit } from "./blockAudit";

import { ScriptAudit } from "./scriptAudit";
import { WorkflowAudit } from "./workflowAudit";

export class SystemAudit {
    /**
     * Run a full audit on a specific workflow.
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    static async auditWorkflow(workflow: { id: string; blocks?: unknown[]; nodes?: unknown[]; startNodeId?: string; script?: string }) {
        logger.info({ msg: "Starting System Audit", workflowId: workflow.id });

        // @ts-expect-error - TODO: fix type
        const blockResults = BlockAudit.audit(workflow.blocks ?? []);
        const graphResults = WorkflowAudit.audit({
            // @ts-expect-error - TODO: fix type
            nodes: workflow.nodes ?? [],
            // @ts-expect-error - TODO: fix type
            startNodeId: workflow.startNodeId
        });

        // Example script check (if workflow has global scripts)
        const scriptResults = workflow.script ? ScriptAudit.audit(workflow.script) : { passed: true, issues: [] };

        const results = {
            blocks: blockResults,
            graph: graphResults,
            script: scriptResults,
            timestamp: new Date().toISOString()
        };

        if (!blockResults.passed || !graphResults.passed || !scriptResults.passed) {
            logger.warn({ msg: "Audit discovered issues", results });
        } else {
            logger.info({ msg: "Audit passed", workflowId: workflow.id });
        }

        return results;
    }
}
