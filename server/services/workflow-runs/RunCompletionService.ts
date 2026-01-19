import { workflowRunRepository, stepValueRepository } from "../../repositories";
import { createLogger } from "../../logger";
import { blockRunner } from "../BlockRunner";
import type { RunLifecycleService } from "./RunLifecycleService";
import type { RunStateService } from "./RunStateService";
import type { RunMetricsService } from "./RunMetricsService";
import type { LogicService } from "../LogicService";
import type { WorkflowRun } from "@shared/schema";
const logger = createLogger({ module: 'run-completion-service' });
/**
 * Service for handling workflow run completion logic
 */
export class RunCompletionService {
    constructor(
        private runRepo: typeof workflowRunRepository,
        private valueRepo: typeof stepValueRepository,
        private logicSvc: LogicService,
        private stateService: RunStateService,
        private lifecycleService: RunLifecycleService,
        private metricsService: RunMetricsService
    ) { }
    /**
     * Complete a workflow run (with validation)
     */
    async completeRun(runId: string, run: WorkflowRun, userId: string): Promise<WorkflowRun> {
        const startTime = Date.now();
        if (run.completed) {
            throw new Error("Run is already completed");
        }
        try {
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
                await this.metricsService.captureRunFailed(
                    run.workflowId,
                    run.id,
                    run.workflowVersionId || undefined,
                    Date.now() - startTime,
                    'validation_error',
                    { errors: blockResult.errors }
                );
                throw new Error(errorMsg);
            }
            // Validate using LogicService
            const validation = await this.logicSvc.validateCompletion(run.workflowId, runId);
            if (!validation.valid) {
                const stepTitles = validation.missingStepTitles?.join(', ') || validation.missingSteps.join(', ');
                const errorMsg = `Missing required steps: ${stepTitles}`;
                await this.metricsService.captureRunFailed(
                    run.workflowId,
                    run.id,
                    run.workflowVersionId || undefined,
                    Date.now() - startTime,
                    'missing_required_steps',
                    { errorType: 'missing_required_steps', details: errorMsg }
                );
                throw new Error(errorMsg);
            }
            // Mark run as complete
            const completedRun = await this.stateService.markCompleted(runId);
            // Execute DataVault writebacks (non-blocking)
            await this.lifecycleService.executeWritebacks(runId, run.workflowId, userId);
            // Generate documents (non-blocking)
            await this.lifecycleService.generateDocuments(runId);
            // Capture success metrics
            await this.metricsService.captureRunSucceeded(
                run.workflowId,
                run.id,
                run.workflowVersionId || undefined,
                Date.now() - startTime,
                allValues.length
            );
            return completedRun;
        } catch (error) {
            // Capture failure if not already captured
            if (error instanceof Error && !error.message.includes('Validation failed') && !error.message.includes('Missing required steps')) {
                await this.metricsService.captureRunFailed(
                    run.workflowId,
                    run.id,
                    run.workflowVersionId || undefined,
                    Date.now() - startTime,
                    'unknown_error'
                );
            }
            throw error;
        }
    }
    /**
     * Complete a workflow run without ownership check
     */
    async completeRunNoAuth(runId: string): Promise<WorkflowRun> {
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
        // Mark run as complete
        const completedRun = await this.stateService.markCompleted(runId);
        // Generate documents (non-blocking)
        await this.lifecycleService.generateDocuments(runId);
        return completedRun;
    }
}