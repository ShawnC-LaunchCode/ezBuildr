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
import { evaluateRules, validateRequiredSteps, getEffectiveRequiredSteps } from "@shared/workflowLogic";
import { blockRunner } from "./BlockRunner";
import type { BlockContext } from "@shared/types/blocks";

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

  constructor(
    runRepo?: typeof workflowRunRepository,
    valueRepo?: typeof stepValueRepository,
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.runRepo = runRepo || workflowRunRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.workflowSvc = workflowSvc || workflowService;
  }

  /**
   * Create a new workflow run
   * Executes onRunStart blocks to prefill initial data
   */
  async createRun(
    workflowId: string,
    userId: string,
    data: Omit<InsertWorkflowRun, 'workflowId'>,
    queryParams?: Record<string, any>
  ): Promise<WorkflowRun> {
    await this.workflowSvc.verifyOwnership(workflowId, userId);

    const run = await this.runRepo.create({
      ...data,
      workflowId,
      completed: false,
    });

    // Execute onRunStart blocks to prefill data
    const context: BlockContext = {
      workflowId,
      runId: run.id,
      phase: "onRunStart",
      data: {},
      queryParams,
    };

    const result = await blockRunner.runPhase(context);

    // Persist any prefilled data to step_values
    if (result.data && Object.keys(result.data).length > 0) {
      for (const [stepId, value] of Object.entries(result.data)) {
        await this.valueRepo.upsert({
          runId: run.id,
          stepId,
          value,
        });
      }
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
   * Executes onSectionSubmit blocks to validate data
   */
  async submitSectionValues(
    runId: string,
    userId: string,
    sectionId: string,
    values: Array<{ stepId: string; value: any }>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const run = await this.getRun(runId, userId);

    // Verify section belongs to workflow
    const section = await this.sectionRepo.findById(sectionId);
    if (!section || section.workflowId !== run.workflowId) {
      throw new Error("Section does not belong to this workflow");
    }

    // Get current data
    const currentValues = await this.valueRepo.findByRunId(runId);
    const data: Record<string, any> = {};
    currentValues.forEach((v) => {
      data[v.stepId] = v.value;
    });

    // Merge in new values (staging)
    const stagedData = { ...data };
    values.forEach(({ stepId, value }) => {
      stagedData[stepId] = value;
    });

    // Execute onSectionSubmit validation blocks
    const context: BlockContext = {
      workflowId: run.workflowId,
      runId,
      phase: "onSectionSubmit",
      sectionId,
      data: stagedData,
    };

    const result = await blockRunner.runPhase(context);

    // If validation failed, return errors
    if (!result.success && result.errors) {
      return { success: false, errors: result.errors };
    }

    // Validation passed, persist the values
    for (const { stepId, value } of values) {
      await this.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      });
    }

    return { success: true };
  }

  /**
   * Navigate to next section
   * Executes onNext blocks to determine branching
   */
  async navigateNext(
    runId: string,
    userId: string,
    currentSectionId: string
  ): Promise<{ nextSectionId?: string }> {
    const run = await this.getRun(runId, userId);

    // Get current data
    const currentValues = await this.valueRepo.findByRunId(runId);
    const data: Record<string, any> = {};
    currentValues.forEach((v) => {
      data[v.stepId] = v.value;
    });

    // Execute onNext blocks to determine next section
    const context: BlockContext = {
      workflowId: run.workflowId,
      runId,
      phase: "onNext",
      sectionId: currentSectionId,
      data,
    };

    const result = await blockRunner.runPhase(context);

    return { nextSectionId: result.nextSectionId };
  }

  /**
   * Complete a workflow run (with validation)
   */
  async completeRun(runId: string, userId: string): Promise<WorkflowRun> {
    const run = await this.getRun(runId, userId);

    if (run.completed) {
      throw new Error("Run is already completed");
    }

    // Get all workflow data
    const workflow = await this.workflowRepo.findById(run.workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }

    const sections = await this.sectionRepo.findByWorkflowId(workflow.id);
    const sectionIds = sections.map((s) => s.id);
    const steps = await this.stepRepo.findBySectionIds(sectionIds);
    const logicRules = await this.logicRuleRepo.findByWorkflowId(workflow.id);
    const currentValues = await this.valueRepo.findByRunId(runId);

    // Build data object for evaluation
    const data: Record<string, any> = {};
    currentValues.forEach((v) => {
      data[v.stepId] = v.value;
    });

    // Get initially required steps
    const initialRequiredSteps = new Set(steps.filter((s) => s.required).map((s) => s.id));

    // Evaluate logic to get effective required steps
    const effectiveRequiredSteps = getEffectiveRequiredSteps(
      initialRequiredSteps,
      logicRules,
      data
    );

    // Validate all required steps have values
    const validation = validateRequiredSteps(effectiveRequiredSteps, data);

    if (!validation.valid) {
      throw new Error(`Missing required steps: ${validation.missingSteps.join(', ')}`);
    }

    // Mark run as complete
    return await this.runRepo.markComplete(runId);
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
