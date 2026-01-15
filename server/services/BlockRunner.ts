
import type { Block } from "@shared/schema";
import type {
  BlockContext,
  BlockResult,
  BlockPhase,
} from "@shared/types/blocks";
import type { LifecycleHookPhase } from "@shared/types/scripting";

import { db } from "../db";
import { logger } from "../logger";

import { analyticsService } from "./analytics/AnalyticsService";

// Import specialized block runners
import { BranchBlockRunner } from "./blockRunners/BranchBlockRunner";
import { CollectionBlockRunner } from "./blockRunners/CollectionBlockRunner";
import { ExternalSendBlockRunner } from "./blockRunners/ExternalSendBlockRunner";
import { ListToolsBlockRunner } from "./blockRunners/ListToolsBlockRunner";
import { PrefillBlockRunner } from "./blockRunners/PrefillBlockRunner";
import { QueryBlockRunner } from "./blockRunners/QueryBlockRunner";
import { ReadTableBlockRunner } from "./blockRunners/ReadTableBlockRunner";
import { ValidateBlockRunner } from "./blockRunners/ValidateBlockRunner";
import { WriteBlockRunner } from "./blockRunners/WriteBlockRunner";
import { blockService } from "./BlockService";
import { lifecycleHookService } from "./scripting/LifecycleHookService";
import { transformBlockService } from "./TransformBlockService";

import type { IBlockRunner } from "./blockRunners/types";


/**
 * BlockRunner Service
 * Executes blocks at various workflow runtime phases
 * Handles both generic blocks (prefill, validate, branch) and transform blocks (JS/Python)
 *
 * REFACTORED: Now uses strategy pattern with specialized block runners
 */
export class BlockRunner {
  private blockSvc: typeof blockService;
  private transformSvc: typeof transformBlockService;
  private runnerRegistry: Map<string, IBlockRunner>;

  constructor(
    blockSvc?: typeof blockService,
    transformSvc?: typeof transformBlockService
  ) {
    this.blockSvc = blockSvc || blockService;
    this.transformSvc = transformSvc || transformBlockService;

    // Initialize runner registry with specialized runners
    this.runnerRegistry = new Map();
    this.registerRunner(new PrefillBlockRunner());
    this.registerRunner(new ValidateBlockRunner());
    this.registerRunner(new BranchBlockRunner());
    this.registerRunner(new QueryBlockRunner());
    this.registerRunner(new WriteBlockRunner());
    this.registerRunner(new ExternalSendBlockRunner());
    this.registerRunner(new ReadTableBlockRunner());
    this.registerRunner(new ListToolsBlockRunner());

    // Collection runner handles multiple types
    const collectionRunner = new CollectionBlockRunner();
    this.runnerRegistry.set("create_record", collectionRunner);
    this.runnerRegistry.set("update_record", collectionRunner);
    this.runnerRegistry.set("find_record", collectionRunner);
    this.runnerRegistry.set("delete_record", collectionRunner);
  }

  /**
   * Register a block runner
   */
  private registerRunner(runner: IBlockRunner): void {
    this.runnerRegistry.set(runner.getBlockType(), runner);
  }

  /**
   * Get runner for a block type
   */
  private getRunner(blockType: string): IBlockRunner | undefined {
    return this.runnerRegistry.get(blockType);
  }

  /**
   * Run all blocks for a given phase WITH TRANSACTION WRAPPER
   * Execution order: lifecycle hooks → transform blocks → generic blocks
   *
   * TRANSACTION FIX: All write operations within this phase are wrapped in a single database
   * transaction. If any block fails, all previous writes are rolled back atomically.
   * Use this for critical workflows where data consistency is essential.
   *
   * NOTE: External side effects (HTTP calls, emails, external APIs) cannot be rolled back
   * by database transactions. Design your workflows accordingly.
   */
  async runPhaseWithTransaction(context: BlockContext): Promise<BlockResult> {
    return db.transaction(async (tx) => {
      // Execute the phase with transaction context
      return this.runPhase(context, tx);
    });
  }

  /**
   * Run all blocks for a given phase
   * Execution order: lifecycle hooks → transform blocks → generic blocks
   * Returns combined result from all blocks
   *
   * NOTE: Individual write operations use transactions (see WriteRunner), but cross-block
   * operations are not wrapped in a single transaction by default. Each block commits independently.
   * Use runPhaseWithTransaction() for atomic cross-block operations.
   *
   * @param context - Block execution context
   * @param tx - Optional database transaction (for atomic cross-block operations)
   */
  async runPhase(context: BlockContext, tx?: any): Promise<BlockResult> {
    let currentData = { ...context.data };
    const allErrors: string[] = [];
    let nextSectionId: string | undefined;

    // 0. Execute lifecycle hooks BEFORE other blocks (if runId is provided)
    if (context.runId) {
      // Map block phases to lifecycle hook phases
      const lifecyclePhaseMap: Record<BlockPhase, LifecycleHookPhase | null> = {
        onRunStart: null, // No lifecycle hook phase for onRunStart (could add if needed)
        onSectionEnter: "beforePage",
        onSectionSubmit: "afterPage",
        onNext: null, // No lifecycle hook phase for onNext
        onRunComplete: null, // No lifecycle hook phase for onRunComplete (could add beforeFinalBlock later)
      };

      const lifecyclePhase = lifecyclePhaseMap[context.phase];

      if (lifecyclePhase) {
        try {
          const lifecycleResult = await lifecycleHookService.executeHooksForPhase({
            workflowId: context.workflowId,
            runId: context.runId,
            phase: lifecyclePhase,
            sectionId: context.sectionId,
            data: currentData,
            userId: context.queryParams?.userId, // Optional user ID from context
          });

          // Merge lifecycle hook outputs into data
          currentData = { ...currentData, ...lifecycleResult.data };

          // Collect any lifecycle hook errors (non-breaking)
          if (lifecycleResult.errors) {
            for (const error of lifecycleResult.errors) {
              allErrors.push(`Lifecycle hook "${error.hookName}": ${error.error}`);
            }
          }

          // Log console output from lifecycle hooks (debug)
          if (lifecycleResult.consoleOutput && lifecycleResult.consoleOutput.length > 0) {
            logger.debug(
              {
                phase: lifecyclePhase,
                hookCount: lifecycleResult.consoleOutput.length,
              },
              "Lifecycle hooks produced console output"
            );
          }
        } catch (error) {
          logger.error({ error }, "Error executing lifecycle hooks in phase");
          allErrors.push(
            `Lifecycle hook execution failed: ${error instanceof Error ? error.message : "unknown error"}`
          );
        }
      }
    }

    // 1. Execute transform blocks (if runId is provided)
    if (context.runId) {
      try {
        const transformResult = await this.transformSvc.executeAllForPhase({
          workflowId: context.workflowId,
          runId: context.runId,
          phase: context.phase,
          sectionId: context.sectionId,
          data: currentData,
        });

        // Merge transform block outputs into data
        currentData = { ...currentData, ...transformResult.data };

        // Collect any transform block errors
        if (transformResult.errors) {
          for (const error of transformResult.errors) {
            allErrors.push(`Transform block "${error.blockName}": ${error.error}`);
          }
        }
      } catch (error) {
        logger.error({ error }, "Error executing transform blocks in phase");
        allErrors.push(`Transform block execution failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    // 2. Execute generic blocks (prefill, validate, branch)
    const blocks = await this.blockSvc.getBlocksForPhase(
      context.workflowId,
      context.phase,
      context.sectionId
    );

    if (blocks.length === 0 && allErrors.length === 0) {
      return { success: true, data: currentData };
    }

    // Execute blocks in order
    for (const block of blocks) {
      const result = await this.executeBlock(block, {
        ...context,
        data: currentData,
      });

      if (!result.success) {
        if (result.errors) {
          allErrors.push(...result.errors);
        }
      }

      // Merge data updates from prefill blocks
      if (result.data) {
        currentData = { ...currentData, ...result.data };
      }

      // Capture branch decision (only first match wins)
      if (result.nextSectionId && !nextSectionId) {
        nextSectionId = result.nextSectionId;
      }
    }

    return {
      success: allErrors.length === 0,
      data: currentData,
      errors: allErrors.length > 0 ? allErrors : undefined,
      nextSectionId,
    };
  }

  /**
   * Execute a single block using strategy pattern
   *
   * REFACTORED: Delegates to specialized block runners based on block type
   */
  private async executeBlock(block: Block, context: BlockContext): Promise<BlockResult> {
    // Stage 15: Analytics - Block Start
    // ERROR HANDLING FIX: Wrap analytics in try/catch to prevent workflow crashes
    if (context.runId) {
      try {
        await analyticsService.recordEvent({
          runId: context.runId,
          workflowId: context.workflowId,
          versionId: context.versionId || 'draft',
          type: 'block.start',
          blockId: block.id,
          pageId: context.sectionId,
          timestamp: new Date().toISOString(),
          isPreview: context.mode === 'preview',
          payload: {
            blockType: block.type
          }
        });
      } catch (analyticsError) {
        // Log but don't fail the workflow due to analytics failures
        logger.warn({ error: analyticsError, blockId: block.id }, 'Failed to record block.start analytics event');
      }
    }

    let result: BlockResult;

    try {
      // Get appropriate runner for this block type
      const runner = this.getRunner(block.type as string);

      if (runner) {
        // Delegate to specialized runner
        result = await runner.execute(block.config, context, block);
      } else {
        logger.warn(`Unknown block type: ${block.type}`);
        result = { success: true };
      }
    } catch (error) {
      // Catch unexpected errors during block execution
      const errorMsg = error instanceof Error ? error.message : "unknown error";

      // ERROR HANDLING FIX: Wrap analytics in try/catch
      if (context.runId) {
        try {
          await analyticsService.recordEvent({
            runId: context.runId,
            workflowId: context.workflowId,
            versionId: context.versionId || 'draft',
            type: 'block.error',
            blockId: block.id,
            pageId: context.sectionId,
            timestamp: new Date().toISOString(),
            isPreview: context.mode === 'preview',
            payload: {
              error: errorMsg,
              blockType: block.type
            }
          });
        } catch (analyticsError) {
          logger.warn({ error: analyticsError, blockId: block.id }, 'Failed to record block.error analytics event');
        }
      }
      throw error;
    }

    // Stage 15: Analytics - Block End (Complete or Validated Error)
    // ERROR HANDLING FIX: Wrap analytics in try/catch
    if (context.runId) {
      try {
        const eventType = result.success ? 'block.complete' : 'validation.error';

        await analyticsService.recordEvent({
          runId: context.runId,
          workflowId: context.workflowId,
          versionId: context.versionId || 'draft',
          type: eventType,
          blockId: block.id,
          pageId: context.sectionId,
          timestamp: new Date().toISOString(),
          isPreview: context.mode === 'preview',
          payload: {
            blockType: block.type,
            errors: result.errors
          }
        });
      } catch (analyticsError) {
        logger.warn({ error: analyticsError, blockId: block.id }, 'Failed to record block completion analytics event');
      }
    }

    return result;
  }

}

// Singleton instance
export const blockRunner = new BlockRunner();
