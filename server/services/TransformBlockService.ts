import type { TransformBlock, InsertTransformBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";

import { logger } from "../logger";
import {
  transformBlockRepository,
  transformBlockRunRepository,
  workflowRepository,
  stepValueRepository,
  sectionRepository,
  stepRepository,
} from "../repositories";

import { scriptEngine } from "./scripting/ScriptEngine";
import { workflowService } from "./WorkflowService";


/**
 * Service layer for transform block business logic
 */
export class TransformBlockService {
  private blockRepo: typeof transformBlockRepository;
  private runRepo: typeof transformBlockRunRepository;
  private workflowRepo: typeof workflowRepository;
  private valueRepo: typeof stepValueRepository;
  private workflowSvc: typeof workflowService;
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;

  constructor(
    blockRepo?: typeof transformBlockRepository,
    runRepo?: typeof transformBlockRunRepository,
    workflowRepo?: typeof workflowRepository,
    valueRepo?: typeof stepValueRepository,
    workflowSvc?: typeof workflowService,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository
  ) {
    this.blockRepo = blockRepo || transformBlockRepository;
    this.runRepo = runRepo || transformBlockRunRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowSvc = workflowSvc || workflowService;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
  }

  /**
   * Create a new transform block
   * Also creates a virtual step to store the block's output
   */
  async createBlock(
    workflowId: string,
    userId: string,
    data: Omit<InsertTransformBlock, "workflowId">
  ): Promise<TransformBlock> {
    // Verify ownership
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Validate code size
    if (data.code.length > 32 * 1024) {
      throw new Error("Code size exceeds 32KB limit");
    }

    // Validate timeout
    if (data.timeoutMs && (data.timeoutMs < 100 || data.timeoutMs > 3000)) {
      throw new Error("Timeout must be between 100ms and 3000ms");
    }

    // Determine which section to attach the virtual step to
    // If transform block is section-scoped, use that section
    // If workflow-scoped (sectionId is null), attach to the first section
    let targetSectionId = data.sectionId;

    if (!targetSectionId) {
      // For workflow-scoped blocks, we need a section to attach the virtual step
      // Get the first section of the workflow
      const sections = await this.sectionRepo.findByWorkflowId(workflowId);
      if (sections.length === 0) {
        throw new Error("Cannot create transform block: workflow has no sections. Please add at least one section first.");
      }
      targetSectionId = sections[0].id;
    }

    // Create the virtual step first
    // This step will store the transform block's output value
    const virtualStep = await this.stepRepo.create({
      sectionId: targetSectionId,
      type: 'computed',
      title: `Computed: ${data.name}`,
      description: `Virtual step for transform block: ${data.name}`,
      alias: data.outputKey, // Use the outputKey as the alias for easy lookup
      required: false,
      order: -1, // Negative order ensures it's sorted before user-visible steps
      isVirtual: true, // Mark as virtual so we can filter it from UI
    });

    // Now create the transform block with the virtual step ID
    const block = await this.blockRepo.create({
      ...data,
      workflowId,
      virtualStepId: virtualStep.id,
    });

    logger.info({
      blockId: block.id,
      virtualStepId: virtualStep.id,
      outputKey: data.outputKey,
    }, "Created transform block with virtual step");

    return block;
  }

  /**
   * List all transform blocks for a workflow
   */
  async listBlocks(workflowId: string, userId: string): Promise<TransformBlock[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);
    return this.blockRepo.findByWorkflowId(workflowId);
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
    await this.workflowSvc.verifyAccess(block.workflowId, userId);

    return block;
  }

  /**
   * Update a transform block
   * Also updates the virtual step if outputKey changes
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

    // If outputKey is changing, update the virtual step's alias
    if (data.outputKey && data.outputKey !== block.outputKey && block.virtualStepId) {
      await this.stepRepo.update(block.virtualStepId, {
        alias: data.outputKey,
        title: `Computed: ${data.name || block.name}`,
      });

      logger.info({
        blockId: block.id,
        virtualStepId: block.virtualStepId,
        oldOutputKey: block.outputKey,
        newOutputKey: data.outputKey,
      }, "Updated virtual step alias for transform block");
    }

    // Also update virtual step title if name changes
    if (data.name && data.name !== block.name && block.virtualStepId) {
      await this.stepRepo.update(block.virtualStepId, {
        title: `Computed: ${data.name}`,
      });
    }

    return this.blockRepo.update(blockId, data);
  }

  /**
   * Delete a transform block
   * Also deletes the associated virtual step
   */
  async deleteBlock(blockId: string, userId: string): Promise<void> {
    const block = await this.getBlock(blockId, userId); // Verify ownership

    // Delete the virtual step first (if it exists)
    if (block.virtualStepId) {
      try {
        await this.stepRepo.delete(block.virtualStepId);
        logger.info({
          blockId: block.id,
          virtualStepId: block.virtualStepId,
        }, "Deleted virtual step for transform block");
      } catch (error) {
        // Log but don't fail - the step might have been manually deleted
        logger.warn({
          error,
          blockId: block.id,
          virtualStepId: block.virtualStepId,
        }, "Failed to delete virtual step (may not exist)");
      }
    }

    // Delete the transform block
    await this.blockRepo.delete(blockId);
  }

  /**
   * Execute a single transform block against sample data
   */
  async executeBlock(params: {
    block: TransformBlock;
    data: Record<string, unknown>;
    runId?: string;
  }): Promise<{ ok: boolean; output?: unknown; error?: string; errorDetails?: { message: string; stack?: string; name?: string; line?: number; column?: number } }> {
    const { block, data, runId } = params;

    // Fetch all steps for the workflow to build alias-to-ID mapping
    const sections = await this.sectionRepo.findByWorkflowId(block.workflowId);
    const sectionIds = sections.map(s => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds, undefined, true);

    const aliasToIdMap = new Map<string, string>();
    for (const step of steps) {
      if (step.alias) {aliasToIdMap.set(step.alias, step.id);}
    }

    const input: Record<string, unknown> = {};
    for (const key of block.inputKeys || []) {
      const resolvedId = aliasToIdMap.get(key);
      const dataKey = (resolvedId && resolvedId in data) ? resolvedId : key;
      const resolvedKey = (resolvedId && resolvedId in data) ? key : key;

      if (dataKey in data) {
        input[resolvedKey] = data[dataKey];
      }
    }

    const result = await scriptEngine.execute({
      language: block.language,
      code: block.code,
      inputKeys: Object.keys(input), // We already filtered input
      data: input, // Pass prepared input as data
      context: {
        workflowId: block.workflowId,
        runId: runId || 'preview-or-test',
        phase: 'transform_block',
        metadata: {
          blockId: block.id,
          blockName: block.name
        }
      },
      timeoutMs: block.timeoutMs || 1000
    });

    if (result.ok) {
      return { ok: true, output: result.output };
    } else {
      return {
        ok: false,
        error: result.error,
        // errorDetails can be parsed if needed, but keeping it simple for now
      };
    }
  }

  /**
   * Test a transform block with sample data (preview/test endpoint)
   */
  async testBlock(
    blockId: string,
    userId: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean; data?: { output: unknown }; error?: string; errorDetails?: { message: string; stack?: string; name?: string; line?: number; column?: number } }> {
    const block = await this.getBlock(blockId, userId);

    const result = await this.executeBlock({ block, data });

    if (result.ok) {
      return {
        success: true,
        data: { output: result.output },
      };
    } else {
      // Format detailed error message
      let formattedError = result.error || "Unknown error";
      if (result.errorDetails) {
        const details = result.errorDetails;
        const parts = [formattedError];

        if (details.line !== undefined) {
          parts.push(`at line ${details.line}${details.column !== undefined ? `, column ${details.column}` : ''}`);
        }

        formattedError = parts.join('\n');
      }

      return {
        success: false,
        error: formattedError,
        errorDetails: result.errorDetails,
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

        // Persist output to step_values using the virtual step ID
        // This allows the value to be referenced in subsequent logic or blocks
        if (block.virtualStepId) {
          try {
            await this.valueRepo.upsert({
              runId,
              stepId: block.virtualStepId, // Use virtual step's UUID
              value: result.output as Record<string, unknown> | string | number | boolean | null,
            });
            logger.debug({
              blockId: block.id,
              virtualStepId: block.virtualStepId,
              outputKey: block.outputKey,
            }, `Persisted transform block output to virtual step`);
          } catch (error) {
            logger.error({
              error,
              blockId: block.id,
              virtualStepId: block.virtualStepId,
            }, `Failed to persist transform block output for ${block.name}`);
            // Continue execution even if persistence fails
          }
        } else {
          logger.warn({
            blockId: block.id,
            blockName: block.name,
          }, `Transform block has no virtual step - output will not be persisted. This block may need migration.`);
        }
      } else {
        // Determine if it's a timeout or error
        const status = result.error?.includes("TimeoutError") ? "timeout" : "error";

        // Format detailed error message
        let detailedError = result.error || "Unknown error";
        if (result.errorDetails) {
          const details = result.errorDetails;
          const parts = [detailedError];

          if (details.line !== undefined) {
            parts.push(`at line ${details.line}${details.column !== undefined ? `, column ${details.column}` : ''}`);
          }

          if (details.stack) {
            // Include relevant parts of the stack trace
            parts.push('\nStack trace:');
            parts.push(details.stack.slice(0, 2000)); // Include up to 2000 chars of stack
          }

          detailedError = parts.join('\n');
        }

        // Update audit log
        await this.runRepo.completeRun(auditRun.id, {
          finishedAt,
          status,
          errorMessage: detailedError.slice(0, 3000), // Allow more space for detailed errors
        });

        // Collect error with details
        errors.push({
          blockId: block.id,
          blockName: block.name,
          error: detailedError,
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

        // Persist output to step_values using the virtual step ID
        if (block.virtualStepId) {
          try {
            await this.valueRepo.upsert({
              runId,
              stepId: block.virtualStepId, // Use virtual step's UUID
              value: result.output as Record<string, unknown> | string | number | boolean | null,
            });
            logger.debug({
              blockId: block.id,
              virtualStepId: block.virtualStepId,
              outputKey: block.outputKey,
            }, `Persisted transform block output to virtual step`);
          } catch (error) {
            logger.error({
              error,
              blockId: block.id,
              virtualStepId: block.virtualStepId,
            }, `Failed to persist transform block output for ${block.name}`);
            // Continue execution even if persistence fails
          }
        } else {
          logger.warn({
            blockId: block.id,
            blockName: block.name,
          }, `Transform block has no virtual step - output will not be persisted. This block may need migration.`);
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
