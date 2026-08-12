/**
 * External Send Block Runner
 * Sends data to external destinations
 */

import { externalSendRunner } from "../../lib/external/ExternalSendRunner";
import { logger } from "../../logger";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, ExternalSendBlockConfig } from "./types";

export class ExternalSendBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "external_send";
  }

  async execute(config: ExternalSendBlockConfig, context: BlockContext, _block: Block): Promise<BlockResult> {
    try {
      if (config.runCondition) {
        const shouldRun = this.evaluateCondition(config.runCondition, context.data);
        if (!shouldRun) {
          return { success: true };
        }
      }

      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return { success: false, errors: ["Failed to resolve tenantId from workflow"] };
      }

      const result = await externalSendRunner.execute(
        config,
        context,
        tenantId,
        context.mode ?? 'live'
      );

      return {
        success: result.success,
        errors: result.error ? [result.error] : undefined,

        data: result.responseBody ? { [config.destinationId]: result.responseBody } : undefined
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing external_send block");
      return {
        success: false,
        errors: [`Failed to send external request: ${error instanceof Error ? error.message : "unknown error"}`]
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
      return await workflowTenantResolver.resolveForWorkflowId(workflowId);
    } catch (error: unknown) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }
}
