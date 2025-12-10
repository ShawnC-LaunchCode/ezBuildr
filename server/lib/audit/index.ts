import { BlockAudit } from "./blockAudit";
import { WorkflowAudit } from "./workflowAudit";
import { ScriptAudit } from "./scriptAudit";
import { ValidationAudit, DocAudit, AnalyticsAudit, SnapshotAudit } from "./miscAudit";
import { logger } from "../observability/logger";

export class SystemAudit {
    /**
     * Run a full audit on a specific workflow.
     */
    static async auditWorkflow(workflow: any) {
        logger.info({ msg: "Starting System Audit", workflowId: workflow.id });

        const blockResults = BlockAudit.audit(workflow.blocks || []);
        const graphResults = WorkflowAudit.audit({
            nodes: workflow.nodes || [],
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
