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
import { Block, workflows, projects } from "@shared/schema";
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
   * Run all blocks for a given phase
   * Execution order: lifecycle hooks → transform blocks → generic blocks
   * Returns combined result from all blocks
   *
   * TODO: Add transaction boundary support
   * Currently, this method performs multiple database operations without a transaction wrapper.
   * If any operation fails midway, previous changes are already committed, leading to
   * inconsistent state. Consider refactoring to accept an optional transaction parameter
   * and propagate it through all repository calls.
   */
  async runPhase(context: BlockContext): Promise<BlockResult> {
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
    if (context.runId) {
      // accessMode logic? BlockContext doesn't have accessMode usually, but we can assume 'unknown' or payload it.
      // Actually we just want block events here.
      await analyticsService.recordEvent({
        runId: context.runId,
        workflowId: context.workflowId,
        versionId: context.versionId || 'draft',
        type: 'block.start',
        blockId: block.id,
        // pageId? context.sectionId is roughly pageId
        pageId: context.sectionId,
        timestamp: new Date().toISOString(),
        isPreview: context.mode === 'preview',
        payload: {
          blockType: block.type
        }
      });
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

      if (context.runId) {
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
      }
      throw error;
    }

    // Stage 15: Analytics - Block End (Complete or Validated Error)
    if (context.runId) {
      const eventType = result.success ? 'block.complete' : 'validation.error'; // Generic blocks usually return validation errors as non-success
      // However, 'create_record' errors are runtime errors.
      // Let's distinguish?
      // For now, if !success, it's an error.

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
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      // Import at top level to avoid circular dependency issues
      const { workflowRepository } = await import('../repositories');
      const workflow = await workflowRepository.findById(workflowId);
      if (!workflow || !workflow.projectId) {
        logger.warn({ workflowId }, "Workflow not found or has no projectId");
        return null;
      }

      // Fetch project to get tenantId
      const { projectRepository } = await import('../repositories');
      const project = await projectRepository.findById(workflow.projectId);

      if (!project) {
        logger.warn({ projectId: workflow.projectId }, "Project not found");
        return null;
      }

      return project.tenantId;
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

      // Query records with filters
      // Note: The recordService.findByFilters uses pagination, we'll use page=1 and limit from config
      const result = await (recordService as any).findByFilters(
        tenantId,
        config.collectionId,
        config.filters,
        { page: 1, limit: config.limit || 1 }
      );

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
      const [result] = await db
        .select({ tenantId: projects.tenantId })
        .from(workflows)
        .innerJoin(projects, eq(workflows.projectId, projects.id))
        .where(eq(workflows.id, workflowId))
        .limit(1);

      return result?.tenantId || null;
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
        context.data,
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
      const columns = await datavaultColumnsRepository.findByTableId(config.tableId);
      const columnMap = new Map(columns.map(c => [c.id, c]));

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
            limit: config.limit
          },
          filteredBy: config.filters?.map(f => f.columnId),
          sortedBy: config.sort
        },
        rows: rows.map(row => {
          // Convert internal row structure to column name-accessible object
          const rowData: Record<string, any> = { id: row.id };
          for (const col of columns) {
            rowData[col.id] = row.data?.[col.id] ?? null;
          }
          return rowData;
        }),
        count: rows.length,
        columns: columns.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type
        }))
      };

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
            rowCount: listVariable.count
          }, "Persisted read_table block output");
        } catch (error) {
          logger.error({ error, blockId: block.id }, "Failed to persist read_table block output");
        }
      }

      return {
        success: true,
        data: {
          [config.outputKey]: listVariable
        }
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
            const placeholders = filter.value.map(v => `'${v}'`).join(',');
            whereConditions.push(sql`${sql.raw(columnPath)} IN (${sql.raw(placeholders)})`);
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
        const columnPath = `data->>'${params.sort.columnId}'`;
        if (params.sort.direction === 'asc') {
          query = query.orderBy(sql`${sql.raw(columnPath)} ASC`);
        } else {
          query = query.orderBy(sql`${sql.raw(columnPath)} DESC`);
        }
      }
    }

    const rows = await query;
    return rows;
  }

  /**
   * Execute list tools block
   * Transforms a list variable with various operations (filter, sort, limit, select)
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
      const inputKey = context.aliasMap?.[config.inputKey] || config.inputKey;
      const inputList = context.data[inputKey] as ListVariable | undefined;

      if (!inputList) {
        return {
          success: false,
          errors: [`Input list not found: ${config.inputKey}`]
        };
      }

      // Validate input is a list variable
      if (!inputList.rows || !Array.isArray(inputList.rows) || !inputList.columns) {
        return {
          success: false,
          errors: [`Input variable "${config.inputKey}" is not a valid list`]
        };
      }

      let outputValue: any;

      // Execute operation
      switch (config.operation) {
        case "filter":
          if (!config.filter) {
            return { success: false, errors: ["Filter configuration is required for filter operation"] };
          }
          outputValue = await this.executeListFilter(inputList, config.filter, context);
          break;

        case "sort":
          if (!config.sort) {
            return { success: false, errors: ["Sort configuration is required for sort operation"] };
          }
          outputValue = this.executeListSort(inputList, config.sort);
          break;

        case "limit":
          if (!config.limit) {
            return { success: false, errors: ["Limit value is required for limit operation"] };
          }
          outputValue = this.executeListLimit(inputList, config.limit);
          break;

        case "select":
          if (!config.select) {
            return { success: false, errors: ["Select configuration is required for select operation"] };
          }
          outputValue = this.executeListSelect(inputList, config.select);
          break;

        default:
          return {
            success: false,
            errors: [`Unknown list tools operation: ${config.operation}`]
          };
      }

      // Persist to virtual step if runId is present
      if (context.runId && block.virtualStepId) {
        try {
          await stepValueRepository.upsert({
            runId: context.runId,
            stepId: block.virtualStepId,
            value: outputValue,
          });
          logger.debug({
            blockId: block.id,
            virtualStepId: block.virtualStepId,
            operation: config.operation
          }, "Persisted list_tools block output");
        } catch (error) {
          logger.error({ error, blockId: block.id }, "Failed to persist list_tools block output");
        }
      }

      return {
        success: true,
        data: {
          [config.outputKey]: outputValue
        }
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
   * Execute list filter operation
   * Filters rows based on a column condition
   */
  private async executeListFilter(
    inputList: ListVariable,
    filter: { columnId: string; operator: ReadTableOperator; value?: any },
    context: BlockContext
  ): Promise<ListVariable> {
    // Resolve filter value from context if it's a variable reference
    let resolvedValue = filter.value;
    if (typeof filter.value === 'string' && filter.value.startsWith('{{') && filter.value.endsWith('}}')) {
      const variableName = filter.value.slice(2, -2).trim();
      const dataKey = context.aliasMap?.[variableName] || variableName;
      resolvedValue = context.data[dataKey];
    }

    // Filter rows
    const filteredRows = inputList.rows.filter(row => {
      const columnValue = row[filter.columnId];
      return this.evaluateListFilterCondition(columnValue, filter.operator, resolvedValue);
    });

    // Build new list variable
    return {
      metadata: {
        ...inputList.metadata,
        source: 'list_tools' as const,
        filteredBy: [...(inputList.metadata.filteredBy || []), filter.columnId]
      },
      rows: filteredRows,
      count: filteredRows.length,
      columns: inputList.columns
    };
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

      case "less_than":
        return this.compareNumeric(actualValue, expectedValue) < 0;

      case "is_empty":
        return this.isEmpty(actualValue);

      case "is_not_empty":
        return !this.isEmpty(actualValue);

      case "in":
        if (Array.isArray(expectedValue)) {
          return expectedValue.some(v => this.isEqual(actualValue, v));
        }
        return false;

      default:
        logger.warn(`Unknown list filter operator: ${operator}`);
        return false;
    }
  }

  /**
   * Execute list sort operation
   * Sorts rows by a column
   */
  private executeListSort(
    inputList: ListVariable,
    sort: { columnId: string; direction: "asc" | "desc" }
  ): ListVariable {
    const sortedRows = [...inputList.rows].sort((a, b) => {
      const aVal = a[sort.columnId];
      const bVal = b[sort.columnId];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sort.direction === "asc" ? 1 : -1;
      if (bVal == null) return sort.direction === "asc" ? -1 : 1;

      // Type-specific comparison
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      const comparison = aStr.localeCompare(bStr);
      return sort.direction === "asc" ? comparison : -comparison;
    });

    return {
      metadata: {
        ...inputList.metadata,
        source: 'list_tools' as const,
        sortedBy: sort
      },
      rows: sortedRows,
      count: sortedRows.length,
      columns: inputList.columns
    };
  }

  /**
   * Execute list limit operation
   * Limits the number of rows
   */
  private executeListLimit(
    inputList: ListVariable,
    limit: number
  ): ListVariable {
    const limitedRows = inputList.rows.slice(0, limit);

    return {
      metadata: {
        ...inputList.metadata,
        source: 'list_tools' as const
      },
      rows: limitedRows,
      count: limitedRows.length,
      columns: inputList.columns
    };
  }

  /**
   * Execute list select operation
   * Selects count, specific column values, or a specific row
   */
  private executeListSelect(
    inputList: ListVariable,
    select: { mode: "count" | "column" | "row"; columnId?: string; rowIndex?: number }
  ): any {
    switch (select.mode) {
      case "count":
        return inputList.count;

      case "column":
        if (!select.columnId) {
          throw new Error("columnId is required for column select mode");
        }
        return inputList.rows.map(row => row[select.columnId!]);

      case "row":
        if (select.rowIndex === undefined || select.rowIndex === null) {
          throw new Error("rowIndex is required for row select mode");
        }
        if (select.rowIndex < 0 || select.rowIndex >= inputList.rows.length) {
          return null; // Out of bounds
        }
        return inputList.rows[select.rowIndex];

      default:
        throw new Error(`Unknown select mode: ${select.mode}`);
    }
  }
}

// Singleton instance
export const blockRunner = new BlockRunner();
