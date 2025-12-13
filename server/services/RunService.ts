import {
  workflowRunRepository,
  stepValueRepository,
  workflowRepository,
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  projectRepository,
  runGeneratedDocumentsRepository,
} from "../repositories";
import type { WorkflowRun, InsertWorkflowRun, InsertStepValue } from "@shared/schema";
import { workflowService } from "./WorkflowService";
import { logicService, type NavigationResult } from "./LogicService";
import { blockRunner } from "./BlockRunner";
import { evaluateRules, validateRequiredSteps, getEffectiveRequiredSteps } from "@shared/workflowLogic";
import { runJsIsolatedVm } from "../utils/sandboxExecutor";
import { isJsQuestionConfig, type JsQuestionConfig } from "@shared/types/steps";
import { randomUUID } from "crypto";
import { captureRunLifecycle } from "./metrics";
import { logger } from "../logger";
import { documentGenerationService } from "./DocumentGenerationService";

/**
 * Service layer for workflow run-related business logic
 */
export class RunService {
  private runRepo: typeof workflowRunRepository;
  private valueRepo: typeof stepValueRepository;
  private workflowRepo: typeof workflowRepository;
  private sectionRepo: typeof sectionRepository;
  private stepRepo: typeof stepRepository;
  private logicRuleRepo: typeof logicRuleRepository;
  private projectRepo: typeof projectRepository;
  private docsRepo: typeof runGeneratedDocumentsRepository;
  private workflowSvc: typeof workflowService;
  private logicSvc: typeof logicService;

  constructor(
    runRepo?: typeof workflowRunRepository,
    valueRepo?: typeof stepValueRepository,
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    projectRepo?: typeof projectRepository,
    docsRepo?: typeof runGeneratedDocumentsRepository,
    workflowSvc?: typeof workflowService,
    logicSvc?: typeof logicService
  ) {
    this.runRepo = runRepo || workflowRunRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.projectRepo = projectRepo || projectRepository;
    this.docsRepo = docsRepo || runGeneratedDocumentsRepository;
    this.workflowSvc = workflowSvc || workflowService;
    this.logicSvc = logicSvc || logicService;
  }

  /**
   * Get tenant and project IDs for a workflow (for metrics)
   */
  private async getWorkflowContext(workflowId: string): Promise<{ tenantId: string; projectId: string } | null> {
    try {
      const workflow = await this.workflowRepo.findById(workflowId);
      if (!workflow || !workflow.projectId) {
        return null;
      }

      const project = await this.projectRepo.findById(workflow.projectId);
      if (!project || !project.tenantId) {
        return null;
      }

      return {
        tenantId: project.tenantId,
        projectId: project.id,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get workflow context for metrics');
      return null;
    }
  }

  /**
   * Populate step values with initial values and defaults
   * Priority: initialValues > step defaultValue
   * @param runId - Run ID
   * @param workflowId - Workflow ID
   * @param initialValues - Optional key/value pairs (key can be alias or stepId)
   */
  private async populateInitialValues(
    runId: string,
    workflowId: string,
    initialValues?: Record<string, any>
  ): Promise<void> {
    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    const sectionIds = sections.map(s => s.id);

    // Get all steps for these sections
    const allSteps = await this.stepRepo.findBySectionIds(sectionIds);

    // Create a map of alias -> stepId for quick lookup
    const aliasToStepId = new Map<string, string>();
    for (const step of allSteps) {
      if (step.alias) {
        aliasToStepId.set(step.alias, step.id);
      }
    }

    // Populate step values
    for (const step of allSteps) {
      // Skip virtual steps (they are set by transform blocks)
      if (step.isVirtual) {
        continue;
      }

      let valueToSet: any = undefined;

      // First priority: initialValues (by alias or stepId)
      if (initialValues) {
        // Check if initialValues has this step's alias or ID
        if (step.alias && initialValues[step.alias] !== undefined) {
          valueToSet = initialValues[step.alias];
        } else if (initialValues[step.id] !== undefined) {
          valueToSet = initialValues[step.id];
        }
      }

      // Second priority: step's defaultValue
      if (valueToSet === undefined && step.defaultValue !== undefined && step.defaultValue !== null) {
        valueToSet = step.defaultValue;
      }

      // Only upsert if we have a value
      if (valueToSet !== undefined) {
        await this.valueRepo.upsert({
          runId,
          stepId: step.id,
          value: valueToSet,
        });
      }
    }
  }

  /**
   * Create a new workflow run
   * Executes onRunStart blocks after creation
   * @param idOrSlug - Workflow UUID or slug
   * @param initialValues - Optional key/value pairs to pre-populate step values (key can be alias or stepId)
   */
  async createRun(
    idOrSlug: string,
    userId: string | undefined,
    data: Omit<InsertWorkflowRun, 'workflowId' | 'runToken'>,
    initialValues?: Record<string, any>,
    options?: {
      snapshotId?: string;
      randomize?: boolean;
    }
  ): Promise<WorkflowRun> {
    let workflow;

    if (userId) {
      // Authenticated: verify ownership/access
      workflow = await this.workflowSvc.verifyAccess(idOrSlug, userId);
    } else {
      // Anonymous: verify public access
      // Try to find by ID first (if UUID provided)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

      if (isUuid) {
        workflow = await this.workflowRepo.findById(idOrSlug);
      } else {
        workflow = await this.workflowRepo.findByPublicLink(idOrSlug);
      }

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Verify workflow is active and public
      if (workflow.status !== 'active') {
        throw new Error('Workflow is not active');
      }
      if (!workflow.isPublic) {
        throw new Error('Workflow is not public');
      }
    }

    const workflowId = workflow.id; // Use the actual UUID

    // Resolve the version to use for this run
    let targetVersionId = workflow.pinnedVersionId || workflow.currentVersionId;

    // If no version specified on workflow, try to find latest published
    if (!targetVersionId) {
      // Lazy load to avoid circular dependency if any? 
      // Actually we can just query database directly or use VersionService if imported.
      // For now, let's assume we can query workflowVersions table via db if we imported it?
      // But RunService uses repositories. 
      // Let's assume workflow.currentVersionId IS the pointer to latest published/active.
      // If it's missing, it implies no version is published?
      // Just fallback to null for now if strict mode isn't enforced yet.
      logger.warn({ workflowId }, "No current or pinned version found for workflow, run might be unstable");
    }

    // Generate a unique token for this run
    const runToken = randomUUID();
    const startTime = Date.now();

    // Load snapshot values if snapshotId provided
    let snapshotValueMap: Record<string, { value: any; stepId: string; stepUpdatedAt: string }> | undefined;
    if (options?.snapshotId) {
      const { snapshotService } = await import('./snapshotService');
      const snapshot = await snapshotService.getSnapshotById(options.snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${options.snapshotId}`);
      }
      const snapshotValues = await snapshotService.getSnapshotValues(options.snapshotId);
      initialValues = { ...initialValues, ...snapshotValues };
      snapshotValueMap = snapshot.values as any;
    }

    // Generate random values if randomize is true
    if (options?.randomize) {
      const { createAIServiceFromEnv } = await import('./AIService');

      // Get all steps for the workflow
      const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
      const visibleSteps = allSteps.filter(s => !s.isVirtual);

      // Build step data for AI
      const stepData = visibleSteps.map(step => ({
        key: step.alias || step.id,
        type: step.type,
        label: step.title,
        options: (step as any).config && typeof (step as any).config === 'object' && 'options' in (step as any).config
          ? ((step as any).config as any).options
          : undefined,
        description: step.description || undefined,
      }));

      // Call AI service to generate random values
      const aiService = createAIServiceFromEnv();
      const randomValues = await aiService.suggestValues(stepData, 'full');

      initialValues = { ...initialValues, ...randomValues };
    }

    // Create the run
    const run = await this.runRepo.create({
      ...data,
      workflowId, // Always use UUID here
      workflowVersionId: targetVersionId || undefined, // Link run to specific version
      runToken,
      createdBy: userId || null,
      completed: false,
    });

    // Populate initial values (from URL params, snapshot, or random data)
    await this.populateInitialValues(run.id, workflowId, initialValues);

    // Determine start section with auto-advance logic
    if (options?.snapshotId || options?.randomize) {
      const startSectionId = await this.determineStartSection(run.id, workflowId, snapshotValueMap);
      await this.runRepo.update(run.id, {
        currentSectionId: startSectionId,
      });
    }

    // Capture run_started metric (Stage 11)
    const context = await this.getWorkflowContext(workflowId);
    if (context) {
      await captureRunLifecycle.started({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId,
        runId: run.id,
        createdBy: userId || 'anon',
      });
    }

    // Execute onRunStart blocks (transform + generic)
    try {
      // Get existing step values for this run
      const values = await this.valueRepo.findByRunId(run.id);
      const dataMap = values.reduce((acc, v) => {
        acc[v.stepId] = v.value;
        return acc;
      }, {} as Record<string, any>);

      const blockResult = await blockRunner.runPhase({
        workflowId,
        runId: run.id,
        phase: "onRunStart",
        data: dataMap,
      });

      // If blocks produced errors, log them but don't fail run creation
      if (!blockResult.success && blockResult.errors) {
        logger.warn({ runId: run.id, errors: blockResult.errors }, `onRunStart block errors for run ${run.id}`);
      }
    } catch (error) {
      logger.error({ runId: run.id, error }, `Failed to execute onRunStart blocks for run ${run.id}`);
      // Don't fail run creation if blocks fail
    }

    return run;
  }

  /**
   * Get run by ID
   * Allows access if:
   * - User created this specific run (createdBy contains their userId)
   * - User owns the workflow (for viewing all runs)
   * - Workflow is public and user is viewing their own anonymous run
   */
  async getRun(runId: string, userId: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Check if user created this specific run
    const createdByUser = run.createdBy === `creator:${userId}` || run.createdBy === userId;

    if (createdByUser) {
      // User created this run, allow access
      return run;
    }

    // Otherwise, verify ownership of the workflow
    // This allows workflow owners to view all runs
    await this.workflowSvc.verifyAccess(run.workflowId, userId);

    return run;
  }

  /**
   * Get run with all values
   */
  async getRunWithValues(runId: string, userId: string) {
    const run = await this.getRun(runId, userId);
    const values = await this.valueRepo.findByRunId(runId);

    return {
      ...run,
      values,
    };
  }

  /**
   * Get run with all values without ownership check
   * Used for preview/run token authentication
   */
  async getRunWithValuesNoAuth(runId: string) {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const values = await this.valueRepo.findByRunId(runId);

    return {
      ...run,
      values,
    };
  }

  /**
   * Upsert a step value
   */
  async upsertStepValue(
    runId: string,
    userId: string,
    data: InsertStepValue
  ): Promise<void> {
    const run = await this.getRun(runId, userId);

    // Verify step belongs to the workflow
    const step = await this.stepRepo.findById(data.stepId);
    if (!step) {
      throw new Error("Step not found");
    }

    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== run.workflowId) {
      throw new Error("Step does not belong to this workflow");
    }

    await this.valueRepo.upsert(data);
  }

  /**
   * Upsert a step value without ownership check
   * Used for preview/run token authentication
   */
  async upsertStepValueNoAuth(
    runId: string,
    data: InsertStepValue
  ): Promise<void> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Verify step belongs to the workflow
    const step = await this.stepRepo.findById(data.stepId);
    if (!step) {
      throw new Error("Step not found");
    }

    const section = await this.sectionRepo.findById(step.sectionId);
    if (!section || section.workflowId !== run.workflowId) {
      throw new Error("Step does not belong to this workflow");
    }

    await this.valueRepo.upsert(data);
  }

  /**
   * Bulk upsert step values
   */
  async bulkUpsertValues(
    runId: string,
    userId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<void> {
    const run = await this.getRun(runId, userId);

    for (const { stepId, value } of values) {
      await this.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      });
    }
  }

  /**
   * Bulk upsert step values without userId check (for run token auth)
   */
  async bulkUpsertValuesNoAuth(
    runId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<void> {
    // Verify run exists
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Get workflow to validate steps belong to it
    const workflow = await this.workflowRepo.findById(run.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    // Bulk upsert all values
    for (const { stepId, value } of values) {
      await this.upsertStepValueNoAuth(runId, {
        runId,
        stepId,
        value,
      });
    }
  }

  /**
   * Execute JS questions for a section
   * Finds all js_question steps, executes their code, and persists outputs
   *
   * @param runId - Run ID
   * @param sectionId - Section ID to execute JS questions for
   * @param dataMap - Current data map (stepId -> value)
   * @returns Object with success flag and any errors
   */
  private async executeJsQuestions(
    runId: string,
    sectionId: string,
    dataMap: Record<string, any>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const errors: string[] = [];

    // Find all js_question steps in this section
    const allSteps = await this.stepRepo.findBySectionId(sectionId);
    const jsQuestions = allSteps.filter(step => step.type === 'js_question');

    for (const step of jsQuestions) {
      // Skip if no options or invalid config
      if (!step.options || !isJsQuestionConfig(step.options)) {
        continue;
      }

      const config = step.options as JsQuestionConfig;

      // Build input object with only whitelisted keys
      const input: Record<string, any> = {};
      for (const key of config.inputKeys) {
        // Validate key is a safe identifier (alphanumeric, underscore, no special chars)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          errors.push(`JS Question "${step.title}": Invalid input key "${key}" (must be a valid identifier)`);
          continue;
        }

        // Try to find step by alias or ID
        const inputStep = allSteps.find(s => s.alias === key || s.id === key);
        if (inputStep && dataMap[inputStep.id] !== undefined) {
          input[key] = dataMap[inputStep.id];
        }
      }

      try {
        // Execute the code
        const result = await runJsIsolatedVm(
          config.code,
          input,
          config.timeoutMs || 1000
        );

        if (!result.ok) {
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
              parts.push(details.stack.slice(0, 1000)); // Include up to 1000 chars of stack
            }

            detailedError = parts.join('\n');
          }

          errors.push(`JS Question "${step.title}" failed:\n${detailedError}`);
          continue;
        }

        // Store the output using the step's own ID as the key in dataMap
        // This allows the output to be referenced by the step's alias in blocks
        await this.valueRepo.upsert({
          runId,
          stepId: step.id,
          value: result.output ?? null,
        });

        // Update dataMap for subsequent operations
        dataMap[step.id] = result.output;

      } catch (error: any) {
        errors.push(`JS Question "${step.title}" execution error: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Submit section values with validation
   * Executes onSectionSubmit blocks (transform + validate)
   */
  async submitSection(
    runId: string,
    sectionId: string,
    userId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const run = await this.getRun(runId, userId);

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Save all values first
    for (const { stepId, value } of values) {
      await this.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      });
    }

    // Get all step values for this run
    const allValues = await this.valueRepo.findByRunId(runId);
    const dataMap = allValues.reduce((acc, v) => {
      acc[v.stepId] = v.value;
      return acc;
    }, {} as Record<string, any>);

    // Execute JS questions for this section
    const jsResult = await this.executeJsQuestions(runId, sectionId, dataMap);
    if (!jsResult.success) {
      return {
        success: false,
        errors: jsResult.errors,
      };
    }

    // Execute onSectionSubmit blocks (transform + validate)
    const blockResult = await blockRunner.runPhase({
      workflowId: run.workflowId,
      runId: run.id,
      phase: "onSectionSubmit",
      sectionId,
      data: dataMap,
    });

    return {
      success: blockResult.success,
      errors: blockResult.errors,
    };
  }

  /**
   * Submit section values with validation without ownership check
   * Used for preview/run token authentication
   */
  async submitSectionNoAuth(
    runId: string,
    sectionId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Save all values first
    for (const { stepId, value } of values) {
      await this.upsertStepValueNoAuth(runId, {
        runId,
        stepId,
        value,
      });
    }

    // Get all step values for this run
    const allValues = await this.valueRepo.findByRunId(runId);
    const dataMap = allValues.reduce((acc, v) => {
      acc[v.stepId] = v.value;
      return acc;
    }, {} as Record<string, any>);

    // Execute JS questions for this section
    const jsResult = await this.executeJsQuestions(runId, sectionId, dataMap);
    if (!jsResult.success) {
      return {
        success: false,
        errors: jsResult.errors,
      };
    }

    // Execute onSectionSubmit blocks (transform + validate)
    const blockResult = await blockRunner.runPhase({
      workflowId: run.workflowId,
      runId: run.id,
      phase: "onSectionSubmit",
      sectionId,
      data: dataMap,
    });

    return {
      success: blockResult.success,
      errors: blockResult.errors,
    };
  }

  /**
   * Calculate next section and update run state
   * Executes onNext blocks (transform + branch)
   *
   * @param runId - Run ID
   * @param userId - User ID (for authorization)
   * @returns Navigation result with next section info
   */
  async next(runId: string, userId: string): Promise<NavigationResult> {
    const run = await this.getRun(runId, userId);

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Get all step values for this run
    const allValues = await this.valueRepo.findByRunId(runId);
    const dataMap = allValues.reduce((acc, v) => {
      acc[v.stepId] = v.value;
      return acc;
    }, {} as Record<string, any>);

    // Execute JS questions for the current section (if any)
    if (run.currentSectionId) {
      await this.executeJsQuestions(runId, run.currentSectionId, dataMap);
      // Note: We ignore errors here as next() shouldn't fail on JS question errors
      // The errors would have been caught during submitSection
    }

    // Execute onNext blocks (transform + branch)
    const blockResult = await blockRunner.runPhase({
      workflowId: run.workflowId,
      runId: run.id,
      phase: "onNext",
      sectionId: run.currentSectionId ?? undefined,
      data: dataMap,
    });

    // If transform blocks produced a nextSectionId, use it
    // Otherwise, evaluate navigation using LogicService
    let navigation: NavigationResult;

    if (blockResult.nextSectionId) {
      // Branch block decided the next section
      navigation = {
        nextSectionId: blockResult.nextSectionId,
        currentProgress: 0, // Will be calculated if needed
        visibleSections: [],
        visibleSteps: [],
        requiredSteps: [],
      };
    } else {
      // Use logic service to determine navigation
      navigation = await this.logicSvc.evaluateNavigation(
        run.workflowId,
        runId,
        run.currentSectionId ?? null
      );
    }

    // Update run with next section and progress
    if (navigation.nextSectionId !== run.currentSectionId) {
      await this.runRepo.update(runId, {
        currentSectionId: navigation.nextSectionId,
        progress: navigation.currentProgress,
      });
    }

    return navigation;
  }

  /**
   * Calculate next section without ownership check
   * Used for preview/run token authentication
   */
  async nextNoAuth(runId: string): Promise<NavigationResult> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Get all step values for this run
    const allValues = await this.valueRepo.findByRunId(runId);
    const dataMap = allValues.reduce((acc, v) => {
      acc[v.stepId] = v.value;
      return acc;
    }, {} as Record<string, any>);

    // Execute JS questions for the current section (if any)
    if (run.currentSectionId) {
      await this.executeJsQuestions(runId, run.currentSectionId, dataMap);
    }

    // Execute onNext blocks (transform + branch)
    const blockResult = await blockRunner.runPhase({
      workflowId: run.workflowId,
      runId: run.id,
      phase: "onNext",
      sectionId: run.currentSectionId ?? undefined,
      data: dataMap,
    });

    // If transform blocks produced a nextSectionId, use it
    // Otherwise, evaluate navigation using LogicService
    let navigation: NavigationResult;

    if (blockResult.nextSectionId) {
      // Branch block decided the next section
      navigation = {
        nextSectionId: blockResult.nextSectionId,
        currentProgress: 0,
        visibleSections: [],
        visibleSteps: [],
        requiredSteps: [],
      };
    } else {
      // Use logic service to determine navigation
      navigation = await this.logicSvc.evaluateNavigation(
        run.workflowId,
        runId,
        run.currentSectionId ?? null
      );
    }

    // Update run with next section and progress
    if (navigation.nextSectionId !== run.currentSectionId) {
      await this.runRepo.update(runId, {
        currentSectionId: navigation.nextSectionId,
        progress: navigation.currentProgress,
      });
    }

    return navigation;
  }

  /**
   * Complete a workflow run (with validation)
   * Executes onRunComplete blocks before completion
   */
  async completeRun(runId: string, userId: string): Promise<WorkflowRun> {
    const run = await this.getRun(runId, userId);
    const startTime = Date.now();

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Get workflow context for metrics
    const context = await this.getWorkflowContext(run.workflowId);

    try {
      // Get workflow
      const workflow = await this.workflowRepo.findById(run.workflowId);
      if (!workflow) {
        throw new Error("Workflow not found");
      }

      // Get all step values for this run
      const allValues = await this.valueRepo.findByRunId(runId);
      const dataMap = allValues.reduce((acc, v) => {
        acc[v.stepId] = v.value;
        return acc;
      }, {} as Record<string, any>);

      // Execute onRunComplete blocks (transform + validate)
      const blockResult = await blockRunner.runPhase({
        workflowId: run.workflowId,
        runId: run.id,
        phase: "onRunComplete",
        data: dataMap,
      });

      // If blocks produced validation errors, reject completion
      if (!blockResult.success && blockResult.errors) {
        const errorMsg = `Validation failed: ${blockResult.errors.join(', ')}`;

        // Capture run_failed metric (Stage 11)
        if (context) {
          await captureRunLifecycle.failed({
            tenantId: context.tenantId,
            projectId: context.projectId,
            workflowId: run.workflowId,
            runId: run.id,
            durationMs: Date.now() - startTime,
            errorType: 'validation_error',
          });
        }

        throw new Error(errorMsg);
      }

      // Validate using LogicService
      const validation = await this.logicSvc.validateCompletion(run.workflowId, runId);

      if (!validation.valid) {
        const stepTitles = validation.missingStepTitles?.join(', ') || validation.missingSteps.join(', ');
        const errorMsg = `Missing required steps: ${stepTitles}`;

        // Capture run_failed metric (Stage 11)
        if (context) {
          await captureRunLifecycle.failed({
            tenantId: context.tenantId,
            projectId: context.projectId,
            workflowId: run.workflowId,
            runId: run.id,
            durationMs: Date.now() - startTime,
            errorType: 'missing_required_steps',
          });
        }

        throw new Error(errorMsg);
      }

      // Mark run as complete with 100% progress
      const completedRun = await this.runRepo.update(runId, {
        completed: true,
        completedAt: new Date(),
        progress: 100,
      });

      // Generate documents for Final Documents sections
      try {
        await documentGenerationService.generateDocumentsForRun(runId);
      } catch (error) {
        logger.error({ error, runId }, 'Document generation failed, but run marked complete');
        // Don't fail the run completion if document generation fails
      }

      // Capture run_succeeded metric (Stage 11)
      if (context) {
        await captureRunLifecycle.succeeded({
          tenantId: context.tenantId,
          projectId: context.projectId,
          workflowId: run.workflowId,
          runId: run.id,
          durationMs: Date.now() - startTime,
          stepCount: allValues.length,
        });
      }

      return completedRun;
    } catch (error) {
      // If we haven't already captured a failure, capture it now
      if (error instanceof Error && !error.message.includes('Validation failed') && !error.message.includes('Missing required steps')) {
        if (context) {
          await captureRunLifecycle.failed({
            tenantId: context.tenantId,
            projectId: context.projectId,
            workflowId: run.workflowId,
            runId: run.id,
            durationMs: Date.now() - startTime,
            errorType: 'unknown_error',
          });
        }
      }
      throw error;
    }
  }

  /**
   * Complete a workflow run without ownership check
   * Used for preview/run token authentication
   */
  async completeRunNoAuth(runId: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Get workflow
    const workflow = await this.workflowRepo.findById(run.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    // Get all step values for this run
    const allValues = await this.valueRepo.findByRunId(runId);
    const dataMap = allValues.reduce((acc, v) => {
      acc[v.stepId] = v.value;
      return acc;
    }, {} as Record<string, any>);

    // Execute onRunComplete blocks (transform + validate)
    const blockResult = await blockRunner.runPhase({
      workflowId: run.workflowId,
      runId: run.id,
      phase: "onRunComplete",
      data: dataMap,
    });

    // If blocks produced validation errors, reject completion
    if (!blockResult.success && blockResult.errors) {
      throw new Error(`Validation failed: ${blockResult.errors.join(', ')}`);
    }

    // Validate using LogicService
    const validation = await this.logicSvc.validateCompletion(run.workflowId, runId);

    if (!validation.valid) {
      const stepTitles = validation.missingStepTitles?.join(', ') || validation.missingSteps.join(', ');
      throw new Error(`Missing required steps: ${stepTitles}`);
    }

    // Mark run as complete with 100% progress
    const completedRun = await this.runRepo.update(runId, {
      completed: true,
      completedAt: new Date(),
      progress: 100,
    });

    // Generate documents for Final Documents sections
    try {
      await documentGenerationService.generateDocumentsForRun(runId);
    } catch (error) {
      logger.error({ error, runId }, 'Document generation failed, but run marked complete');
      // Don't fail the run completion if document generation fails
    }

    return completedRun;
  }

  /**
   * Create an anonymous workflow run from a public link slug
   * Does not require authentication or ownership verification
   * @param publicLinkSlug - The workflow's public link slug
   * @param initialValues - Optional key/value pairs to pre-populate step values (key can be alias or stepId)
   */
  async createAnonymousRun(publicLinkSlug: string, initialValues?: Record<string, any>): Promise<WorkflowRun> {
    // Look up workflow by public link slug
    const workflow = await this.workflowRepo.findByPublicLink(publicLinkSlug);
    if (!workflow) {
      throw new Error('Workflow not found or not public');
    }

    // Verify workflow is active and public
    if (workflow.status !== 'active') {
      throw new Error('Workflow is not active');
    }
    if (!workflow.isPublic) {
      throw new Error('Workflow is not public');
    }

    // Generate a unique token for this run
    const runToken = randomUUID();
    const startTime = Date.now();

    // Create the run with anonymous creator
    const run = await this.runRepo.create({
      workflowId: workflow.id,
      workflowVersionId: undefined,
      runToken,
      createdBy: 'anon', // Anonymous user
      completed: false,
    });

    // Populate initial values (from URL params or step defaults)
    await this.populateInitialValues(run.id, workflow.id, initialValues);

    // Capture run_started metric (Stage 11)
    const context = await this.getWorkflowContext(workflow.id);
    if (context) {
      await captureRunLifecycle.started({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId: workflow.id,
        runId: run.id,
        createdBy: 'anon',
      });
    }

    // Execute onRunStart blocks (transform + generic)
    try {
      // Get existing step values for this run (should be empty for new run)
      const values = await this.valueRepo.findByRunId(run.id);
      const dataMap = values.reduce((acc, v) => {
        acc[v.stepId] = v.value;
        return acc;
      }, {} as Record<string, any>);

      const blockResult = await blockRunner.runPhase({
        workflowId: workflow.id,
        runId: run.id,
        phase: 'onRunStart',
        data: dataMap,
      });

      // Save outputs from onRunStart blocks (transform block outputs)
      if (blockResult.data && Object.keys(blockResult.data).length > 0) {
        for (const [stepId, value] of Object.entries(blockResult.data)) {
          await this.valueRepo.upsert({
            runId: run.id,
            stepId,
            value: value as any,
          });
        }
      }

      // If validation blocks failed, delete run and throw error
      if (!blockResult.success && blockResult.errors) {
        await this.runRepo.delete(run.id);
        throw new Error(`Run start validation failed: ${blockResult.errors.join(', ')}`);
      }
    } catch (error) {
      // Log but don't fail run creation on block execution errors
      console.error('Error executing onRunStart blocks:', error);
    }

    return run;
  }

  /**
   * List runs for a workflow
   */
  async listRuns(workflowId: string, userId: string): Promise<WorkflowRun[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);
    return await this.runRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get generated documents for a run
   * Returns all documents generated during workflow completion
   */
  async getGeneratedDocuments(runId: string) {
    // Verify run exists
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Fetch all generated documents
    const documents = await this.docsRepo.findByRunId(runId);

    return documents;
  }

  /**
   * Delete all generated documents for a run
   * Used for regenerating documents with updated values
   */
  async deleteGeneratedDocuments(runId: string): Promise<void> {
    // Verify run exists
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Delete all documents for this run
    await this.docsRepo.deleteByRunId(runId);

    logger.info({ runId }, 'Deleted all generated documents for run');
  }

  /**
   * Generate documents for a run (can be called before completion)
   * Idempotent - checks if documents already exist before generating
   * Used for Final Documents sections
   */
  async generateDocuments(runId: string): Promise<void> {
    // Verify run exists
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Check if documents already exist
    const existingDocuments = await this.docsRepo.findByRunId(runId);
    if (existingDocuments.length > 0) {
      logger.info({ runId, documentCount: existingDocuments.length }, 'Documents already exist, skipping generation');
      return;
    }

    // Generate documents using the document generation service
    try {
      await documentGenerationService.generateDocumentsForRun(runId);
      logger.info({ runId }, 'Documents generated successfully');
    } catch (error) {
      logger.error({ error, runId }, 'Document generation failed');
      throw error;
    }
  }

  /**
   * Determine the appropriate start section for a run
   * Used for auto-advance when creating runs from snapshots
   *
   * Rules:
   * A) Skip invisible sections via existing logic
   * B) For each required visible step:
   *    - If no run value → stop here
   *    - If snapshot version mismatch → stop here
   * C) If all satisfied → jump to first visible final block
   * D) Else fallback to workflow's first section
   *
   * @param runId - The run ID
   * @param workflowId - The workflow ID
   * @param snapshotValues - Optional snapshot value map for version checking
   * @returns The section ID to start from
   */
  async determineStartSection(
    runId: string,
    workflowId: string,
    snapshotValues?: Record<string, { value: any; stepId: string; stepUpdatedAt: string }>
  ): Promise<string> {
    // Get all sections for the workflow
    const sections = await this.sectionRepo.findByWorkflowId(workflowId);
    if (sections.length === 0) {
      throw new Error("Workflow has no sections");
    }

    // Sort sections by order
    const sortedSections = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Get all step values for the run
    const runValues = await this.valueRepo.findByRunId(runId);
    const runValueMap = new Map(runValues.map(v => [v.stepId, v]));

    // Get all steps for the workflow
    const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId);
    const stepMap = new Map(allSteps.map(s => [s.id, s]));

    // Build data map for logic evaluation
    const dataMap: Record<string, any> = {};
    for (const value of runValues) {
      const step = stepMap.get(value.stepId);
      if (step) {
        const key = step.alias || step.id;
        dataMap[key] = value.value;
      }
    }

    // Iterate through sections to find the first incomplete one
    for (const section of sortedSections) {
      // Check if section is visible using logic service
      const sectionVisible = await this.logicSvc.isSectionVisible(
        workflowId,
        section.id,
        dataMap
      );

      if (!sectionVisible) {
        continue; // Skip invisible sections
      }

      // Get steps for this section
      const sectionSteps = allSteps.filter(s => s.sectionId === section.id && !s.isVirtual);

      // Check if all required steps have valid values
      let allRequiredStepsSatisfied = true;

      for (const step of sectionSteps) {
        // Check if step is visible
        const stepVisible = await this.logicSvc.isStepVisible(
          workflowId,
          step.id,
          dataMap
        );

        if (!stepVisible) {
          continue; // Skip invisible steps
        }

        // Check if step is required
        const isRequired = await this.logicSvc.isStepRequired(
          workflowId,
          step.id,
          dataMap
        );

        if (!isRequired) {
          continue; // Skip optional steps
        }

        // Check if step has a value
        const hasValue = runValueMap.has(step.id);

        if (!hasValue) {
          // Required step missing value - stop here
          allRequiredStepsSatisfied = false;
          break;
        }

        // If snapshot values provided, check for version mismatch
        if (snapshotValues) {
          const key = step.alias || step.id;
          const snapshotData = snapshotValues[key];

          if (snapshotData) {
            const stepUpdatedAt = step.updatedAt?.toISOString() || new Date(0).toISOString();
            if (stepUpdatedAt > snapshotData.stepUpdatedAt) {
              // Step was updated after snapshot - treat as incomplete
              allRequiredStepsSatisfied = false;
              break;
            }
          }
        }
      }

      if (!allRequiredStepsSatisfied) {
        // Found first incomplete section - return this section
        return section.id;
      }
    }

    // All sections complete - return the last section (or first if none)
    return sortedSections[sortedSections.length - 1]?.id || sortedSections[0].id;
  }
}

// Singleton instance
export const runService = new RunService();
