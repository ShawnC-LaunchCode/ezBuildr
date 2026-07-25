import { versionService } from "./VersionService";
import { lintWorkflowContent, type LintResult } from "./workflowLintRules";

export type { LintResult };

/**
 * Serialize-then-lint entry point used by the workflow routes
 * (GET /api/workflows/:id/lint and the activation gate on
 * PUT /api/workflows/:id/status).
 *
 * The rules themselves live in `workflowLintRules.ts` as pure functions so
 * `VersionService.publishVersion` can run the identical checks on the graph it
 * has already serialized, without a circular import back through this service
 * (RUN2-7).
 */
export class WorkflowLintService {
  async lint(workflowId: string, userId: string): Promise<LintResult[]> {
    const data = await versionService.serializeWorkflow(workflowId, userId);
    return lintWorkflowContent(data);
  }
}

export const workflowLintService = new WorkflowLintService();
