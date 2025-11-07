import {
  transformBlockRepository,
  transformBlockRunRepository,
  workflowRepository,
  stepValueRepository,
} from "../repositories";
import type { TransformBlock, InsertTransformBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";
import { executeCode } from "../utils/sandboxExecutor";
import { workflowService } from "./WorkflowService";
import { logger } from "../logger";

/**
 * Service layer for transform block business logic
 */
export class TransformBlockService {
  private blockRepo: typeof transformBlockRepository;
  private runRepo: typeof transformBlockRunRepository;
  private workflowRepo: typeof workflowRepository;
  private valueRepo: typeof stepValueRepository;
  private workflowSvc: typeof workflowService;

  constructor(
    blockRepo?: typeof transformBlockRepository,
    runRepo?: typeof transformBlockRunRepository,
    workflowRepo?: typeof workflowRepository,
    valueRepo?: typeof stepValueRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.blockRepo = blockRepo || transformBlockRepository;
    this.runRepo = runRepo || transformBlockRunRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowSvc = workflowSvc || workflowService;
  }

  /**
   * Create a new transform block
   */
  async createBlock(
    workflowId: string,
    userId: string,
    data: Omit<InsertTransformBlock, "workflowId">
  ): Promise<TransformBlock> {
    // Verify ownership
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Validate code size
    if (data.code.length > 32 * 1024) {
      throw new Error("Code size exceeds 32KB limit");
    }

    // Validate timeout
    if (data.timeoutMs && (data.timeoutMs < 100 || data.timeoutMs > 3000)) {
      throw new Error("Timeout must be between 100ms and 3000ms");
    }

    return await this.blockRepo.create({
      ...data,
      workflowId,
    });
  }

  /**
   * List all transform blocks for a workflow
   */
  async listBlocks(workflowId: string, userId: string): Promise<TransformBlock[]> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);
    return await this.blockRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get a single transform block
   */
  async getBlock(blockId: string, userId: string): Promise<TransformBlock> {
    const block = await this.blockRepo.findById(blockId);
    if (!block) {
      throw new Error("Transform block not found");
    }

    // Verify ownership of the workflow
    await this.workflowSvc.verifyOwnership(block.workflowId, userId);

    return block;
  }

  /**
   * Update a transform block
   */
  async updateBlock(
    blockId: string,
    userId: string,
    data: Partial<Omit<InsertTransformBlock, "workflowId">>
  ): Promise<TransformBlock> {
    const block = await this.getBlock(blockId, userId);

    // Validate code size if provided
    if (data.code && data.code.length > 32 * 1024) {
      throw new Error("Code size exceeds 32KB limit");
    }

    // Validate timeout if provided
    if (data.timeoutMs && (data.timeoutMs < 100 || data.timeoutMs > 3000)) {
      throw new Error("Timeout must be between 100ms and 3000ms");
    }

    return await this.blockRepo.update(blockId, data);
  }

  /**
   * Delete a transform block
   */
  async deleteBlock(blockId: string, userId: string): Promise<void> {
    await this.getBlock(blockId, userId); // Verify ownership
    await this.blockRepo.delete(blockId);
  }

  /**
   * Execute a single transform block against sample data
   */
  async executeBlock(params: {
    block: TransformBlock;
    data: Record<string, unknown>;
  }): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const { block, data } = params;

    // Build input object with only whitelisted keys
    const input: Record<string, unknown> = {};
    for (const key of block.inputKeys || []) {
      if (key in data) {
        input[key] = data[key];
      }
    }

    // Execute code in sandbox
    const timeout = block.timeoutMs || 1000;
    const result = await executeCode(block.language, block.code, input, timeout);

    return result;
  }

  /**
   * Test a transform block with sample data (preview/test endpoint)
   */
  async testBlock(
    blockId: string,
    userId: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean; data?: { output: unknown }; error?: string }> {
    const block = await this.getBlock(blockId, userId);

    const result = await this.executeBlock({ block, data });

    if (result.ok) {
      return {
        success: true,
        data: { output: result.output },
      };
    } else {
      return {
        success: false,
        error: result.error,
      };
    }
  }

  /**
   * Execute all enabled transform blocks for a workflow run
   * Updates the data map in-place and persists to step_values
   */
  async executeAllForWorkflow(params: {
    workflowId: string;
    runId: string;
    data: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    errors?: Array<{ blockId: string; blockName: string; error: string }>;
  }> {
    const { workflowId, runId, data } = params;

    // Get all enabled blocks for the workflow, ordered by execution order
    const blocks = await this.blockRepo.findEnabledByWorkflowId(workflowId);

    if (blocks.length === 0) {
      return { success: true, data };
    }

    const errors: Array<{ blockId: string; blockName: string; error: string }> = [];
    const resultData = { ...data };

    // Execute blocks in order
    for (const block of blocks) {
      const startedAt = new Date();

      // Create audit log entry
      const auditRun = await this.runRepo.createRun({
        runId,
        blockId: block.id,
        status: "success", // Will be updated
        finishedAt: null,
        errorMessage: null,
        outputSample: null,
      });

      // Execute block
      const result = await this.executeBlock({ block, data: resultData });

      const finishedAt = new Date();

      if (result.ok) {
        // Update data map with output
        resultData[block.outputKey] = result.output;

        // Update audit log
        await this.runRepo.completeRun(auditRun.id, {
          finishedAt,
          status: "success",
          outputSample: result.output as Record<string, unknown> | string | number | boolean | null,
        });

        // Persist output to step_values
        // Note: We store the computed value using the outputKey as a pseudo-step
        // This allows the value to be referenced in subsequent logic or blocks
        try {
          await this.valueRepo.upsert({
            runId,
            stepId: block.outputKey, // Use outputKey as identifier
            value: result.output as Record<string, unknown> | string | number | boolean | null,
          });
        } catch (error) {
          logger.error({ error }, `Failed to persist transform block output for ${block.name}`);
          // Continue execution even if persistence fails
        }
      } else {
        // Determine if it's a timeout or error
        const status = result.error?.includes("TimeoutError") ? "timeout" : "error";

        // Update audit log
        await this.runRepo.completeRun(auditRun.id, {
          finishedAt,
          status,
          errorMessage: result.error?.slice(0, 1000), // Truncate long error messages
        });

        // Collect error
        errors.push({
          blockId: block.id,
          blockName: block.name,
          error: result.error || "Unknown error",
        });

        // Continue to next block (don't stop execution)
        // The missing outputKey will be undefined in the data map
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        data: resultData,
        errors,
      };
    }

    return {
      success: true,
      data: resultData,
    };
  }

  /**
   * Execute all enabled transform blocks for a specific phase
   * This method is called by BlockRunner during workflow execution
   */
  async executeAllForPhase(params: {
    workflowId: string;
    runId: string;
    phase: BlockPhase;
    sectionId?: string | null;
    data: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    data: Record<string, unknown>;
    errors?: Array<{ blockId: string; blockName: string; error: string }>;
  }> {
    const { workflowId, runId, phase, sectionId, data } = params;

    // Get enabled blocks for the specific phase
    const blocks = await this.blockRepo.findEnabledByPhase(workflowId, phase, sectionId);

    if (blocks.length === 0) {
      return { success: true, data };
    }

    const errors: Array<{ blockId: string; blockName: string; error: string }> = [];
    const resultData = { ...data };

    // Execute blocks in order
    for (const block of blocks) {
      const startedAt = new Date();

      // Create audit log entry
      const auditRun = await this.runRepo.createRun({
        runId,
        blockId: block.id,
        status: "success", // Will be updated
        finishedAt: null,
        errorMessage: null,
        outputSample: null,
      });

      // Execute block
      const result = await this.executeBlock({ block, data: resultData });

      const finishedAt = new Date();

      if (result.ok) {
        // Update data map with output
        resultData[block.outputKey] = result.output;

        // Update audit log
        await this.runRepo.completeRun(auditRun.id, {
          finishedAt,
          status: "success",
          outputSample: result.output as Record<string, unknown> | string | number | boolean | null,
        });

        // Persist output to step_values
        try {
          await this.valueRepo.upsert({
            runId,
            stepId: block.outputKey, // Use outputKey as identifier
            value: result.output as Record<string, unknown> | string | number | boolean | null,
          });
        } catch (error) {
          logger.error({ error }, `Failed to persist transform block output for ${block.name}`);
          // Continue execution even if persistence fails
        }
      } else {
        // Determine if it's a timeout or error
        const status = result.error?.includes("TimeoutError") ? "timeout" : "error";

        // Update audit log
        await this.runRepo.completeRun(auditRun.id, {
          finishedAt,
          status,
          errorMessage: result.error?.slice(0, 1000),
        });

        // Collect error
        errors.push({
          blockId: block.id,
          blockName: block.name,
          error: result.error || "Unknown error",
        });

        // Continue to next block (don't stop execution)
      }
    }

    return {
      success: errors.length === 0,
      data: resultData,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

// Singleton instance
export const transformBlockService = new TransformBlockService();
