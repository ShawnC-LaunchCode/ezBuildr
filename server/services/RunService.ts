import {
  workflowRunRepository,
  stepValueRepository,
  workflowRepository,
  sectionRepository,
  stepRepository,
  logicRuleRepository,
  projectRepository,
} from "../repositories";
import type { WorkflowRun, InsertWorkflowRun, InsertStepValue } from "@shared/schema";
import { workflowService } from "./WorkflowService";
import { logicService, type NavigationResult } from "./LogicService";
import { blockRunner } from "./BlockRunner";
import { evaluateRules, validateRequiredSteps, getEffectiveRequiredSteps } from "@shared/workflowLogic";
import { runJsVm2 } from "../utils/sandboxExecutor";
import { isJsQuestionConfig, type JsQuestionConfig } from "@shared/types/steps";
import { randomUUID } from "crypto";
import { captureRunLifecycle } from "./metrics";

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
      if (!project) {
        return null;
      }

      return {
        tenantId: project.tenantId,
        projectId: project.id,
      };
    } catch (error) {
      console.error('Failed to get workflow context for metrics:', error);
      return null;
    }
  }

  /**
   * Create a new workflow run
   * Executes onRunStart blocks after creation
   */
  async createRun(
    workflowId: string,
    userId: string,
    data: Omit<InsertWorkflowRun, 'workflowId' | 'runToken'>
  ): Promise<WorkflowRun> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Generate a unique token for this run
    const runToken = randomUUID();
    const startTime = Date.now();

    // Create the run
    const run = await this.runRepo.create({
      ...data,
      workflowId,
      runToken,
      completed: false,
    });

    // Capture run_started metric (Stage 11)
    const context = await this.getWorkflowContext(workflowId);
    if (context) {
      await captureRunLifecycle.started({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId,
        runId: run.id,
        createdBy: userId,
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
        console.warn(`onRunStart block errors for run ${run.id}:`, blockResult.errors);
      }
    } catch (error) {
      console.error(`Failed to execute onRunStart blocks for run ${run.id}:`, error);
      // Don't fail run creation if blocks fail
    }

    return run;
  }

  /**
   * Get run by ID
   */
  async getRun(runId: string, userId: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Verify ownership of the workflow
    await this.workflowSvc.verifyOwnership(run.workflowId, userId);

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
        // Try to find step by alias or ID
        const inputStep = allSteps.find(s => s.alias === key || s.id === key);
        if (inputStep && dataMap[inputStep.id] !== undefined) {
          input[key] = dataMap[inputStep.id];
        }
      }

      try {
        // Execute the code
        const result = await runJsVm2(
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
          value: result.output,
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
    return await this.runRepo.update(runId, {
      completed: true,
      completedAt: new Date(),
      progress: 100,
    });
  }

  /**
   * List runs for a workflow
   */
  async listRuns(workflowId: string, userId: string): Promise<WorkflowRun[]> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);
    return await this.runRepo.findByWorkflowId(workflowId);
  }
}

// Singleton instance
export const runService = new RunService();
