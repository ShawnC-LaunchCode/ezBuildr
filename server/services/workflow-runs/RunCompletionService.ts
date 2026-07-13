import type { WorkflowRun } from "@shared/schema";

import { createLogger } from "../../logger";
import { workflowRunRepository, stepValueRepository } from "../../repositories";
import { blockRunner } from "../BlockRunner";

import type { RunLifecycleService } from "./RunLifecycleService";
import { runDataService, type RunDataService } from "./RunDataService";
import type { RunMetricsService } from "./RunMetricsService";
import type { RunStateService } from "./RunStateService";
import type { LogicService } from "../LogicService";

const _logger = createLogger({ module: 'run-completion-service' });
/**
 * Service for handling workflow run completion logic
 */
export class RunCompletionService {
    // eslint-disable-next-line max-params -- dependency injection requires all 6 services
    constructor(
        private runRepo: typeof workflowRunRepository,
        private valueRepo: typeof stepValueRepository,
        private logicSvc: LogicService,
        private stateService: RunStateService,
        private lifecycleService: RunLifecycleService,
        private metricsService: RunMetricsService,
        private runDataSvc: RunDataService = runDataService
    ) { }
    /**
     * Complete a workflow run (with validation)
     */
    async completeRun(runId: string, run: WorkflowRun, userId: string): Promise<WorkflowRun> {
        return this.complete(runId, run, userId);
    }
    /**
     * Complete a workflow run without ownership check
     * Used for run-token (anonymous/portal) completion
     */
    async completeRunNoAuth(runId: string): Promise<WorkflowRun> {
        const run = await this.runRepo.findById(runId);
        if (!run) {
            throw new Error("Run not found");
        }
        return this.complete(runId, run, undefined);
    }
    /**
     * Shared completion pipeline for both auth paths: run onRunComplete blocks,
     * validate required steps, atomically mark completed, then kick off
     * writebacks + document generation in the background.
     */
    private async complete(runId: string, run: WorkflowRun, userId: string | undefined): Promise<WorkflowRun> {
        const startTime = Date.now();
        if (run.completed) {
            throw new Error("Run is already completed");
        }
        try {
            const runData = await this.runDataSvc.buildForRun(runId, run.workflowId);
            // Execute onRunComplete blocks (transform + validate)
            const blockResult = await blockRunner.runPhase({
                workflowId: run.workflowId,
                runId: run.id,
                phase: "onRunComplete",
                data: runData.byStepId,
                versionId: run.workflowVersionId ?? 'draft',
            });
            // If blocks produced validation errors, reject completion
            if (!blockResult.success && blockResult.errors) {
                const errorMsg = `Validation failed: ${blockResult.errors.join(', ')}`;
                await this.metricsService.captureRunFailed(
                    run.workflowId,
                    run.id,
                    run.workflowVersionId ?? undefined,
                    Date.now() - startTime,
                    'validation_error',
                    { errors: blockResult.errors }
                );
                throw new Error(errorMsg);
            }
            // Validate using LogicService
            const validation = await this.logicSvc.validateCompletion(run.workflowId, runId, runData.byStepId);
            if (!validation.valid) {
                const stepTitles = validation.missingStepTitles?.join(', ') ?? validation.missingSteps.join(', ');
                const errorMsg = `Missing required steps: ${stepTitles}`;
                await this.metricsService.captureRunFailed(
                    run.workflowId,
                    run.id,
                    run.workflowVersionId ?? undefined,
                    Date.now() - startTime,
                    'missing_required_steps',
                    { errorType: 'missing_required_steps', details: errorMsg }
                );
                throw new Error(errorMsg);
            }
            // Mark run as complete. markCompleted only updates rows where
            // completed = false, so a concurrent double-complete loses here
            // instead of generating documents twice.
            const completedRun = await this.stateService.markCompleted(runId);
            // Execute DataVault writebacks and Document Generation (truly non-blocking)
            // on BOTH auth paths — anonymous/token completions previously skipped
            // writebacks entirely.
            Promise.allSettled([
                this.lifecycleService.executeWritebacks(runId, run.workflowId, userId),
                this.lifecycleService.generateDocuments(runId, {
                    runData: this.runDataSvc.fromStepIdData(blockResult.data ?? runData.byStepId, runData.steps),
                })
            ]).then((results) => {
                for (const result of results) {
                    if (result.status === 'rejected') {
                        _logger.error({ runId, error: result.reason as unknown }, "Background execution failed");
                    }
                }
            }).catch((err: unknown) => _logger.error({ runId, error: err }, "Unhandled error in background execution"));
            // Capture success metrics
            await this.metricsService.captureRunSucceeded(
                run.workflowId,
                run.id,
                run.workflowVersionId ?? undefined,
                Date.now() - startTime,
                Object.keys(runData.byStepId).length
            );
            return completedRun;
        } catch (error) {
            // Capture failure if not already captured
            if (error instanceof Error && !error.message.includes('Validation failed') && !error.message.includes('Missing required steps')) {
                await this.metricsService.captureRunFailed(
                    run.workflowId,
                    run.id,
                    run.workflowVersionId ?? undefined,
                    Date.now() - startTime,
                    'unknown_error'
                );
            }
            throw error;
        }
    }
}
