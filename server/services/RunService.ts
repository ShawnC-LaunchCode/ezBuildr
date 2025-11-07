import {
  workflowRunRepository,
  stepValueRepository,
  workflowRepository,
  sectionRepository,
  stepRepository,
  logicRuleRepository,
} from "../repositories";
import type { WorkflowRun, InsertWorkflowRun, InsertStepValue } from "@shared/schema";
import { workflowService } from "./WorkflowService";
import { logicService, type NavigationResult } from "./LogicService";
import { blockRunner } from "./BlockRunner";
import { evaluateRules, validateRequiredSteps, getEffectiveRequiredSteps } from "@shared/workflowLogic";

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
  private workflowSvc: typeof workflowService;
  private logicSvc: typeof logicService;

  constructor(
    runRepo?: typeof workflowRunRepository,
    valueRepo?: typeof stepValueRepository,
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowSvc?: typeof workflowService,
    logicSvc?: typeof logicService
  ) {
    this.runRepo = runRepo || workflowRunRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.workflowSvc = workflowSvc || workflowService;
    this.logicSvc = logicSvc || logicService;
  }

  /**
   * Create a new workflow run
   * Executes onRunStart blocks after creation
   */
  async createRun(
    workflowId: string,
    userId: string,
    data: Omit<InsertWorkflowRun, 'workflowId'>
  ): Promise<WorkflowRun> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    // Create the run
    const run = await this.runRepo.create({
      ...data,
      workflowId,
      completed: false,
    });

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
   * Complete a workflow run (with validation)
   * Executes onRunComplete blocks before completion
   */
  async completeRun(runId: string, userId: string): Promise<WorkflowRun> {
    const run = await this.getRun(runId, userId);

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
