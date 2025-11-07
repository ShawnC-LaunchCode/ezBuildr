import { blockService } from "./BlockService";
import { transformBlockService } from "./TransformBlockService";
import type {
  BlockPhase,
  BlockContext,
  BlockResult,
  PrefillConfig,
  ValidateConfig,
  BranchConfig,
  WhenCondition,
  AssertExpression,
  ComparisonOperator,
  AssertionOperator,
} from "@shared/types/blocks";
import type { Block } from "@shared/schema";
import { logger } from "../logger";

/**
 * BlockRunner Service
 * Executes blocks at various workflow runtime phases
 * Handles both generic blocks (prefill, validate, branch) and transform blocks (JS/Python)
 */
export class BlockRunner {
  private blockSvc: typeof blockService;
  private transformSvc: typeof transformBlockService;

  constructor(
    blockSvc?: typeof blockService,
    transformSvc?: typeof transformBlockService
  ) {
    this.blockSvc = blockSvc || blockService;
    this.transformSvc = transformSvc || transformBlockService;
  }

  /**
   * Run all blocks for a given phase
   * Executes transform blocks (JS/Python) first, then generic blocks (prefill, validate, branch)
   * Returns combined result from all blocks
   */
  async runPhase(context: BlockContext): Promise<BlockResult> {
    let currentData = { ...context.data };
    const allErrors: string[] = [];
    let nextSectionId: string | undefined;

    // 1. Execute transform blocks first (if runId is provided)
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
   * Execute a single block
   */
  private async executeBlock(block: Block, context: BlockContext): Promise<BlockResult> {
    switch (block.type) {
      case "prefill":
        return this.executePrefillBlock(block.config as PrefillConfig, context);

      case "validate":
        return this.executeValidateBlock(block.config as ValidateConfig, context);

      case "branch":
        return this.executeBranchBlock(block.config as BranchConfig, context);

      default:
        logger.warn(`Unknown block type: ${(block as any).type}`);
        return { success: true };
    }
  }

  /**
   * Execute prefill block
   * Seeds data with static values or query parameters
   */
  private executePrefillBlock(config: PrefillConfig, context: BlockContext): BlockResult {
    const updates: Record<string, any> = {};
    const overwrite = config.overwrite ?? false;

    if (config.mode === "static" && config.staticMap) {
      for (const [key, value] of Object.entries(config.staticMap)) {
        // Only set if key doesn't exist or overwrite is true
        if (overwrite || context.data[key] === undefined) {
          updates[key] = value;
        }
      }
    } else if (config.mode === "query" && config.queryKeys && context.queryParams) {
      for (const key of config.queryKeys) {
        const value = context.queryParams[key];
        if (value !== undefined) {
          // Only set if key doesn't exist or overwrite is true
          if (overwrite || context.data[key] === undefined) {
            updates[key] = value;
          }
        }
      }
    }

    return {
      success: true,
      data: updates,
    };
  }

  /**
   * Execute validate block
   * Validates data against rules and returns error messages
   */
  private executeValidateBlock(config: ValidateConfig, context: BlockContext): BlockResult {
    const errors: string[] = [];

    for (const rule of config.rules) {
      // Check when condition (if present)
      if (rule.when) {
        const conditionMet = this.evaluateCondition(rule.when, context.data);
        if (!conditionMet) {
          continue; // Skip this rule if condition not met
        }
      }

      // Evaluate assertion
      const assertionPassed = this.evaluateAssertion(rule.assert, context.data);
      if (!assertionPassed) {
        errors.push(rule.message);
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute branch block
   * Evaluates conditions and returns next section decision
   */
  private executeBranchBlock(config: BranchConfig, context: BlockContext): BlockResult {
    // Evaluate branches in order (first match wins)
    for (const branch of config.branches) {
      const conditionMet = this.evaluateCondition(branch.when, context.data);
      if (conditionMet) {
        return {
          success: true,
          nextSectionId: branch.gotoSectionId,
        };
      }
    }

    // No branch matched, use fallback
    return {
      success: true,
      nextSectionId: config.fallbackSectionId,
    };
  }

  /**
   * Evaluate a when condition
   */
  private evaluateCondition(condition: WhenCondition, data: Record<string, any>): boolean {
    const actualValue = data[condition.key];
    return this.compareValues(actualValue, condition.op, condition.value);
  }

  /**
   * Evaluate an assertion
   */
  private evaluateAssertion(assertion: AssertExpression, data: Record<string, any>): boolean {
    const actualValue = data[assertion.key];

    switch (assertion.op) {
      case "is_not_empty":
        return !this.isEmpty(actualValue);

      case "greater_than":
        return this.compareNumeric(actualValue, assertion.value!) > 0;

      case "less_than":
        return this.compareNumeric(actualValue, assertion.value!) < 0;

      case "equals":
        return this.isEqual(actualValue, assertion.value);

      case "not_equals":
        return !this.isEqual(actualValue, assertion.value);

      case "regex":
        return this.matchesRegex(actualValue, assertion.value);

      default:
        logger.warn(`Unknown assertion operator: ${assertion.op}`);
        return false;
    }
  }

  /**
   * Compare two values using the specified operator
   */
  private compareValues(
    actualValue: any,
    operator: ComparisonOperator,
    expectedValue?: any
  ): boolean {
    switch (operator) {
      case "equals":
        return this.isEqual(actualValue, expectedValue);

      case "not_equals":
        return !this.isEqual(actualValue, expectedValue);

      case "contains":
        return this.contains(actualValue, expectedValue);

      case "greater_than":
        return this.compareNumeric(actualValue, expectedValue) > 0;

      case "less_than":
        return this.compareNumeric(actualValue, expectedValue) < 0;

      case "is_empty":
        return this.isEmpty(actualValue);

      case "is_not_empty":
        return !this.isEmpty(actualValue);

      default:
        logger.warn(`Unknown comparison operator: ${operator}`);
        return false;
    }
  }

  /**
   * Check if two values are equal
   */
  private isEqual(actual: any, expected: any): boolean {
    // Handle arrays
    if (Array.isArray(actual) && Array.isArray(expected)) {
      return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
    }

    // Handle strings (case-insensitive)
    if (typeof actual === "string" && typeof expected === "string") {
      return actual.toLowerCase() === expected.toLowerCase();
    }

    // Handle booleans
    if (typeof actual === "boolean" || typeof expected === "boolean") {
      return Boolean(actual) === Boolean(expected);
    }

    // Standard equality
    return actual === expected;
  }

  /**
   * Check if actual contains expected value
   */
  private contains(actual: any, expected: any): boolean {
    if (Array.isArray(actual)) {
      return actual.some((item) => this.isEqual(item, expected));
    }

    if (typeof actual === "string" && typeof expected === "string") {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }

    return false;
  }

  /**
   * Compare two values numerically
   */
  private compareNumeric(actual: any, expected: any): number {
    const numActual = parseFloat(actual);
    const numExpected = parseFloat(expected);

    if (isNaN(numActual) || isNaN(numExpected)) {
      return 0;
    }

    return numActual - numExpected;
  }

  /**
   * Check if value is empty
   */
  private isEmpty(value: any): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === "string") {
      return value.trim() === "";
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    if (typeof value === "object") {
      return Object.keys(value).length === 0;
    }

    return false;
  }

  /**
   * Check if value matches regex pattern
   */
  private matchesRegex(value: any, pattern: any): boolean {
    if (typeof value !== "string") {
      return false;
    }

    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch (error) {
      logger.warn(`Invalid regex pattern: ${pattern}`);
      return false;
    }
  }
}

// Singleton instance
export const blockRunner = new BlockRunner();
