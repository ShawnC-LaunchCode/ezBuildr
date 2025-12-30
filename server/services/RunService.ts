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
// import { runJsIsolatedVm } from "../utils/sandboxExecutor"; // DEPRECATED: Replaced by ScriptEngine
import { scriptEngine } from "./scripting/ScriptEngine";
import { isJsQuestionConfig, type JsQuestionConfig } from "@shared/types/steps";
import { randomUUID } from "crypto";
import { captureRunLifecycle } from "./metrics";
import { logger } from "../logger";
import { documentGenerationService } from "./DocumentGenerationService";
import { runAuthResolver, RunAuthResolver } from "./runs/RunAuthResolver";
import { runExecutionCoordinator, RunExecutionCoordinator } from "./runs/RunExecutionCoordinator";
import { runPersistenceWriter, RunPersistenceWriter } from "./runs/RunPersistenceWriter";
import { db } from "../db";
import { workflowVersions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { analyticsService } from "./analytics/AnalyticsService";
import { aggregationService } from "./analytics/AggregationService";
import { writebackExecutionService } from "./WritebackExecutionService";

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
  private authResolver: RunAuthResolver;
  private executionCoordinator: RunExecutionCoordinator;
  private persistenceWriter: RunPersistenceWriter;

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
    logicSvc?: typeof logicService,
    authResolver?: RunAuthResolver,
    executionCoordinator?: RunExecutionCoordinator,
    persistenceWriter?: RunPersistenceWriter
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

    // Initialize sub-services with injected dependencies to ensure tests using mocks work correctly
    this.authResolver = authResolver || new RunAuthResolver(
      this.runRepo,
      this.workflowRepo,
      this.projectRepo,
      this.workflowSvc
    );



    this.persistenceWriter = persistenceWriter || new RunPersistenceWriter(
      this.runRepo,
      this.valueRepo,
      this.stepRepo,
      this.sectionRepo
    );

    this.executionCoordinator = executionCoordinator || new RunExecutionCoordinator(
      this.persistenceWriter,
      this.logicSvc,
      this.stepRepo,
      this.sectionRepo,
      this.workflowRepo
    );
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

    const valuesToSave: Array<{ stepId: string; value: any }> = [];

    // Populate step values
    for (const step of allSteps) {
      if (step.isVirtual) continue;

      let valueToSet: any = undefined;

      // First priority: initialValues (by alias or stepId)
      if (initialValues) {
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

      // Add to list if we have a value
      if (valueToSet !== undefined) {
        valuesToSave.push({
          stepId: step.id,
          value: valueToSet,
        });
      }
    }

    if (valuesToSave.length > 0) {
      await this.persistenceWriter.bulkSaveValues(runId, valuesToSave, workflowId);
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
      clientEmail?: string;
      accessMode?: 'anonymous' | 'token' | 'portal';
    }
  ): Promise<WorkflowRun> {
    const workflow = await this.authResolver.verifyCreateAccess(idOrSlug, userId);
    const workflowId = workflow.id;

    // Resolve the version to use for this run
    let targetVersionId = workflow.pinnedVersionId || workflow.currentVersionId;
    if (!targetVersionId) {
      logger.warn({ workflowId }, "No current or pinned version found for workflow, run might be unstable");
    }

    // Generate a unique token for this run
    const runToken = randomUUID();

    // Load snapshot values if snapshotId provided
    let snapshotValueMap: Record<string, { value: any; stepId: string; stepUpdatedAt: string }> | undefined;
    if (options?.snapshotId) {
      const { snapshotService } = await import('./SnapshotService');
      const snapshot = await snapshotService.getSnapshotById(options.snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${options.snapshotId}`);
      }

      // Check Snapshot Compatibility (Stage 400 Safety Signal)
      const compatibility = await snapshotService.validateSnapshot(options.snapshotId);
      if (!compatibility.valid) {
        if (compatibility.severity === 'hard_breaking') {
          logger.error({
            workflowId,
            snapshotId: options.snapshotId,
            reasons: compatibility.reasons
          }, "Prevented run creation from incompatible snapshot (Hard Breaking)");
          throw new Error(`Snapshot is incompatible with current workflow: ${compatibility.reasons.join(", ")}`);
        } else if (compatibility.severity === 'soft_breaking') {
          logger.warn({
            workflowId,
            snapshotId: options.snapshotId,
            reasons: compatibility.reasons
          }, "Run created from snapshot with missing fields (Soft Breaking)");
          // Proceed, but maybe we should notify frontend? 
          // For now, just logging is sufficient for "Safety Signal".
        }
      }

      const snapshotValues = await snapshotService.getSnapshotValues(options.snapshotId);
      initialValues = { ...initialValues, ...snapshotValues };
      snapshotValueMap = snapshot.values as Record<string, { value: any; stepId: string; stepUpdatedAt: string }>;
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
        options: step.options as any[] | undefined,
        description: step.description || undefined,
      }));

      // Call AI service to generate random values
      const aiService = createAIServiceFromEnv();
      const randomValues = await aiService.suggestValues(stepData, 'full');
      initialValues = { ...initialValues, ...randomValues };
    }

    // Create the run
    const run = await this.persistenceWriter.createRun({
      ...data,
      workflowId,
      workflowVersionId: targetVersionId || undefined,
      runToken,

      createdBy: userId || null,
      completed: false,
      clientEmail: options?.clientEmail,
      accessMode: options?.accessMode || 'anonymous'
    });

    // Populate initial values
    await this.populateInitialValues(run.id, workflowId, initialValues);

    // Determine start section with auto-advance logic
    if (options?.snapshotId || options?.randomize) {
      const startSectionId = await this.determineStartSection(run.id, workflowId, snapshotValueMap);
      await this.persistenceWriter.updateRun(run.id, {
        currentSectionId: startSectionId,
      });
    }

    // Capture run_started metric (Stage 11)
    const context = await this.getWorkflowContext(workflowId);
    // Context logged at debug level if needed
    if (context) {
      await captureRunLifecycle.started({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId,
        runId: run.id,
        createdBy: userId || 'anon',
      });

      // Stage 15: Workflow Analytics (New System)
      // ERROR HANDLING FIX: Wrap analytics calls in try-catch
      try {
        await analyticsService.recordEvent({
          runId: run.id,
          workflowId,
          versionId: targetVersionId || 'draft',
          type: 'run.start',
          timestamp: new Date().toISOString(),
          isPreview: false, // RunService manages live runs
          payload: {
            accessMode: options?.accessMode || 'anonymous'
          }
        });
      } catch (error) {
        // Analytics failures should not block workflow execution
        logger.warn({ error, runId: run.id }, 'Failed to record run.start analytics event');
      }
    }

    // Execute onRunStart blocks (transform + generic)
    try {
      const values = await this.persistenceWriter.getRunValues(run.id);

      const blockResult = await blockRunner.runPhase({
        workflowId,
        runId: run.id,
        phase: "onRunStart",
        data: values,
        versionId: targetVersionId || 'draft',
      });

      if (!blockResult.success && blockResult.errors) {
        logger.warn({ runId: run.id, errors: blockResult.errors }, `onRunStart block errors for run ${run.id}`);
      }
    } catch (error) {
      logger.error({ runId: run.id, error }, `Failed to execute onRunStart blocks for run ${run.id}`);
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
  /**
   * Get run by ID with auth check
   */
  async getRun(runId: string, userId: string): Promise<WorkflowRun> {
    const { run, access } = await this.authResolver.resolveRun(runId, userId);

    // Access check logic: 
    if (!run || access === 'none') {
      throw new Error("Run not found");
    }

    return run;
  }

  /**
   * Get run with all values
   */
  async getRunWithValues(runId: string, userId: string) {
    const run = await this.getRun(runId, userId);
    const values = await this.valueRepo.findByRunId(runId);
    return { ...run, values };
  }

  /**
   * Get run with all values without ownership check
   * Used for preview/run token authentication
   */
  async getRunWithValuesNoAuth(runId: string) {
    const run = await this.runRepo.findById(runId);
    if (!run) throw new Error("Run not found");

    const values = await this.persistenceWriter.getRunValues(runId);
    // values is Record<string, any>. Need to map to array of StepValue format if needed by caller?
    // Wait, caller expects { ...run, values: StepValue[] } usually?
    // RunService returned `values` from `valueRepo.findByRunId`.
    // My `persistenceWriter.getRunValues` returns Record<stepId, value>.
    // Legacy `getRunWithValues` returned `StepValue[]`.
    // I need to fetch StepValue[].

    // Since persistenceWriter is new, maybe I should expose `findByRunId` on it too?
    // Or just use runRepo or valueRepo here if just reading?
    // PersistenceWriter should ideally handle all "StepValue" access.
    // Let's use valueRepo for now for backward compatibility of return type.
    const rawValues = await this.valueRepo.findByRunId(runId);
    return { ...run, values: rawValues };
  }

  /**
   * Get run by Portal Access Key (Saved Link)
   */
  async getRunByPortalAccessKey(key: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findByPortalAccessKey(key);
    if (!run) throw new Error("Run not found");
    return run;
  }

  /**
   * Upsert a step value
   */
  async upsertStepValue(
    runId: string,
    userId: string,
    data: InsertStepValue
  ): Promise<void> {
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') throw new Error("Run not found");

    // Check if run is completed? 
    if (run.completed) throw new Error("Run is already completed");

    await this.persistenceWriter.saveStepValue(runId, data.stepId, data.value, run.workflowId);
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
  /**
   * Bulk upsert step values
   */
  async bulkUpsertValues(
    runId: string,
    userId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<void> {
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') throw new Error("Run not found");

    await this.persistenceWriter.bulkSaveValues(runId, values, run.workflowId);
  }

  /**
   * Bulk upsert step values without userId check (for run token auth)
   */
  async bulkUpsertValuesNoAuth(
    runId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<void> {
    const run = await this.runRepo.findById(runId);
    if (!run) throw new Error("Run not found");

    await this.persistenceWriter.bulkSaveValues(runId, values, run.workflowId);
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
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') {
      const createAccess = await this.authResolver.resolveRun(runId, undefined);
      // If anon access is allowed and user is undefined? 
      // But here userId is string.
      throw new Error("Run not found");
    }

    if (run.completed) throw new Error("Run is already completed");

    return await this.executionCoordinator.submitSection(
      { runId, workflowId: run.workflowId, userId, mode: 'live' },
      sectionId,
      values
    );
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
    if (!run) throw new Error("Run not found");
    if (run.completed) throw new Error("Run is already completed");

    return await this.executionCoordinator.submitSection(
      { runId, workflowId: run.workflowId, mode: 'live' }, // No userId
      sectionId,
      values
    );
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
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') {
      throw new Error("Run not found");
    }
    if (run.completed) throw new Error("Run is already completed");

    return await this.executionCoordinator.next(
      { runId, workflowId: run.workflowId, userId, mode: 'live' },
      run.currentSectionId
    );
  }

  /**
   * Calculate next section without ownership check
   * Used for preview/run token authentication
   */
  async nextNoAuth(runId: string): Promise<NavigationResult> {
    const run = await this.runRepo.findById(runId);
    if (!run) throw new Error("Run not found");
    if (run.completed) throw new Error("Run is already completed");

    return await this.executionCoordinator.next(
      { runId, workflowId: run.workflowId, mode: 'live' },
      run.currentSectionId
    );
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
        versionId: run.workflowVersionId || 'draft',
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

          // Stage 15: Workflow Analytics (New System)
          await analyticsService.recordEvent({
            runId: run.id,
            workflowId: run.workflowId,
            versionId: run.workflowVersionId || 'draft',
            type: 'validation.error',
            timestamp: new Date().toISOString(),
            isPreview: false,
            payload: {
              errors: blockResult.errors
            }
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

          // Stage 15: Workflow Analytics (New System)
          await analyticsService.recordEvent({
            runId: run.id,
            workflowId: run.workflowId,
            versionId: run.workflowVersionId || 'draft',
            type: 'validation.error', // Treat missing steps as validation error
            timestamp: new Date().toISOString(),
            isPreview: false,
            payload: {
              errorType: 'missing_required_steps',
              details: errorMsg
            }
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

      // Execute DataVault writebacks (if configured)
      try {
        const writebackResult = await writebackExecutionService.executeWritebacksForRun(
          runId,
          run.workflowId,
          userId
        );
        if (writebackResult.rowsCreated > 0) {
          logger.info(
            { runId, rowsCreated: writebackResult.rowsCreated },
            'DataVault writeback completed'
          );
        }
        if (writebackResult.errors.length > 0) {
          logger.warn(
            { runId, errors: writebackResult.errors },
            'Some writeback mappings failed'
          );
        }
      } catch (error) {
        logger.error({ error, runId }, 'Writeback execution failed, but run marked complete');
        // Don't fail the run completion if writeback fails
      }

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

        // Stage 15: Workflow Analytics (New System)
        await analyticsService.recordEvent({
          runId: run.id,
          workflowId: run.workflowId,
          versionId: run.workflowVersionId || 'draft',
          type: 'workflow.complete',
          timestamp: new Date().toISOString(),
          isPreview: false,
          payload: {
            durationMs: Date.now() - startTime,
            stepCount: allValues.length
          }
        });

        // Trigger Aggregation
        // Fire and forget - don't block response
        aggregationService.aggregateRun(run.id).catch(err => {
          logger.error({ error: err, runId: run.id }, "Failed to aggregate run metrics");
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
      versionId: run.workflowVersionId || 'draft',
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

      // Stage 15: Workflow Analytics (New System)
      await analyticsService.recordEvent({
        runId: run.id,
        workflowId: workflow.id,
        versionId: 'draft', // Anonymous runs on public/legacy often lack version tracking, defaulting to draft or need to fetch current version
        type: 'run.start',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          accessMode: 'anonymous'
        }
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
        versionId: 'draft', // Anonymous runs usually draft or untracked version
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
      // Error will be logged by caller or handler
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

  /**
   * Generate a share token for a completed run
   */
  async shareRun(runId: string, userId: string | undefined, authType: 'creator' | 'runToken', authContext: any): Promise<{ shareToken: string; expiresAt: Date | null }> {
    // Check auth
    if (authType === 'creator') {
      if (!userId) throw new Error("Unauthorized");
      const { run, access } = await this.authResolver.resolveRun(runId, userId);
      if (!run || access === 'none') throw new Error("Run not found or access denied");
    } else {
      // RunToken
      const run = await this.runRepo.findById(runId);
      if (!run) throw new Error("Run not found");
      if (run.runToken !== authContext.runToken) throw new Error("Access denied");
    }

    const shareToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days default expiration

    await this.runRepo.update(runId, {
      shareToken,
      shareTokenExpiresAt: expiresAt
    });

    return { shareToken, expiresAt };
  }

  /**
   * Get public run execution by share token
   */
  async getRunByShareToken(token: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findByShareToken(token);
    if (!run) throw new Error("Run not found or invalid token");

    if (run.shareTokenExpiresAt && new Date() > run.shareTokenExpiresAt) {
      throw new Error("Share link expired");
    }
    return run;
  }

  /**
   * Get shared run details including final block config
   */
  async getSharedRunDetails(token: string) {
    // 1. Get run by token (validates expiration)
    const run = await this.getRunByShareToken(token);
    const workflow = await this.workflowRepo.findById(run.workflowId);
    const accessSettings = (workflow as any)?.accessSettings || { allow_portal: false, allow_resume: true, allow_redownload: true };

    // 2. Get documents
    const documents = await this.docsRepo.findByRunId(run.id);

    // 3. Get Final Block Config
    let finalBlockConfig: any = null;

    if (run.workflowVersionId) {
      // Fetch version graph
      const [version] = await db
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.id, run.workflowVersionId))
        .limit(1);

      if (version && version.graphJson) {
        const graph = version.graphJson as any;
        // Search for 'final' node
        // Graph structure: { nodes: [], edges: [] }
        if (graph.nodes && Array.isArray(graph.nodes)) {
          const finalNode = graph.nodes.find((n: any) => n.type === 'final');
          if (finalNode && finalNode.data && finalNode.data.config) {
            finalBlockConfig = finalNode.data.config;
          }
        }
      }
    } else {
      // Draft run - fetch from steps table
      // We look for a step of type 'final' in the current workflow definition
      const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(run.workflowId);
      const finalStep = allSteps.find(s => s.type === 'final');

      if (finalStep && finalStep.options) {
        finalBlockConfig = finalStep.options;
      }
    }

    return {
      run: { ...run, accessSettings },
      documents,
      finalBlockConfig
    };
  }
}


export const runService = new RunService();
