import type { WorkflowRun } from "@shared/schema";

import { workflowRunRepository, stepValueRepository } from "../../repositories";
import { createError } from "../../utils/errors";
import { blockRunner } from "../BlockRunner";

import type { RunLifecycleService } from "./RunLifecycleService";
import { runDataService, type RunDataService } from "./RunDataService";
import type { RunMetricsService } from "./RunMetricsService";
import type { RunStateService } from "./RunStateService";
import type { LogicService } from "../LogicService";

/**
 * Service for handling workflow run completion logic
 */
export class RunCompletionService {
    // eslint-disable-next-line max-params -- compatibility-preserving dependency injection
    constructor(
        private runRepo: typeof workflowRunRepository,
        _valueRepo: typeof stepValueRepository,
        private logicSvc: LogicService,
        private stateService: RunStateService,
        _lifecycleService: RunLifecycleService,
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
     * validate required steps, then atomically mark completed and enqueue
     * durable writeback + document-generation jobs.
     */
    private async complete(runId: string, run: WorkflowRun, userId: string | undefined): Promise<WorkflowRun> {
        const startTime = Date.now();
        if (run.completed) {
            throw createError.runCompleted();
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
            // Completion and both required post-processing jobs commit together.
            // The leased database worker owns delivery after this boundary, so a
            // process restart cannot lose writeback or document work.
            const completedRun = await this.stateService.markCompletedAndEnqueue(
                runId,
                run.workflowId,
                userId
            );
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
