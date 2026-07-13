/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- vitest mocks of injected services */
/**
 * RunCompletionService — completion pipeline unit tests.
 *
 * Regression coverage for the July 2026 document-pipeline hardening:
 *  - anonymous/token completions must run DataVault writebacks (previously
 *    only the authenticated path did)
 *  - completion must be idempotent: a concurrent double-complete loses at
 *    markCompleted and must NOT re-trigger writebacks/document generation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { WorkflowRun } from '@shared/schema';

import { RunCompletionService } from '../../../server/services/workflow-runs/RunCompletionService';

import { blockRunner } from '../../../server/services/BlockRunner';

vi.mock('../../../server/services/BlockRunner', () => ({
    blockRunner: {
        runPhase: vi.fn(),
    },
}));

vi.mock('../../../server/repositories', () => ({
    workflowRunRepository: {},
    stepValueRepository: {},
}));

const flushBackground = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
    return {
        id: 'run-1',
        workflowId: 'wf-1',
        workflowVersionId: 'v1',
        completed: false,
        ...overrides,
    } as WorkflowRun;
}

describe('RunCompletionService', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let runRepo: any;
    let valueRepo: any;
    let logicSvc: any;
    let stateService: any;
    let lifecycleService: any;
    let metricsService: any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    let service: RunCompletionService;

    beforeEach(() => {
        vi.clearAllMocks();
        runRepo = { findById: vi.fn() };
        valueRepo = { getRunDataAsJson: vi.fn().mockResolvedValue({ 'step-1': 'value' }) };
        logicSvc = { validateCompletion: vi.fn().mockResolvedValue({ valid: true, missingSteps: [] }) };
        stateService = { markCompleted: vi.fn().mockResolvedValue(makeRun({ completed: true })) };
        lifecycleService = {
            executeWritebacks: vi.fn().mockResolvedValue({ success: true, rowsCreated: 0, errors: [] }),
            generateDocuments: vi.fn().mockResolvedValue({ success: true, documentsGenerated: 1 }),
        };
        metricsService = {
            captureRunSucceeded: vi.fn().mockResolvedValue(undefined),
            captureRunFailed: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, data: {} });

        service = new RunCompletionService(
            runRepo,
            valueRepo,
            logicSvc,
            stateService,
            lifecycleService,
            metricsService
        );
    });

    it('completes an authenticated run and kicks off writebacks + documents', async () => {
        const run = makeRun();
        const result = await service.completeRun('run-1', run, 'user-1');

        expect(stateService.markCompleted).toHaveBeenCalledWith('run-1');
        expect(result.completed).toBe(true);
        expect(metricsService.captureRunSucceeded).toHaveBeenCalled();

        await flushBackground();
        expect(lifecycleService.executeWritebacks).toHaveBeenCalledWith('run-1', 'wf-1', 'user-1');
        expect(lifecycleService.generateDocuments).toHaveBeenCalledWith('run-1');
    });

    it('completeRunNoAuth runs writebacks too (anonymous runs previously skipped them)', async () => {
        runRepo.findById.mockResolvedValue(makeRun());

        await service.completeRunNoAuth('run-1');

        await flushBackground();
        expect(lifecycleService.executeWritebacks).toHaveBeenCalledWith('run-1', 'wf-1', undefined);
        expect(lifecycleService.generateDocuments).toHaveBeenCalledWith('run-1');
    });

    it('rejects an already-completed run without re-triggering side effects', async () => {
        const run = makeRun({ completed: true });

        await expect(service.completeRun('run-1', run, 'user-1')).rejects.toThrow('Run is already completed');

        await flushBackground();
        expect(stateService.markCompleted).not.toHaveBeenCalled();
        expect(lifecycleService.generateDocuments).not.toHaveBeenCalled();
        expect(lifecycleService.executeWritebacks).not.toHaveBeenCalled();
    });

    it('propagates a lost markCompleted race without generating documents', async () => {
        // Simulates the conditional UPDATE ... WHERE completed = false losing
        // to a concurrent completion
        stateService.markCompleted.mockRejectedValue(new Error('Run is already completed'));

        await expect(service.completeRun('run-1', makeRun(), 'user-1')).rejects.toThrow('Run is already completed');

        await flushBackground();
        expect(lifecycleService.generateDocuments).not.toHaveBeenCalled();
        expect(lifecycleService.executeWritebacks).not.toHaveBeenCalled();
    });

    it('rejects completion when required steps are missing', async () => {
        logicSvc.validateCompletion.mockResolvedValue({
            valid: false,
            missingSteps: ['step-2'],
            missingStepTitles: ['Client name'],
        });

        await expect(service.completeRun('run-1', makeRun(), 'user-1')).rejects.toThrow(
            'Missing required steps: Client name'
        );
        expect(stateService.markCompleted).not.toHaveBeenCalled();
        expect(metricsService.captureRunFailed).toHaveBeenCalledWith(
            'wf-1', 'run-1', 'v1', expect.any(Number), 'missing_required_steps', expect.anything()
        );
    });

    it('rejects completion when onRunComplete blocks fail validation', async () => {
        vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: false, errors: ['amount must be positive'], data: {} });

        await expect(service.completeRun('run-1', makeRun(), 'user-1')).rejects.toThrow(
            'Validation failed: amount must be positive'
        );
        expect(stateService.markCompleted).not.toHaveBeenCalled();
    });
});
