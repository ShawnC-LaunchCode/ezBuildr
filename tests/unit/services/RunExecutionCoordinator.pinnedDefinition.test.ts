/**
 * RVP-3 — RunExecutionCoordinator decides from the run's pinned definition.
 *
 * The point of the ticket (AC2): once page steps come from the run's pinned
 * version rather than the live `steps` table, a question the author deleted
 * from the live workflow *after* the respondent started is still part of that
 * respondent's interview — so their answer must be accepted and saved, not
 * dropped. RUN2-15's drop branch becomes unreachable for a pinned run and
 * survives only as the fallback for pre-existing versionless runs.
 */
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';

import { logger } from '../../../server/logger';
import { blockRunner } from '../../../server/services/BlockRunner';
import { logicService } from '../../../server/services/LogicService';
import { RunExecutionCoordinator, type ExecutionContext } from '../../../server/services/runs/RunExecutionCoordinator';
import { type RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';
import type { RunDefinition } from '../../../server/services/workflow-runs/RunDefinitionProvider';

vi.mock('../../../server/services/scripting/ScriptEngine', () => ({
    scriptEngine: { execute: vi.fn() }
}));
vi.mock('../../../server/services/runs/RunPersistenceWriter', () => {
    const mockPersistence = {
        saveStepValue: vi.fn().mockResolvedValue(undefined),
        bulkSaveValues: vi.fn().mockResolvedValue(undefined),
        getRunValues: vi.fn(),
        updateRun: vi.fn().mockResolvedValue(undefined)
    };
    return {
        RunPersistenceWriter: vi.fn().mockImplementation(() => mockPersistence),
        runPersistenceWriter: mockPersistence
    };
});
vi.mock('../../../server/services/LogicService', () => ({ logicService: {} }));
vi.mock('../../../server/services/BlockRunner', () => ({
    blockRunner: { runPhase: vi.fn() }
}));
vi.mock('../../../server/repositories', () => ({
    stepRepository: { findByPageId: vi.fn(), findByPageIds: vi.fn(), findById: vi.fn() },
    stepValueRepository: { upsert: vi.fn(), findByRunId: vi.fn() },
    workflowRunRepository: { findById: vi.fn() },
    workflowVersionRepository: { findById: vi.fn() },
    pageRepository: { findById: vi.fn(), findByWorkflowId: vi.fn() },
    workflowRepository: {},
    logicRuleRepository: { findByWorkflowId: vi.fn() }
}));

const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

/** A pinned definition holding one page with two questions. */
function pinnedDefinition(): RunDefinition {
    const step = (id: string, pageId: string, title: string) => ({
        id,
        pageId,
        workflowId: 'wf-1',
        type: 'short_text',
        title,
        description: null,
        required: false,
        alias: null,
        order: 0,
        isVirtual: false,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    return {
        pages: [
            { id: 'page-1', workflowId: 'wf-1', title: 'Page 1', description: null, order: 0, createdAt: new Date() },
            { id: 'page-2', workflowId: 'wf-1', title: 'Page 2', description: null, order: 1, createdAt: new Date() },
        ],
        // 'since-deleted' exists in the pinned graph but no longer in the live
        // workflow — the respondent was shown it, so it must still be accepted.
        steps: [
            step('current-step', 'page-1', 'Current Step'),
            step('since-deleted', 'page-1', 'Deleted Since Publish'),
            step('other-page-step', 'page-2', 'Other Page Step'),
        ],
        logicRules: [],
        source: 'version',
    } as unknown as RunDefinition;
}

describe('RunExecutionCoordinator submits against the pinned definition (RVP-3)', () => {
    let coordinator: RunExecutionCoordinator;
    let mockRunPersistence: Mocked<RunPersistenceWriter>;
    let getDefinition: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        const persistenceModule = await import('../../../server/services/runs/RunPersistenceWriter');
        mockRunPersistence = persistenceModule.runPersistenceWriter as unknown as Mocked<RunPersistenceWriter>;
        mockRunPersistence.getRunValues.mockResolvedValue({
            'current-step': 'ok',
            'since-deleted': 'still mine',
        });

        const { workflowRunRepository } = await import('../../../server/repositories');
        vi.mocked(workflowRunRepository.findById).mockResolvedValue({
            id: 'run-1', workflowId: 'wf-1', workflowVersionId: VERSION_ID,
        } as never);

        vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true });

        getDefinition = vi.fn().mockResolvedValue(pinnedDefinition());
        coordinator = new RunExecutionCoordinator(
            mockRunPersistence,
            logicService as unknown as typeof logicService,
            {} as never,
            workflowRunRepository as never,
            { getDefinition } as never,
        );
    });

    it('accepts an answer to a question deleted from the live workflow after the run started (AC2)', async () => {
        const result = await coordinator.submitPage(context, 'page-1', [
            { stepId: 'current-step', value: 'ok' },
            { stepId: 'since-deleted', value: 'still mine' },
        ]);

        expect(result.success).toBe(true);
    });

    it('persists that answer instead of dropping it (AC2)', async () => {
        await coordinator.submitPage(context, 'page-1', [
            { stepId: 'current-step', value: 'ok' },
            { stepId: 'since-deleted', value: 'still mine' },
        ]);

        expect(mockRunPersistence.bulkSaveValues).toHaveBeenCalledWith(
            'run-1',
            [
                { stepId: 'current-step', value: 'ok' },
                { stepId: 'since-deleted', value: 'still mine' },
            ],
            'wf-1'
        );
    });

    it('logs no dropped-value warning for a pinned run (AC2)', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
        try {
            await coordinator.submitPage(context, 'page-1', [
                { stepId: 'current-step', value: 'ok' },
                { stepId: 'since-deleted', value: 'still mine' },
            ]);

            const droppedWarnings = warnSpy.mock.calls.filter(
                ([payload]) => typeof payload === 'object' && payload !== null && 'droppedStepIds' in payload
            );
            expect(droppedWarnings).toHaveLength(0);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('still rejects a value belonging to another page of the same workflow (AC3)', async () => {
        await expect(coordinator.submitPage(context, 'page-1', [
            { stepId: 'current-step', value: 'ok' },
            { stepId: 'other-page-step', value: 'not ok' },
        ])).rejects.toMatchObject({
            statusCode: 400,
            details: { stepIds: ['other-page-step'] },
        });

        expect(mockRunPersistence.bulkSaveValues).not.toHaveBeenCalled();
    });

    it('resolves the definition through the provider rather than the live steps table (AC1)', async () => {
        await coordinator.submitPage(context, 'page-1', [{ stepId: 'current-step', value: 'ok' }]);

        expect(getDefinition).toHaveBeenCalledTimes(1);
        const { stepRepository } = await import('../../../server/repositories');
        expect(stepRepository.findByPageId).not.toHaveBeenCalled();
        expect(stepRepository.findByPageIds).not.toHaveBeenCalled();
    });
});
