import { blockService } from "./BlockService";
import { transformBlockService } from "./TransformBlockService";
import { collectionService } from "./CollectionService";
import { recordService } from "./RecordService";
import { workflowService } from "./WorkflowService";
import { lifecycleHookService } from "./scripting/LifecycleHookService";
import { db } from "../db";
import { workflowQueriesRepository, stepValueRepository } from "../repositories";
import type {
  BlockPhase,
  BlockContext,
  BlockResult,
  PrefillConfig,
  ValidateConfig,
  BranchConfig,
  CreateRecordConfig,
  UpdateRecordConfig,
  FindRecordConfig,
  DeleteRecordConfig,
  WhenCondition,
  AssertExpression,
  ComparisonOperator,
  AssertionOperator,
  ReadTableConfig,
  ReadTableFilter,
  ReadTableOperator,
  ListToolsConfig,
  ListVariable,
} from "@shared/types/blocks";
import { getValueByPath } from "@shared/conditionEvaluator";
import type { LifecycleHookPhase } from "@shared/types/scripting";
import { Block, workflows, projects, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { queryRunner } from "../lib/queries/QueryRunner";
import type { QueryBlockConfig, WriteBlockConfig, ExternalSendBlockConfig } from "@shared/types/blocks";
import { writeRunner } from "../lib/writes/WriteRunner";
import { externalSendRunner } from "../lib/external/ExternalSendRunner";
import { analyticsService } from "./analytics/AnalyticsService";

// Security: limit regex pattern size to prevent ReDoS
const MAX_REGEX_PATTERN_LENGTH = 100;

/**
 * Redact sensitive PII from logs
 */
function redact(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') return data;

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'ssn', 'social', 'credit', 'card', 'cvv', 'email', 'phone', 'address', 'dob', 'birth'];

  if (Array.isArray(data)) {
    return data.map(item => redact(item));
  }

  const result: any = { ...data };
  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object') {
      result[key] = redact(result[key]);
    }
  }
  return result;
}

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
   * Execute a single block
   */
  /**
   * Execute a single block
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
      switch (block.type as string) {
        case "prefill":
          result = this.executePrefillBlock(block.config as PrefillConfig, context);
          break;

        case "validate":
          result = this.executeValidateBlock(block.config as ValidateConfig, context);
          break;

        case "branch":
          result = this.executeBranchBlock(block.config as BranchConfig, context);
          break;

        case "create_record":
          result = await this.executeCreateRecordBlock(block.config as CreateRecordConfig, context);
          break;

        case "update_record":
          result = await this.executeUpdateRecordBlock(block.config as UpdateRecordConfig, context);
          break;

        case "find_record":
          result = await this.executeFindRecordBlock(block.config as FindRecordConfig, context);
          break;

        case "delete_record":
          result = await this.executeDeleteRecordBlock(block.config as DeleteRecordConfig, context);
          break;

        case "query":
          result = await this.executeQueryBlock(block, context);
          break;

        case "write":
          // Resolve tenantId needed for write operations
          const tenantId = await this.resolveTenantId(context.workflowId);
          if (!tenantId) {
            result = { success: false, errors: ["Tenant ID resolution failed"] };
          } else {
            result = await this.executeWriteBlock(block.config as WriteBlockConfig, context, tenantId, block);
          }
          break;

        case "external_send":
          result = await this.executeExternalSendBlock(block.config as ExternalSendBlockConfig, context);
          break;

        case "read_table":
          // Resolve tenantId needed for read operations
          const readTenantId = await this.resolveTenantId(context.workflowId);
          if (!readTenantId) {
            result = { success: false, errors: ["Tenant ID resolution failed"] };
          } else {
            result = await this.executeReadTableBlock(block.config as ReadTableConfig, context, readTenantId, block);
          }
          break;

        case "list_tools":
          result = await this.executeListToolsBlock(block.config as ListToolsConfig, context, block);
          break;

        default:
          logger.warn(`Unknown block type: ${(block as any).type}`);
          result = { success: true };
          break;
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
    const fieldErrors: Record<string, string[]> = {};

    const addFieldError = (field: string, msg: string) => {
      if (!fieldErrors[field]) fieldErrors[field] = [];
      fieldErrors[field].push(msg);
    };

    for (const rule of config.rules) {
      // Determine rule type (fallback to legacy/simple if no type property)
      const ruleType = (rule as any).type || 'simple';

      if (ruleType === 'compare') {
        // Compare Rule
        const r = rule as any; // Cast to CompareRule
        const leftValue = getValueByPath(context.data, r.left);
        let rightValue;

        if (r.rightType === 'constant') {
          rightValue = r.right;
        } else {
          rightValue = getValueByPath(context.data, r.right);
        }

        const passed = this.compareValues(leftValue, r.op, rightValue);
        if (!passed) {
          errors.push(r.message);
          // Attribute error to left operand field if possible
          if (r.left) {
            // Try to find if r.left is a step alias
            const stepId = context.aliasMap?.[r.left] || r.left;
            addFieldError(stepId, r.message);
          }
        }

      } else if (ruleType === 'conditional_required') {
        // Conditional Required Rule
        const r = rule as any; // Cast to ConditionalRequiredRule
        const conditionMet = this.evaluateCondition(r.when, context.data);

        if (conditionMet) {
          for (const field of r.requiredFields) {
            const stepId = context.aliasMap?.[field] || field;
            const value = context.data[stepId];
            if (this.isEmpty(value)) {
              errors.push(r.message);
              addFieldError(stepId, r.message);
            }
          }
        }

      } else if (ruleType === 'foreach') {
        // For Each Rule
        const r = rule as any; // Cast to ForEachRule
        const list = getValueByPath(context.data, r.listKey);

        if (Array.isArray(list)) {
          list.forEach((item, index) => {
            // Create a scoped data context for the item
            // We flat map item properties with the alias prefix
            // e.g. itemAlias="child", item={name:"Bob"} -> "child.name": "Bob"
            const scopedData = { ...context.data };
            // Flatten item into scopedData with alias prefix
            // Simple approach: just put the item in under the alias
            scopedData[r.itemAlias] = item;

            // Also support direct access if it's a primitive?
            // "child" -> item

            for (const subRule of r.rules) {
              // Recursively validate? Or just simple rules?
              // We support 'compare' and 'simple' inside loop usually.
              // Re-use logic by calling helper?
              // For now, let's implement 'compare' logic inline or extract.
              // To keep it simple, we support legacy/simple assertions on the item.

              // Logic for simple assertions:
              if ((subRule as any).assert) {
                const sRule = subRule as any;
                // Evaluate assertion against scopedData
                // Key might be "child.age"
                const val = getValueByPath(scopedData, sRule.assert.key);
                // If getValueByPath supports "child.age", we are good.

                const passed = this.evaluateAssertion({ ...sRule.assert, key: 'temp' }, { temp: val });
                if (!passed) {
                  errors.push(r.message || sRule.message);
                  // We can't easily map this back to a specific DOM element for array items yet
                  // unless we have specific UI handling for list items.
                  // For now, map to the LIST field itself if possible.
                  const listStepId = context.aliasMap?.[r.listKey] || r.listKey;
                  addFieldError(listStepId, r.message || sRule.message);
                }
              }
            }
          });
        }

      } else {
        // Legacy / Simple Rule
        const r = rule as any;
        // Check when condition (if present)
        if (r.when) {
          const conditionMet = this.evaluateCondition(r.when, context.data);
          if (!conditionMet) {
            continue; // Skip this rule if condition not met
          }
        }

        // Evaluate assertion
        const assertionPassed = this.evaluateAssertion(r.assert, context.data);
        if (!assertionPassed) {
          errors.push(r.message);
          // Attribute to key
          if (r.assert?.key) {
            const stepId = context.aliasMap?.[r.assert.key] || r.assert.key;
            addFieldError(stepId, r.message);
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
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
    const actualValue = getValueByPath(data, condition.key);
    return this.compareValues(actualValue, condition.op, condition.value);
  }

  /**
   * Evaluate an assertion
   */
  private evaluateAssertion(assertion: AssertExpression, data: Record<string, any>): boolean {
    const actualValue = getValueByPath(data, assertion.key);

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
   * Security: Enforces max pattern length
   */
  private matchesRegex(value: any, pattern: any): boolean {
    if (typeof value !== "string") {
      return false;
    }

    try {
      const patternStr = String(pattern);
      if (patternStr.length > MAX_REGEX_PATTERN_LENGTH) {
        logger.warn(`Regex pattern too long (DoS prevention): ${patternStr.slice(0, 50)}...`);
        return false;
      }
      const regex = new RegExp(patternStr);
      return regex.test(value);
    } catch (error) {
      logger.warn(`Invalid regex pattern: ${pattern}`);
      return false;
    }
  }

  /**
   * Helper: Get tenantId from workflowId
   */
  // Helper: Get tenantId from workflowId
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      // Import at top level to avoid circular dependency issues
      const { workflowRepository } = await import('../repositories');
      const workflow = await workflowRepository.findById(workflowId);

      if (!workflow) {
        logger.warn({ workflowId }, "Workflow not found");
        return null;
      }

      // 1. Try Project linkage
      if (workflow.projectId) {
        const { projectRepository } = await import('../repositories');
        const project = await projectRepository.findById(workflow.projectId);
        if (project) {
          return project.tenantId;
        }
        logger.warn({ projectId: workflow.projectId, workflowId }, "Project not found for workflow, falling back to creator");
      }

      // 2. Fallback: Creator's Tenant (Unfiled workflows)
      const { userRepository } = await import('../repositories');
      const creator = await userRepository.findById(workflow.creatorId);

      if (creator && creator.tenantId) {
        return creator.tenantId;
      }

      logger.warn({ workflowId, creatorId: workflow.creatorId }, "Could not resolve tenantId from project or creator");
      return null;
    } catch (error) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }

  /**
   * Execute create_record block
   * Creates a new record in a collection
   */
  private async executeCreateRecordBlock(
    config: CreateRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      // Get tenantId from workflow
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      // Build record data from fieldMap
      const recordData: Record<string, any> = {};
      const { aliasMap } = context;

      for (const [fieldSlug, stepAlias] of Object.entries(config.fieldMap)) {
        // Resolve stepAlias to stepId if possible
        const dataKey = aliasMap?.[stepAlias] || stepAlias;
        const value = context.data[dataKey];

        if (value !== undefined && value !== null) {
          recordData[fieldSlug] = value;
        }
      }

      logger.info({ tenantId, collectionId: config.collectionId, recordData: redact(recordData) }, "Creating record via block");

      // Create the record
      const record = await recordService.createRecord({
        tenantId,
        collectionId: config.collectionId,
        data: recordData,
      });

      const updates: Record<string, any> = {};
      if (config.outputKey) {
        updates[config.outputKey] = record.id;
      }

      return {
        success: true,
        data: updates,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing create_record block");
      return {
        success: false,
        errors: [`Failed to create record: ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }

  /**
   * Execute update_record block
   * Updates an existing record in a collection
   */
  private async executeUpdateRecordBlock(
    config: UpdateRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      // Get tenantId from workflow
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      const { aliasMap } = context;
      const recordIdKey = aliasMap?.[config.recordIdKey] || config.recordIdKey;
      const recordId = context.data[recordIdKey];

      if (!recordId) {
        return {
          success: false,
          errors: [`Record ID not found in data key: ${config.recordIdKey}`],
        };
      }

      // Build update data from fieldMap
      const updateData: Record<string, any> = {};
      for (const [fieldSlug, stepAlias] of Object.entries(config.fieldMap)) {
        // Resolve stepAlias to stepId if possible
        const dataKey = aliasMap?.[stepAlias] || stepAlias;
        const value = context.data[dataKey];

        if (value !== undefined && value !== null) {
          updateData[fieldSlug] = value;
        }
      }

      logger.info({ tenantId, collectionId: config.collectionId, recordId, updateData: redact(updateData) }, "Updating record via block");

      // Update the record
      await recordService.updateRecord(recordId, tenantId, updateData);

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing update_record block");
      return {
        success: false,
        errors: [`Failed to update record: ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }

  /**
   * Execute find_record block
   * Queries records and returns matches
   */
  private async executeFindRecordBlock(
    config: FindRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      // Get tenantId from workflow
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      logger.info({ tenantId, collectionId: config.collectionId, filters: config.filters }, "Finding records via block");

      // TYPE SAFETY FIX: Remove 'as any' cast and add proper null checking
      // Query records with filters
      const result = await recordService.findByFilters(
        tenantId,
        config.collectionId,
        (config.filters || []) as any[],
        { page: 1, limit: config.limit || 1 }
      ) as any;

      // NULL CHECK FIX: Validate result structure before accessing properties
      if (!result || !result.records || !Array.isArray(result.records)) {
        return {
          success: false,
          errors: ['Invalid response from record service']
        };
      }

      if (result.records.length === 0 && config.failIfNotFound) {
        return {
          success: false,
          errors: ["No records found matching the criteria"],
        };
      }

      const updates: Record<string, any> = {};
      // If limit is 1, return single record, otherwise return array
      updates[config.outputKey] = config.limit === 1 ? (result.records[0] || null) : result.records;

      return {
        success: true,
        data: updates,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing find_record block");
      return {
        success: false,
        errors: [`Failed to find records: ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }

  /**
   * Execute delete_record block
   * Deletes a record from a collection
   */
  private async executeDeleteRecordBlock(
    config: DeleteRecordConfig,
    context: BlockContext
  ): Promise<BlockResult> {
    try {
      // Get tenantId from workflow
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      const { aliasMap } = context;
      const recordIdKey = aliasMap?.[config.recordIdKey] || config.recordIdKey;
      const recordId = context.data[recordIdKey];

      if (!recordId) {
        return {
          success: false,
          errors: [`Record ID not found in data key: ${config.recordIdKey}`],
        };
      }

      logger.info({ tenantId, collectionId: config.collectionId, recordId }, "Deleting record via block");

      // Delete the record
      await recordService.deleteRecord(tenantId, config.collectionId, recordId);

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ error, config }, "Error executing delete_record block");
      return {
        success: false,
        errors: [`Failed to delete record: ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }

  /**
   * Execute query block
   * Fetches data using the Query Runner
   */
  private async executeQueryBlock(
    block: Block,
    context: BlockContext
  ): Promise<BlockResult> {
    const config = block.config as QueryBlockConfig;

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

      // Execute query with current context data
      const listVariable = await queryRunner.executeQuery(query, context.data, tenantId);

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
          // We don't fail the block execution just because persistence failed (though it's critical for downstream)
          // Actually, for query blocks, if we don't persist, downstream logic can't use it.
          // But we also return it in `data`.
          // Let's fallback to just logging.
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
   * Execute write block
   * Writes data to a native table using WriteRunner
   */
  /**
   * Resolve Tenant ID from Workflow ID
   */
  private async resolveTenantId(workflowId: string): Promise<string | null> {
    try {
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

      return creatorResult?.tenantId || null;
    } catch (e) {
      logger.error({ error: e, workflowId }, "Failed to resolve tenant ID");
      return null;
    }
  }

  /**
   * Execute write block
   * Writes data to a native table using WriteRunner
   */
  private async executeWriteBlock(
    config: WriteBlockConfig,
    context: BlockContext,
    tenantId: string,
    block: Block
  ): Promise<BlockResult> {
    try {
      // Check runCondition
      if (config.runCondition) {
        const shouldRun = this.evaluateCondition(config.runCondition, context.data);
        if (!shouldRun) {
          logger.info({ phase: context.phase }, "Skipping write block due to condition");
          return { success: true };
        }
      }

      // Determine if preview mode
      const isPreview = context.mode === 'preview';

      const result = await writeRunner.executeWrite(config, context, tenantId, isPreview);

      if (!result.success) {
        return {
          success: false,
          errors: [result.error || "Write operation failed"]
        };
      }

      // Persist output to virtual step if configured
      const updates: Record<string, any> = {};
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
   * Execute external send block
   */
  /**
   * Execute external send block
   */
  private async executeExternalSendBlock(
    config: ExternalSendBlockConfig,
    context: BlockContext
  ): Promise<BlockResult> {
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
        context.mode || 'live'
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
   * Execute read table block
   * Reads data from a DataVault table and outputs a List
   */
  private async executeReadTableBlock(
    config: ReadTableConfig,
    context: BlockContext,
    tenantId: string,
    block: Block
  ): Promise<BlockResult> {
    try {
      // Check runCondition
      if (config.runCondition) {
        const shouldRun = this.evaluateCondition(config.runCondition, context.data);
        if (!shouldRun) {
          logger.info({ phase: context.phase }, "Skipping read_table block due to condition");
          return { success: true };
        }
      }

      // Import services dynamically to avoid circular dependencies
      const { datavaultTablesService } = await import('./DatavaultTablesService');
      const { datavaultRowsService } = await import('./DatavaultRowsService');
      const { datavaultColumnsRepository } = await import('../repositories');

      // Verify table exists and belongs to tenant
      let table;
      try {
        table = await datavaultTablesService.verifyTenantOwnership(config.tableId, tenantId);
      } catch (error) {
        return {
          success: false,
          errors: [(error as Error).message]
        };
      }

      // Get table columns for metadata
      const allColumns = await datavaultColumnsRepository.findByTableId(config.tableId);
      const columnMap = new Map(allColumns.map(c => [c.id, c]));

      // Determine selected columns for output
      let outputColumns = allColumns;
      if (config.columns && config.columns.length > 0) {
        outputColumns = allColumns.filter(c => config.columns!.includes(c.id));
      }

      // Build filter conditions
      let filterConditions: any[] = [];
      if (config.filters && config.filters.length > 0) {
        filterConditions = config.filters.map(filter => {
          const column = columnMap.get(filter.columnId);
          if (!column) {
            logger.warn({ columnId: filter.columnId }, "Filter references unknown column");
            return null;
          }

          // Resolve value from context data if it's a variable reference
          let resolvedValue = filter.value;
          if (typeof filter.value === 'string' && filter.value.startsWith('{{') && filter.value.endsWith('}}')) {
            const variableName = filter.value.slice(2, -2).trim();
            const dataKey = context.aliasMap?.[variableName] || variableName;
            resolvedValue = context.data[dataKey];
          }

          return {
            columnId: filter.columnId,
            column,
            operator: filter.operator,
            value: resolvedValue
          };
        }).filter(Boolean);
      }

      // Query rows with filters
      const limit = config.limit || 100;
      const rows = await this.queryTableRows({
        tableId: config.tableId,
        tenantId,
        filters: filterConditions,
        sort: config.sort,
        limit,
        columns: columnMap
      });

      // Build standardized list variable result
      const listVariable = {
        metadata: {
          source: 'read_table' as const,
          sourceId: config.tableId,
          tableName: table.name,
          queryParams: {
            filters: config.filters,
            sort: config.sort,
            limit: config.limit,
            selectedColumns: config.columns // Add metadata about selection
          },
          filteredBy: config.filters?.map(f => f.columnId),
          sortedBy: config.sort
        },
        rows: rows.map(row => {
          // Convert internal row structure to column name-accessible object
          const rowData: Record<string, any> = { id: row.id };
          for (const col of outputColumns) {
            rowData[col.id] = row.data?.[col.id] ?? null;
          }
          return rowData;
        }),
        count: rows.length,
        columns: outputColumns.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type
        }))
      };

      // Persist to virtual step if runId is present
      const persistenceWarnings: string[] = [];
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
            rowCount: listVariable.count
          }, "Persisted read_table block output");
        } catch (error) {
          // ERROR HANDLING FIX: Don't silently continue - track persistence failures
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error, blockId: block.id }, "Failed to persist read_table block output");
          persistenceWarnings.push(`Warning: Failed to persist output to virtual step: ${errorMsg}`);
        }
      }

      return {
        success: true,
        data: {
          [config.outputKey]: listVariable
        },
        // Include warnings if persistence failed (non-breaking but should be visible)
        ...(persistenceWarnings.length > 0 ? { errors: persistenceWarnings } : {})
      };

    } catch (error) {
      logger.error({ error, config }, "Read table block failed");
      return {
        success: false,
        errors: [`Read table failed: ${error instanceof Error ? error.message : 'unknown error'}`]
      };
    }
  }

  /**
   * Query table rows with filters and sorting
   * Internal helper method for read_table block
   */
  private async queryTableRows(params: {
    tableId: string;
    tenantId: string;
    filters: Array<{
      columnId: string;
      column: any;
      operator: ReadTableOperator;
      value: any;
    }>;
    sort?: { columnId: string; direction: "asc" | "desc" };
    limit: number;
    columns: Map<string, any>;
  }): Promise<any[]> {
    const { datavaultRows } = await import('@shared/schema');
    const { and, eq, like, sql, desc, asc } = await import('drizzle-orm');

    // Build WHERE conditions
    const whereConditions = [eq(datavaultRows.tableId, params.tableId)];

    for (const filter of params.filters) {
      // SECURITY FIX: Validate columnId to prevent SQL injection
      // Only allow alphanumeric characters, underscores, and hyphens
      if (!/^[a-zA-Z0-9_-]+$/.test(filter.columnId)) {
        logger.warn({ columnId: filter.columnId }, 'Invalid columnId detected - skipping filter');
        continue;
      }

      const columnPath = `data->>'${filter.columnId}'`;

      switch (filter.operator) {
        case 'equals':
          if (filter.value !== null && filter.value !== undefined) {
            whereConditions.push(sql`${sql.raw(columnPath)} = ${filter.value}`);
          }
          break;

        case 'not_equals':
          if (filter.value !== null && filter.value !== undefined) {
            whereConditions.push(sql`${sql.raw(columnPath)} != ${filter.value}`);
          }
          break;

        case 'contains':
          if (filter.value) {
            whereConditions.push(sql`${sql.raw(columnPath)} LIKE ${'%' + filter.value + '%'}`);
          }
          break;

        case 'starts_with':
          if (filter.value) {
            whereConditions.push(sql`${sql.raw(columnPath)} LIKE ${filter.value + '%'}`);
          }
          break;

        case 'ends_with':
          if (filter.value) {
            whereConditions.push(sql`${sql.raw(columnPath)} LIKE ${'%' + filter.value}`);
          }
          break;

        case 'greater_than':
          if (filter.column.type === 'number') {
            whereConditions.push(sql`(${sql.raw(columnPath)})::numeric > ${filter.value}`);
          } else if (filter.column.type === 'date' || filter.column.type === 'datetime') {
            whereConditions.push(sql`${sql.raw(columnPath)} > ${filter.value}`);
          }
          break;

        case 'less_than':
          if (filter.column.type === 'number') {
            whereConditions.push(sql`(${sql.raw(columnPath)})::numeric < ${filter.value}`);
          } else if (filter.column.type === 'date' || filter.column.type === 'datetime') {
            whereConditions.push(sql`${sql.raw(columnPath)} < ${filter.value}`);
          }
          break;

        case 'is_empty':
          whereConditions.push(sql`(${sql.raw(columnPath)} IS NULL OR ${sql.raw(columnPath)} = '')`);
          break;

        case 'is_not_empty':
          whereConditions.push(sql`(${sql.raw(columnPath)} IS NOT NULL AND ${sql.raw(columnPath)} != '')`);
          break;

        case 'in':
          if (Array.isArray(filter.value) && filter.value.length > 0) {
            // SECURITY FIX: Use parameterized array instead of string concatenation
            // This prevents SQL injection through the IN clause values
            const values = filter.value.map(v => String(v));
            whereConditions.push(sql`${sql.raw(columnPath)} = ANY(${values})`);
          }
          break;
      }
    }

    // Build query
    let query = db
      .select()
      .from(datavaultRows)
      .where(and(...whereConditions))
      .limit(params.limit);

    // Add sorting
    if (params.sort) {
      const sortColumn = params.columns.get(params.sort.columnId);
      if (sortColumn) {
        // SECURITY FIX: Validate columnId to prevent SQL injection
        if (!/^[a-zA-Z0-9_-]+$/.test(params.sort.columnId)) {
          logger.warn({ columnId: params.sort.columnId }, 'Invalid sort columnId detected - skipping sort');
        } else {
          const columnPath = `data->>'${params.sort.columnId}'`;
          if (params.sort.direction === 'asc') {
            query = (query as any).orderBy(sql`${sql.raw(columnPath)} ASC`);
          } else {
            query = (query as any).orderBy(sql`${sql.raw(columnPath)} DESC`);
          }
        }
      }
    }

    const rows = await query;
    return rows;
  }

  /**
   * Execute comprehensive list tools block
   * Applies operations in sequence: filter → sort → offset/limit → select → dedupe
   */
  private async executeListToolsBlock(
    config: ListToolsConfig,
    context: BlockContext,
    block: Block
  ): Promise<BlockResult> {
    try {
      // Check runCondition
      if (config.runCondition) {
        const shouldRun = this.evaluateCondition(config.runCondition, context.data);
        if (!shouldRun) {
          logger.info({ phase: context.phase }, "Skipping list_tools block due to condition");
          return { success: true };
        }
      }

      // Resolve input list from context data
      const inputKey = context.aliasMap?.[config.sourceListVar] || config.sourceListVar;
      const inputData = context.data[inputKey];

      if (!inputData) {
        logger.warn({ sourceListVar: config.sourceListVar, inputKey }, "Input list not found, treating as empty array");
        // Treat as empty list rather than error
        const emptyList: ListVariable = {
          metadata: { source: 'list_tools' },
          rows: [],
          count: 0,
          columns: []
        };

        return {
          success: true,
          data: this.buildListToolsOutputData(config, emptyList, context)
        };
      }

      // Normalize input - handle both ListVariable and plain arrays
      let workingList: ListVariable;
      if (this.isListVariable(inputData)) {
        workingList = inputData as ListVariable;
      } else if (Array.isArray(inputData)) {
        // Convert plain array to ListVariable
        workingList = this.arrayToListVariable(inputData);
      } else {
        return {
          success: false,
          errors: [`Input variable "${config.sourceListVar}" is not a valid list or array`]
        };
      }

      // Apply operations in sequence
      let resultList = workingList;

      // 1. Filter
      if (config.filters) {
        resultList = this.applyListFilters(resultList, config.filters, context);
      }

      // 2. Sort (multi-key)
      if (config.sort && config.sort.length > 0) {
        resultList = this.applyListSort(resultList, config.sort);
      }

      // 3. Offset & Limit
      if (config.offset !== undefined || config.limit !== undefined) {
        resultList = this.applyListRange(resultList, config.offset || 0, config.limit);
      }

      // 4. Select (column projection)
      if (config.select && config.select.length > 0) {
        resultList = this.applyListSelect(resultList, config.select);
      }

      // 5. Dedupe
      if (config.dedupe) {
        resultList = this.applyListDedupe(resultList, config.dedupe);
      }

      // Update metadata
      resultList.metadata = {
        ...resultList.metadata,
        source: 'list_tools'
      };

      // Build output data (includes list + derived outputs)
      const outputData = this.buildListToolsOutputData(config, resultList, context);

      // Persist to virtual step if runId is present
      if (context.runId && block.virtualStepId) {
        try {
          await stepValueRepository.upsert({
            runId: context.runId,
            stepId: block.virtualStepId,
            value: resultList,
          });
          logger.debug({
            blockId: block.id,
            virtualStepId: block.virtualStepId,
            rowCount: resultList.count
          }, "Persisted list_tools block output");
        } catch (error) {
          logger.error({ error, blockId: block.id }, "Failed to persist list_tools block output");
        }
      }

      return {
        success: true,
        data: outputData
      };

    } catch (error) {
      logger.error({ error, config }, "List tools block failed");
      return {
        success: false,
        errors: [`List tools operation failed: ${error instanceof Error ? error.message : 'unknown error'}`]
      };
    }
  }

  /**
   * Check if data is a ListVariable
   */
  private isListVariable(data: any): boolean {
    return data && typeof data === 'object' && 'rows' in data && 'columns' in data && 'metadata' in data;
  }

  /**
   * Convert plain array to ListVariable
   */
  private arrayToListVariable(array: any[]): ListVariable {
    // Extract all unique keys from array items
    const allKeys = new Set<string>();
    array.forEach(item => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach(key => allKeys.add(key));
      }
    });

    const columns = Array.from(allKeys).map(key => ({
      id: key,
      name: key,
      type: 'text'
    }));

    return {
      metadata: { source: 'list_tools' },
      rows: array.map((item, idx) => ({
        id: `row-${idx}`,
        ...item
      })),
      count: array.length,
      columns
    };
  }

  /**
   * Apply filters to list (supports AND/OR groups)
   */
  private applyListFilters(
    list: ListVariable,
    filterGroup: import('@shared/types/blocks').ListToolsFilterGroup,
    context: BlockContext
  ): ListVariable {
    const filteredRows = list.rows.filter(row =>
      this.evaluateFilterGroup(row, filterGroup, context)
    );

    return {
      ...list,
      rows: filteredRows,
      count: filteredRows.length
    };
  }

  /**
   * Evaluate filter group (recursive for nested groups)
   */
  private evaluateFilterGroup(
    row: any,
    group: import('@shared/types/blocks').ListToolsFilterGroup,
    context: BlockContext
  ): boolean {
    const results: boolean[] = [];

    // Evaluate rules
    if (group.rules) {
      for (const rule of group.rules) {
        results.push(this.evaluateFilterRule(row, rule, context));
      }
    }

    // Evaluate nested groups
    if (group.groups) {
      for (const nestedGroup of group.groups) {
        results.push(this.evaluateFilterGroup(row, nestedGroup, context));
      }
    }

    // Combine with combinator
    if (group.combinator === 'and') {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }

  /**
   * Evaluate single filter rule
   */
  private evaluateFilterRule(
    row: any,
    rule: import('@shared/types/blocks').ListToolsFilterRule,
    context: BlockContext
  ): boolean {
    // Get field value using dot notation
    const fieldValue = getValueByPath(row, rule.fieldPath);

    // Resolve filter value
    let compareValue = rule.value;
    if (rule.valueSource === 'var') {
      const varKey = context.aliasMap?.[rule.value] || rule.value;
      compareValue = context.data[varKey];
    }

    // Apply operator
    return this.evaluateListFilterCondition(fieldValue, rule.op, compareValue);
  }

  /**
   * Evaluate a single filter condition for list filtering
   */
  private evaluateListFilterCondition(
    actualValue: any,
    operator: ReadTableOperator,
    expectedValue: any
  ): boolean {
    switch (operator) {
      case "equals":
        return this.isEqual(actualValue, expectedValue);

      case "not_equals":
        return !this.isEqual(actualValue, expectedValue);

      case "contains":
        return this.contains(actualValue, expectedValue);

      case "not_contains":
        return !this.contains(actualValue, expectedValue);

      case "starts_with":
        if (typeof actualValue === "string" && typeof expectedValue === "string") {
          return actualValue.toLowerCase().startsWith(expectedValue.toLowerCase());
        }
        return false;

      case "ends_with":
        if (typeof actualValue === "string" && typeof expectedValue === "string") {
          return actualValue.toLowerCase().endsWith(expectedValue.toLowerCase());
        }
        return false;

      case "greater_than":
        return this.compareNumeric(actualValue, expectedValue) > 0;

      case "gte":
        return this.compareNumeric(actualValue, expectedValue) >= 0;

      case "less_than":
        return this.compareNumeric(actualValue, expectedValue) < 0;

      case "lte":
        return this.compareNumeric(actualValue, expectedValue) <= 0;

      case "is_empty":
        return this.isEmpty(actualValue);

      case "is_not_empty":
        return !this.isEmpty(actualValue);

      case "in":
      case "in_list":
        if (Array.isArray(expectedValue)) {
          return expectedValue.some(v => this.isEqual(actualValue, v));
        }
        return false;

      case "not_in_list":
        if (Array.isArray(expectedValue)) {
          return !expectedValue.some(v => this.isEqual(actualValue, v));
        }
        return true;

      case "exists":
        return actualValue !== undefined && actualValue !== null;

      default:
        logger.warn(`Unknown list filter operator: ${operator}`);
        return false;
    }
  }

  /**
   * Apply multi-key sorting
   */
  private applyListSort(
    list: ListVariable,
    sortKeys: import('@shared/types/blocks').ListToolsSortKey[]
  ): ListVariable {
    const sortedRows = [...list.rows].sort((a, b) => {
      for (const sortKey of sortKeys) {
        const aVal = getValueByPath(a, sortKey.fieldPath);
        const bVal = getValueByPath(b, sortKey.fieldPath);

        // Handle null/undefined (sort last)
        if (aVal == null && bVal == null) continue;
        if (aVal == null) return sortKey.direction === "asc" ? 1 : -1;
        if (bVal == null) return sortKey.direction === "asc" ? -1 : 1;

        let comparison = 0;

        // Type-specific comparison
        if (typeof aVal === "number" && typeof bVal === "number") {
          comparison = aVal - bVal;
        } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
          comparison = (aVal === bVal) ? 0 : (aVal ? 1 : -1);
        } else {
          // String comparison
          const aStr = String(aVal).toLowerCase();
          const bStr = String(bVal).toLowerCase();
          comparison = aStr.localeCompare(bStr);
        }

        if (comparison !== 0) {
          return sortKey.direction === "asc" ? comparison : -comparison;
        }
      }
      return 0;
    });

    return {
      ...list,
      rows: sortedRows
    };
  }

  /**
   * Apply offset and limit
   */
  private applyListRange(
    list: ListVariable,
    offset: number,
    limit?: number
  ): ListVariable {
    let rangedRows = list.rows.slice(offset);
    if (limit !== undefined) {
      rangedRows = rangedRows.slice(0, limit);
    }

    return {
      ...list,
      rows: rangedRows,
      count: rangedRows.length
    };
  }

  /**
   * Apply column selection (projection)
   */
  private applyListSelect(
    list: ListVariable,
    fieldPaths: string[]
  ): ListVariable {
    // Project each row to only selected fields
    const projectedRows = list.rows.map(row => {
      const projected: any = { id: row.id }; // Always keep ID
      for (const fieldPath of fieldPaths) {
        const value = getValueByPath(row, fieldPath);
        // Preserve nested structure
        this.setValueByPath(projected, fieldPath, value);
      }
      return projected;
    });

    // Filter columns to only selected ones
    const selectedColumns = list.columns.filter(col =>
      fieldPaths.includes(col.id) || fieldPaths.some(fp => fp.startsWith(col.id + '.'))
    );

    return {
      ...list,
      rows: projectedRows,
      columns: selectedColumns
    };
  }

  /**
   * Apply deduplication
   */
  private applyListDedupe(
    list: ListVariable,
    dedupe: import('@shared/types/blocks').ListToolsDedupe
  ): ListVariable {
    const seen = new Set<string>();
    const dedupedRows = list.rows.filter(row => {
      const value = getValueByPath(row, dedupe.fieldPath);
      const key = JSON.stringify(value);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return {
      ...list,
      rows: dedupedRows,
      count: dedupedRows.length
    };
  }

  /**
   * Build output data including derived outputs
   */
  private buildListToolsOutputData(
    config: ListToolsConfig,
    resultList: ListVariable,
    context: BlockContext
  ): Record<string, any> {
    const outputData: Record<string, any> = {
      [config.outputListVar]: resultList
    };

    // Add derived outputs
    if (config.outputs?.countVar) {
      outputData[config.outputs.countVar] = resultList.count;
    }

    if (config.outputs?.firstVar) {
      outputData[config.outputs.firstVar] = resultList.rows[0] || null;
    }

    return outputData;
  }

  /**
   * Set value by dot-notation path (helper for nested object building)
   */
  private setValueByPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  }
}

// Singleton instance
export const blockRunner = new BlockRunner();
