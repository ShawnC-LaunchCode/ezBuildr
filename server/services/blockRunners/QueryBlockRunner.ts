/**
 * Query Block Runner
 * Fetches data using the Query Runner
 */

import { queryRunner } from "../../lib/queries/QueryRunner";
import { withTenant, withVerifiedIdentifier } from "../../utils/rlsContext";
import { logger } from "../../logger";
import { workflowQueriesRepository, stepValueRepository } from "../../repositories";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, QueryBlockConfig } from "./types";

export class QueryBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "query";
  }

  async execute(config: QueryBlockConfig, context: BlockContext, block: Block): Promise<BlockResult> {
    try {
      // Get query definition
      const query = await workflowQueriesRepository.findById(config.queryId);
      if (!query) {
        return {
          success: false,
          errors: [`Query definition not found: ${config.queryId}`],
        };
      }

      logger.info({
        workflowId: context.workflowId,
        queryId: config.queryId,
        outputVar: config.outputVariableName
      }, "Executing query block");

      // Get tenantId from workflow
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      // Execute query with current context data, inside a tenant-scoped
      // transaction: the DataVault tables it reads are RLS-covered and a block
      // runner is reachable with no ambient tenant (run token, or the
      // background completion worker), so the tenant resolved above is pinned
      // explicitly here — at the service boundary, not inside the lib.
      const listVariable = await withTenant(tenantId, (tx) =>
        queryRunner.executeQuery(query, context.data, tenantId, tx));

      // Persist to virtual step if runId is present
      if (context.runId && block.virtualStepId) {
        try {
          await stepValueRepository.upsert({
            runId: context.runId,
            stepId: block.virtualStepId,
            value: listVariable,
          });
          logger.debug({
            blockId: block.id,
            virtualStepId: block.virtualStepId,
            rowCount: listVariable.rowCount
          }, "Persisted query block output");
        } catch (error) {
          logger.error({ error, blockId: block.id }, "Failed to persist query block output");
        }
      }

      return {
        success: true,
        data: {
          [config.outputVariableName]: listVariable
        }
      };
    } catch (error) {
      logger.error({ error, blockConfig: config }, "Error executing query block");
      return {
        success: false,
        errors: [`Query execution failed: ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }

  /**
   * Helper: Get tenantId from workflowId
   */
  /**
   * Resolve the tenant that scopes DataVault access for this workflow.
   *
   * Delegates to {@link WorkflowTenantResolver} — this used to be a private
   * copy that resolved only `project -> creator` and ignored
   * `ownerType`/`ownerUuid`, so a transferred workflow resolved the original
   * creator's tenant while its DataVault data had moved to the new owner.
   */
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      const { workflowTenantResolver } = await import("../WorkflowTenantResolver");
      // RLS-5: resolving a workflow's tenant means reading `workflows`,
      // `projects` and `users` — all RLS-covered — with no tenant known yet,
      // which is the whole point of the call. Pin the workflow id as
      // `app.current_workflow_id` (migration 0030) for the lookup, exactly as
      // `runTokenAuth` does. The id came from the block's run context, not
      // from request input. Without this the resolver returns null under
      // enforcement and the block fails with "Failed to resolve tenantId".
      return await withVerifiedIdentifier(
        'app.current_workflow_id',
        workflowId,
        (tx) => workflowTenantResolver.resolveForWorkflowId(workflowId, tx)
      );
    } catch (error: unknown) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }
}
