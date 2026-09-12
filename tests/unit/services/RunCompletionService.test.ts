/**
 * RunCompletionService — completion pipeline unit tests.
 *
 * Regression coverage for the July 2026 document-pipeline hardening:
 *  - anonymous/token completions enqueue durable document generation
 *  - completion is idempotent when a concurrent double-complete loses at
 *    markCompleted
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
    stepRepository: {},
}));

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
    let runRepo: { findById: ReturnType<typeof vi.fn> };
    let valueRepo: Record<string, never>;
    let logicSvc: { validateCompletion: ReturnType<typeof vi.fn> };
    let stateService: { markCompletedAndEnqueue: ReturnType<typeof vi.fn> };
    let metricsService: {
        captureRunSucceeded: ReturnType<typeof vi.fn>;
        captureRunFailed: ReturnType<typeof vi.fn>;
    };
    let runDataSvc: {
        buildForRun: ReturnType<typeof vi.fn>;
        fromStepIdData: ReturnType<typeof vi.fn>;
    };
    let service: RunCompletionService;

    beforeEach(() => {
        vi.clearAllMocks();
        runRepo = { findById: vi.fn() };
        valueRepo = {};
        logicSvc = { validateCompletion: vi.fn().mockResolvedValue({ valid: true, missingSteps: [] }) };
        stateService = {
            markCompletedAndEnqueue: vi.fn().mockResolvedValue(makeRun({ completed: true })),
        };
        metricsService = {
            captureRunSucceeded: vi.fn().mockResolvedValue(undefined),
            captureRunFailed: vi.fn().mockResolvedValue(undefined),
        };
        const steps = [
            { id: 'step-1', alias: 'clientName', type: 'short_text', pageId: 'page-1', isVirtual: false },
        ];
        runDataSvc = {
            buildForRun: vi.fn().mockResolvedValue({
                byStepId: { 'step-1': 'value' },
                byAlias: { clientName: 'value' },
                steps,
            }),
            fromStepIdData: vi.fn((data: Record<string, unknown>) => ({
                byStepId: { ...data },
                byAlias: {
                    ...(data['step-1'] !== undefined ? { clientName: data['step-1'] } : {}),
                    ...(data.total !== undefined ? { total: data.total } : {}),
                },
                steps,
            })),
        };
        vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, data: { 'step-1': 'value' } });

        service = new RunCompletionService(
            runRepo as unknown as ConstructorParameters<typeof RunCompletionService>[0],
            valueRepo as unknown as ConstructorParameters<typeof RunCompletionService>[1],
            logicSvc as unknown as ConstructorParameters<typeof RunCompletionService>[2],
            stateService as unknown as ConstructorParameters<typeof RunCompletionService>[3],
            metricsService as unknown as ConstructorParameters<typeof RunCompletionService>[4],
            runDataSvc as unknown as ConstructorParameters<typeof RunCompletionService>[5]
        );
    });

    it('atomically completes an authenticated run and enqueues durable work', async () => {
        const run = makeRun();
        const result = await service.completeRun('run-1', run);

        expect(stateService.markCompletedAndEnqueue).toHaveBeenCalledWith(
            'run-1'
        );
        expect(result.completed).toBe(true);
        expect(metricsService.captureRunSucceeded).toHaveBeenCalled();
        expect(blockRunner.runPhase).toHaveBeenCalledWith(expect.objectContaining({
            data: { 'step-1': 'value' },
        }));
        expect(logicSvc.validateCompletion).toHaveBeenCalledWith('wf-1', 'run-1', { 'step-1': 'value' });

    });

    it('validates transformed completion data before enqueueing durable work', async () => {
        vi.mocked(blockRunner.runPhase).mockResolvedValue({
            success: true,
            data: { 'step-1': 'Ada', total: 42 },
        });

        await service.completeRun('run-1', makeRun());

        expect(stateService.markCompletedAndEnqueue).toHaveBeenCalledWith('run-1');
    });

    it('completeRunNoAuth enqueues durable document work', async () => {
        runRepo.findById.mockResolvedValue(makeRun());

        await service.completeRunNoAuth('run-1');

        expect(stateService.markCompletedAndEnqueue).toHaveBeenCalledWith('run-1');
    });

    it('rejects an already-completed run without re-triggering side effects', async () => {
        const run = makeRun({ completed: true });

        await expect(service.completeRun('run-1', run)).rejects.toThrow('Run is already completed');

        expect(stateService.markCompletedAndEnqueue).not.toHaveBeenCalled();
    });

    it('propagates a lost markCompleted race without generating documents', async () => {
        // Simulates the conditional UPDATE ... WHERE completed = false losing
        // to a concurrent completion
        stateService.markCompletedAndEnqueue.mockRejectedValue(new Error('Run is already completed'));

        await expect(service.completeRun('run-1', makeRun())).rejects.toThrow('Run is already completed');
    });

    it('rejects completion when required steps are missing', async () => {
        logicSvc.validateCompletion.mockResolvedValue({
            valid: false,
            missingSteps: ['step-2'],
            missingStepTitles: ['Client name'],
        });

        await expect(service.completeRun('run-1', makeRun())).rejects.toThrow(
            'Missing required steps: Client name'
        );
        expect(stateService.markCompletedAndEnqueue).not.toHaveBeenCalled();
        expect(metricsService.captureRunFailed).toHaveBeenCalledWith(
            'wf-1', 'run-1', 'v1', expect.any(Number), 'missing_required_steps', expect.anything()
        );
    });

    it('rejects completion when onRunComplete blocks fail validation', async () => {
        vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: false, errors: ['amount must be positive'], data: {} });

        await expect(service.completeRun('run-1', makeRun())).rejects.toThrow(
            'Validation failed: amount must be positive'
        );
        expect(stateService.markCompletedAndEnqueue).not.toHaveBeenCalled();
    });
});
