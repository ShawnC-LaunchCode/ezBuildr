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
import { transformBlockService } from "./TransformBlockService";
import { evaluateRules, validateRequiredSteps, getEffectiveRequiredSteps } from "@shared/workflowLogic";
import { blockRunner } from "./BlockRunner";
import type { BlockContext } from "@shared/types/blocks";
import { randomUUID } from "crypto";

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
  private transformSvc: typeof transformBlockService;

  constructor(
    runRepo?: typeof workflowRunRepository,
    valueRepo?: typeof stepValueRepository,
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository,
    stepRepo?: typeof stepRepository,
    logicRuleRepo?: typeof logicRuleRepository,
    workflowSvc?: typeof workflowService,
    transformSvc?: typeof transformBlockService
  ) {
    this.runRepo = runRepo || workflowRunRepository;
    this.valueRepo = valueRepo || stepValueRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.logicRuleRepo = logicRuleRepo || logicRuleRepository;
    this.workflowSvc = workflowSvc || workflowService;
    this.transformSvc = transformSvc || transformBlockService;
  }

  /**
   * Create a new workflow run
   * Executes onRunStart blocks to prefill initial data
   *
   * @param workflowId - The workflow to run
   * @param userId - Creator user ID (optional for anonymous runs)
   * @param data - Additional run data
   * @param queryParams - Query parameters for prefill blocks
   * @param isAnonymous - Whether this is an anonymous run (via publicLink)
   */
  async createRun(
    workflowId: string,
    userId: string | null,
    data: Omit<InsertWorkflowRun, 'workflowId' | 'runToken' | 'createdBy'>,
    queryParams?: Record<string, any>,
    isAnonymous: boolean = false
  ): Promise<WorkflowRun & { runToken: string }> {
    // For authenticated runs, verify ownership
    if (userId && !isAnonymous) {
      await this.workflowSvc.verifyOwnership(workflowId, userId);
    }

    // For anonymous runs, verify workflow is active and has publicLink
    if (isAnonymous) {
      const workflow = await this.workflowRepo.findById(workflowId);
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      if (workflow.status !== 'active') {
        throw new Error("Workflow is not active");
      }
      if (!workflow.publicLink) {
        throw new Error("Workflow does not allow anonymous access");
      }
    }

    // Generate unique run token
    const runToken = randomUUID();
    const createdBy = isAnonymous ? "anon" : `creator:${userId}`;

    const run = await this.runRepo.create({
      ...data,
      workflowId,
      runToken,
      createdBy,
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

    // Return run with runToken for client
    return { ...run, runToken };
  }

  /**
   * Verify access to a run (either by creator ownership or valid runToken)
   */
  private async verifyRunAccess(
    run: WorkflowRun,
    userId: string | null,
    runToken?: string
  ): Promise<void> {
    // If runToken provided and matches, grant access
    if (runToken && run.runToken === runToken) {
      return;
    }

    // Otherwise, verify creator ownership
    if (!userId) {
      throw new Error("Access denied - authentication required");
    }

    await this.workflowSvc.verifyOwnership(run.workflowId, userId);
  }

  /**
   * Get run by ID
   * Access granted to creator or valid runToken holder
   */
  async getRun(
    runId: string,
    userId: string | null,
    runToken?: string
  ): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Verify access
    await this.verifyRunAccess(run, userId, runToken);

    return run;
  }

  /**
   * Get run with all values
   */
  async getRunWithValues(
    runId: string,
    userId: string | null,
    runToken?: string
  ) {
    const run = await this.getRun(runId, userId, runToken);
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
    userId: string | null,
    data: InsertStepValue,
    runToken?: string
  ): Promise<void> {
    const run = await this.getRun(runId, userId, runToken);

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
    userId: string | null,
    values: Array<{ stepId: string; value: any }>,
    runToken?: string
  ): Promise<void> {
    const run = await this.getRun(runId, userId, runToken);

    for (const { stepId, value } of values) {
      await this.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      }, runToken);
    }
  }

  /**
   * Submit section values with validation
   * Executes onSectionSubmit blocks to validate data
   */
  async submitSectionValues(
    runId: string,
    userId: string | null,
    sectionId: string,
    values: Array<{ stepId: string; value: any }>,
    runToken?: string
  ): Promise<{ success: boolean; errors?: string[] }> {
    const run = await this.getRun(runId, userId, runToken);

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
      }, runToken);
    }

    return { success: true };
  }

  /**
   * Navigate to next section
   * Executes onNext blocks to determine branching
   */
  async navigateNext(
    runId: string,
    userId: string | null,
    currentSectionId: string,
    runToken?: string
  ): Promise<{ nextSectionId?: string }> {
    const run = await this.getRun(runId, userId, runToken);

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
  async completeRun(
    runId: string,
    userId: string | null,
    runToken?: string
  ): Promise<WorkflowRun> {
    const run = await this.getRun(runId, userId, runToken);

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

    // ===================================================================
    // Execute transform blocks BEFORE validation
    // This allows transform blocks to compute derived values that may be
    // required for validation or subsequent logic
    // ===================================================================
    const transformResult = await this.transformSvc.executeAllForWorkflow({
      workflowId: workflow.id,
      runId,
      data,
    });

    // Use updated data from transform blocks (includes computed outputs)
    const finalData = transformResult.data || data;

    // If transform blocks had errors, log them but continue
    // (transform errors don't prevent run completion unless critical)
    if (transformResult.errors && transformResult.errors.length > 0) {
      console.warn(`Transform block errors during run ${runId}:`, transformResult.errors);
    }

    // Get initially required steps
    const initialRequiredSteps = new Set(steps.filter((s) => s.required).map((s) => s.id));

    // Evaluate logic to get effective required steps
    const effectiveRequiredSteps = getEffectiveRequiredSteps(
      initialRequiredSteps,
      logicRules,
      finalData
    );

    // Validate all required steps have values
    const validation = validateRequiredSteps(effectiveRequiredSteps, finalData);

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
