/**
 * Write Block Runner
 * Writes data to a native table using WriteRunner
 */

import { writeRunner } from "../../lib/writes/WriteRunner";
import { logger } from "../../logger";
import { stepValueRepository } from "../../repositories";
import { withVerifiedIdentifier } from "../../utils/rlsContext";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, WriteBlockConfig } from "./types";

export class WriteBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "write";
  }

  async execute(config: WriteBlockConfig, context: BlockContext, block: Block): Promise<BlockResult> {
    try {
      // Check runCondition
      if (config.runCondition) {
        const shouldRun = this.evaluateCondition(config.runCondition, context.data);
        if (!shouldRun) {
          logger.info({ phase: context.phase }, "Skipping write block due to condition");
          return { success: true };
        }
      }

      // Resolve tenantId
      const tenantId = await this.resolveTenantId(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Tenant ID resolution failed"]
        };
      }

      // Determine if preview mode
      const isPreview = context.mode === 'preview';

      const result = await writeRunner.executeWrite(config, context, tenantId, isPreview);

      if (!result.success) {
        return {
          success: false,
          errors: [result.error ?? "Write operation failed"]
        };
      }

      // Persist output to virtual step if configured
      const updates: Record<string, unknown> = {};
      if (config.outputKey && result.rowId) {
        updates[config.outputKey] = result.rowId;
      }

      // Also persist to virtual step if block has virtualStepId
      if (context.runId && block.virtualStepId && result.rowId) {
        try {
          await stepValueRepository.upsert({
            runId: context.runId,
            stepId: block.virtualStepId,
            value: {
              rowId: result.rowId,
              tableId: result.tableId,
              operation: result.operation,
              writtenData: result.writtenData
            }
          });
          logger.debug({
            blockId: block.id,
            virtualStepId: block.virtualStepId,
            rowId: result.rowId
          }, "Persisted write block output to virtual step");
        } catch (error) {
          logger.error({ error, blockId: block.id }, "Failed to persist write block output");
        }
      }

      return {
        success: true,
        data: updates
      };

    } catch (error) {
      logger.error({ error, config }, "Write block failed");
      return {
        success: false,
        errors: [`Write failed: ${error instanceof Error ? error.message : 'unknown error'}`]
      };
    }
  }

  /**
   * Resolve Tenant ID from Workflow ID
   */
  /**
   * Resolve the tenant that scopes the DataVault write.
   *
   * Delegates to {@link WorkflowTenantResolver} — this used to be a private
   * copy that resolved only `project -> creator` and ignored
   * `ownerType`/`ownerUuid`, so a transferred workflow wrote into the original
   * creator's tenant while its DataVault data had moved to the new owner.
   */
  private async resolveTenantId(workflowId: string): Promise<string | null> {
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
    } catch (e) {
      logger.error({ error: e, workflowId }, "Failed to resolve tenant ID");
      return null;
    }
  }
}
