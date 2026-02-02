/**
 * Write Block Runner
 * Writes data to a native table using WriteRunner
 */

import { writeRunner } from "../../lib/writes/WriteRunner";
import { logger } from "../../logger";
import { stepValueRepository } from "../../repositories";

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
  private async resolveTenantId(workflowId: string): Promise<string | null> {
    try {
      const { db } = await import("../../db");
      const { workflows, projects, users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      // 1. Try Project linkage (Standard)
      const [projectResult] = await db
        .select({ tenantId: projects.tenantId })
        .from(workflows)
        .innerJoin(projects, eq(workflows.projectId, projects.id))
        .where(eq(workflows.id, workflowId))
        .limit(1);

      if (projectResult?.tenantId) {
        return projectResult.tenantId;
      }

      // 2. Fallback: Workflow Creator's Tenant (Unfiled)
      const [creatorResult] = await db
        .select({ tenantId: users.tenantId })
        .from(workflows)
        .innerJoin(users, eq(workflows.creatorId, users.id))
        .where(eq(workflows.id, workflowId))
        .limit(1);

      return creatorResult?.tenantId ?? null;
    } catch (e) {
      logger.error({ error: e, workflowId }, "Failed to resolve tenant ID");
      return null;
    }
  }
}
