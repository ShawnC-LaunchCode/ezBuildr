import { randomUUID } from "crypto";

import type { WorkflowRun, InsertWorkflowRun, InsertStepValue, StepValue, RunGeneratedDocument } from "@shared/schema";

import { RUN_TOKEN_CONFIG } from "../config/auth";
import { logger } from "../logger";
import { hashToken } from "../utils/encryption";
import { createError } from "../utils/errors";

function validateJsonbSize(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {return;}
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > 1024 * 1024) { // 1MB
    throw createError.validation(`Payload exceeds 1MB limit for ${fieldName}`);
  }
}
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

import { logicService, type NavigationResult } from "./LogicService";
import { RunAuthResolver } from "./runs/RunAuthResolver";
import { RunExecutionCoordinator } from "./runs/RunExecutionCoordinator";
import { RunPersistenceWriter } from "./runs/RunPersistenceWriter";
import { RunCompletionService } from "./workflow-runs/RunCompletionService";
import { RunLifecycleService } from "./workflow-runs/RunLifecycleService";
import { RunMetricsService } from "./workflow-runs/RunMetricsService";
import { RunShareService } from "./workflow-runs/RunShareService";
import { RunStateService } from "./workflow-runs/RunStateService";
import { workflowService } from "./WorkflowService";

import type { CreateRunOptions, DocumentGenerationResult } from "./workflow-runs/types";
import type { GenerateDocumentsOptions } from "./workflow-runs/RunLifecycleService";

const ERR_RUN_NOT_FOUND = "Run not found";
const FIELD_STEP_VALUE = 'step value';
/**
 * Service layer for workflow run-related business logic
 * Facade pattern: delegates to specialized services for cleaner architecture
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
  // Specialized services for separation of concerns
  private lifecycleService: RunLifecycleService;
  private stateService: RunStateService;
  private metricsService: RunMetricsService;
  private shareService: RunShareService;
  private completionService: RunCompletionService;
  // eslint-disable-next-line max-params, complexity, sonarjs/cognitive-complexity
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
    persistenceWriter?: RunPersistenceWriter,
    lifecycleService?: RunLifecycleService,
    stateService?: RunStateService,
    metricsService?: RunMetricsService,
    shareService?: RunShareService,
    completionService?: RunCompletionService,
  ) {
    this.runRepo = runRepo ?? workflowRunRepository;
    this.valueRepo = valueRepo ?? stepValueRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.sectionRepo = sectionRepo ?? sectionRepository;
    this.stepRepo = stepRepo ?? stepRepository;
    this.logicRuleRepo = logicRuleRepo ?? logicRuleRepository;
    this.projectRepo = projectRepo ?? projectRepository;
    this.docsRepo = docsRepo ?? runGeneratedDocumentsRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
    this.logicSvc = logicSvc ?? logicService;
    this.authResolver = authResolver ?? new RunAuthResolver(
      this.runRepo,
      this.workflowRepo,
      this.projectRepo,
      this.workflowSvc
    );
    this.persistenceWriter = persistenceWriter ?? new RunPersistenceWriter(
      this.runRepo,
      this.valueRepo,
      this.stepRepo,
      this.sectionRepo
    );
    this.executionCoordinator = executionCoordinator ?? new RunExecutionCoordinator(
      this.persistenceWriter,
      this.logicSvc,
      this.stepRepo,
      this.sectionRepo,
      this.workflowRepo
    );
    this.lifecycleService = lifecycleService ?? new RunLifecycleService(
      this.valueRepo,
      this.stepRepo,
      this.sectionRepo,
      this.persistenceWriter,
      this.logicSvc
    );
    this.stateService = stateService ?? new RunStateService(
      this.runRepo,
      this.docsRepo
    );
    this.metricsService = metricsService ?? new RunMetricsService(
      this.workflowRepo,
      this.projectRepo
    );
    this.shareService = shareService ?? new RunShareService(
      this.runRepo,
      this.workflowRepo,
      this.docsRepo,
      this.stepRepo,
      this.authResolver
    );
    this.completionService = completionService ?? new RunCompletionService(
      this.runRepo,
      this.valueRepo,
      this.logicSvc,
      this.stateService,
      this.lifecycleService,
      this.metricsService
    );
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
    initialValues?: Record<string, unknown>,
    options?: CreateRunOptions
  ): Promise<WorkflowRun> {
    const workflow = await this.authResolver.verifyCreateAccess(idOrSlug, userId);
    const workflowId = workflow.id;
    // Resolve the version to use for this run
    const targetVersionId = workflow.pinnedVersionId ?? workflow.currentVersionId;
    if (!targetVersionId && !userId) {
      throw new Error('Workflow has no published version for anonymous runs');
    }
    if (!targetVersionId) {
      logger.warn({ workflowId }, "No current or pinned version found for workflow, run might be unstable");
    }
    // Generate a unique token for this run. The plaintext is returned to the
    // caller; only its hash is persisted.
    const runToken = randomUUID();
    const runTokenHash = hashToken(runToken);
    const tokenExpiresAt = new Date(Date.now() + RUN_TOKEN_CONFIG.EXPIRY_MS);
    // Load snapshot values if snapshotId provided
    let snapshotValueMap: Record<string, { value: unknown; stepId: string; stepUpdatedAt: string }> | undefined;
    let mergedInitialValues = { ...initialValues };
    if (data.metadata) {
      validateJsonbSize(data.metadata, 'metadata');
    }

    if (options?.snapshotId) {
      const { values, valueMap } = await this.lifecycleService.loadSnapshotValues(options.snapshotId);
      mergedInitialValues = { ...mergedInitialValues, ...values };
      snapshotValueMap = valueMap;
    }
    // Generate random values if randomize is true
    if (options?.randomize) {
      const randomValues = await this.lifecycleService.generateRandomValues(workflowId);
      mergedInitialValues = { ...mergedInitialValues, ...randomValues };
    }
    // Create the run
    const run = await this.persistenceWriter.createRun({
      ...data,
      workflowId,
      workflowVersionId: targetVersionId ?? undefined,
      runToken: runTokenHash,
      tokenExpiresAt,
      createdBy: userId ?? null,
      completed: false,
      clientEmail: options?.clientEmail,
      accessMode: options?.accessMode ?? 'anonymous'
    });
    // Populate initial values using lifecycle service
    await this.lifecycleService.populateInitialValues(run.id, workflowId, {
      initialValues: mergedInitialValues
    });
    // Determine start section with auto-advance logic
    if ((options?.snapshotId !== null && options?.snapshotId !== undefined) || options?.randomize === true) {
      const startSectionId = await this.lifecycleService.determineStartSection(run.id, workflowId, snapshotValueMap);
      await this.stateService.updateProgress(run.id, startSectionId);
    }
    // Capture metrics
    await this.metricsService.captureRunStarted(
      workflowId,
      run.id,
      userId ?? undefined,
      targetVersionId ?? undefined,
      { accessMode: options?.accessMode }
    );
    // Execute onRunStart blocks
    await this.lifecycleService.executeOnRunStart(run.id, workflowId, targetVersionId ?? undefined);
    // Return the plaintext token to the caller; the DB only holds its hash.
    return { ...run, runToken };
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
      throw new Error(ERR_RUN_NOT_FOUND);
    }
    return run;
  }
  /**
   * Revoke a run's bearer token (e.g. if a run link leaks). Only the run creator or the
   * workflow owner may revoke. Immediately invalidates run-token access to this run.
   */
  async revokeRunToken(runId: string, userId: string): Promise<void> {
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') { throw new Error(ERR_RUN_NOT_FOUND); }
    await this.runRepo.revokeToken(runId);
  }
  /**
   * Get run by ID without ownership check
   * Used for run token authentication (the token itself proves access to this run)
   */
  async getRunNoAuth(runId: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findById(runId);
    if (!run) { throw new Error(ERR_RUN_NOT_FOUND); }
    return run;
  }
  /**
   * Get run with all values
   */
  async getRunWithValues(runId: string, userId: string): Promise<WorkflowRun & { values: StepValue[] }> {
    const run = await this.getRun(runId, userId);
    const values = await this.valueRepo.findByRunId(runId);
    return { ...run, values };
  }
  /**
   * Get run with all values without ownership check
   * Used for preview/run token authentication
   */
  async getRunWithValuesNoAuth(runId: string): Promise<WorkflowRun & { values: StepValue[] }> {
    const run = await this.runRepo.findById(runId);
    if (!run) { throw new Error(ERR_RUN_NOT_FOUND); }
    const rawValues = await this.valueRepo.findByRunId(runId);
    return { ...run, values: rawValues };
  }
  /**
   * Get run by Portal Access Key (Saved Link)
   */
  async getRunByPortalAccessKey(key: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findByPortalAccessKey(key);
    if (!run) { throw new Error(ERR_RUN_NOT_FOUND); }
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
    if (!run || access === 'none') { throw new Error(ERR_RUN_NOT_FOUND); }
    // Check if run is completed? 
    if (run.completed) { throw createError.runCompleted(); }
    validateJsonbSize(data.value, FIELD_STEP_VALUE);
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
      throw new Error(ERR_RUN_NOT_FOUND);
    }
    validateJsonbSize(data.value, FIELD_STEP_VALUE);
    await this.persistenceWriter.saveStepValue(runId, data.stepId, data.value, run.workflowId);
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
    values: Array<{ stepId: string; value: unknown }>
  ): Promise<void> {
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') { throw new Error(ERR_RUN_NOT_FOUND); }
    values.forEach(v => validateJsonbSize(v.value, FIELD_STEP_VALUE));
    await this.persistenceWriter.bulkSaveValues(runId, values, run.workflowId);
  }
  /**
   * Bulk upsert step values without userId check (for run token auth)
   */
  async bulkUpsertValuesNoAuth(
    runId: string,
    values: Array<{ stepId: string; value: unknown }>
  ): Promise<void> {
    const run = await this.runRepo.findById(runId);
    if (!run) { throw new Error(ERR_RUN_NOT_FOUND); }
    values.forEach(v => validateJsonbSize(v.value, FIELD_STEP_VALUE));
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
    values: Array<{ stepId: string; value: unknown }>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const { run, access } = await this.authResolver.resolveRun(runId, userId);
    if (!run || access === 'none') {
      throw new Error(ERR_RUN_NOT_FOUND);
    }
    if (run.completed) { throw createError.runCompleted(); }
    values.forEach(v => validateJsonbSize(v.value, FIELD_STEP_VALUE));
    return this.executionCoordinator.submitSection(
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
    values: Array<{ stepId: string; value: unknown }>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const run = await this.runRepo.findById(runId);
    if (!run) { throw new Error(ERR_RUN_NOT_FOUND); }
    if (run.completed) { throw createError.runCompleted(); }
    values.forEach(v => validateJsonbSize(v.value, FIELD_STEP_VALUE));
    return this.executionCoordinator.submitSection(
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
      throw new Error(ERR_RUN_NOT_FOUND);
    }
    if (run.completed) { throw createError.runCompleted(); }
    return this.executionCoordinator.next(
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
    if (!run) { throw new Error(ERR_RUN_NOT_FOUND); }
    if (run.completed) { throw createError.runCompleted(); }
    return this.executionCoordinator.next(
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
    return this.completionService.completeRun(runId, run, userId);
  }
  /**
   * Complete a workflow run without ownership check
   * Used for preview/run token authentication
   */
  async completeRunNoAuth(runId: string): Promise<WorkflowRun> {
    return this.completionService.completeRunNoAuth(runId);
  }
  /**
   * Create an anonymous workflow run from a public link slug
   * Does not require authentication or ownership verification
   * @param publicLinkSlug - The workflow's public link slug
   * @param initialValues - Optional key/value pairs to pre-populate step values (key can be alias or stepId)
   */
  async createAnonymousRun(publicLinkSlug: string, initialValues?: Record<string, unknown>): Promise<WorkflowRun> {
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
    const targetVersionId = workflow.pinnedVersionId ?? workflow.currentVersionId;
    if (!targetVersionId) {
      throw new Error('Workflow has no published version for anonymous runs');
    }
    // Generate a unique token for this run. The plaintext is returned to the
    // caller; only its hash is persisted.
    const runToken = randomUUID();
    const runTokenHash = hashToken(runToken);
    const tokenExpiresAt = new Date(Date.now() + RUN_TOKEN_CONFIG.EXPIRY_MS);
    // Create the run with anonymous creator
    const run = await this.runRepo.create({
      workflowId: workflow.id,
      workflowVersionId: targetVersionId,
      runToken: runTokenHash,
      tokenExpiresAt,
      createdBy: 'anon',
      completed: false,
    });
    // Populate initial values
    await this.lifecycleService.populateInitialValues(run.id, workflow.id, {
      initialValues
    });
    // Capture metrics
    await this.metricsService.captureRunStarted(
      workflow.id,
      run.id,
      undefined,
      targetVersionId,
      { accessMode: 'anonymous' }
    );
    // Execute onRunStart blocks
    await this.lifecycleService.executeOnRunStart(run.id, workflow.id, targetVersionId);
    // Return the plaintext token to the caller; the DB only holds its hash.
    return { ...run, runToken };
  }
  /**
   * List runs for a workflow
   */
  async listRuns(workflowId: string, userId: string): Promise<WorkflowRun[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId);
    return this.runRepo.findByWorkflowId(workflowId);
  }
  /**
   * Get generated documents for a run
   * Returns all documents generated during workflow completion
   */
  async getGeneratedDocuments(runId: string): Promise<{
    documents: RunGeneratedDocument[];
    generationStatus: WorkflowRun["generationStatus"];
  }> {
    return this.stateService.getGeneratedDocuments(runId);
  }
  /**
   * Delete all generated documents for a run
   * Used for regenerating documents with updated values
   */
  async deleteGeneratedDocuments(runId: string): Promise<void> {
    await this.stateService.deleteGeneratedDocuments(runId);
  }
  /**
   * Generate documents for a run (can be called before completion)
   * Idempotent - checks if documents already exist before generating
   * Used for Final Documents sections
   */
  async generateDocuments(runId: string, options: GenerateDocumentsOptions = {}): Promise<DocumentGenerationResult> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error(ERR_RUN_NOT_FOUND);
    }
    // Check if documents already exist
    const existingDocuments = await this.docsRepo.findByRunId(runId);
    if (existingDocuments.length > 0) {
      logger.info({ runId, documentCount: existingDocuments.length }, 'Documents already exist, skipping generation');
      return { success: true, documentsGenerated: 0, documents: [] };
    }
    // Generate documents
    const result = await this.lifecycleService.generateDocuments(runId, options);
    if (!result.success) {
      throw new Error(`Document generation failed: ${result.errors?.join(', ')}`);
    }
    return result;
  }
  /**
   * Determine the appropriate start section for a run
   * Used for auto-advance when creating runs from snapshots
   *
   * @param runId - The run ID
   * @param workflowId - The workflow ID
   * @param snapshotValues - Optional snapshot value map for version checking
   * @returns The section ID to start from
   */
  async determineStartSection(
    runId: string,
    workflowId: string,
    snapshotValues?: Record<string, { value: unknown; stepId: string; stepUpdatedAt: string }>
  ): Promise<string> {
    return this.lifecycleService.determineStartSection(runId, workflowId, snapshotValues);
  }
  /**
   * Generate a share token for a completed run
   */
  async shareRun(runId: string, userId: string | undefined, authType: 'creator' | 'runToken', authContext: unknown): Promise<{ shareToken: string; expiresAt: Date | null }> {
    return this.shareService.shareRun(runId, userId, authType, authContext);
  }
  /**
   * Get public run execution by share token
   */
  async getRunByShareToken(token: string): Promise<WorkflowRun> {
    return this.shareService.getRunByShareToken(token);
  }
  /**
   * Get shared run details including final block config
   */
  async getSharedRunDetails(token: string): Promise<unknown> {
    return this.shareService.getSharedRunDetails(token);
  }
}
export const runService = new RunService();
