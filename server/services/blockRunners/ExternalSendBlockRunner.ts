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
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      const { workflowRepository } = await import("../../repositories");
      const workflow = await workflowRepository.findById(workflowId);

      if (!workflow) {
        logger.warn({ workflowId }, "Workflow not found");
        return null;
      }

      // 1. Try Project linkage
      if (workflow.projectId) {
        const { projectRepository } = await import("../../repositories");
        const project = await projectRepository.findById(workflow.projectId);
        if (project) {
          return project.tenantId;
        }
        logger.warn(
          { projectId: workflow.projectId, workflowId },
          "Project not found for workflow, falling back to creator"
        );
      }

      // 2. Fallback: Creator's Tenant
      if (workflow.creatorId) {
        const { userRepository } = await import("../../repositories");
        const creator = await userRepository.findById(workflow.creatorId);

        if (creator?.tenantId) {
          return creator.tenantId;
        }
      }

      logger.warn(
        { workflowId, creatorId: workflow.creatorId },
        "Could not resolve tenantId from project or creator"
      );
      return null;
    } catch (error) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }
}
