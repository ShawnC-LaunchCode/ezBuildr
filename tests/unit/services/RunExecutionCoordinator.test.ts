import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';

import type { Step, Page, LogicRule } from '@shared/schema';

import { logger } from '../../../server/logger';
import { buildTestWhen } from '../../helpers/conditionFixtures';
import { stepRepository, pageRepository, sectionRepository, workflowRepository, logicRuleRepository, workflowRunRepository } from '../../../server/repositories';
import { blockRunner } from '../../../server/services/BlockRunner';
import { codeBlockService } from '../../../server/services/codeBlocks/CodeBlockService';
import { logicService, type NavigationResult } from '../../../server/services/LogicService';
import { RunExecutionCoordinator, type ExecutionContext } from '../../../server/services/runs/RunExecutionCoordinator';
import { type RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';

// RLS-5: the run/document path now opens tenant-scoped transactions via
// `withCurrentTenant` (server/utils/rlsContext.ts), which calls the real
// `db.transaction`. This suite calls those services directly rather than
// through HTTP, so `db` must be mocked or the chain throws "Database not
// initialized". The stub `tx` needs a working `execute` — that is what
// `applyTenantToTransaction` uses to set the GUC.
vi.mock("../../../server/db", () => {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  return {
    db: {
      ...tx,
      transaction: vi.fn(async (callback: (t: unknown) => Promise<unknown>) => callback(tx)),
    },
    getDb: vi.fn(() => ({ ...tx })),
    initializeDatabase: vi.fn(),
  };
});

// Mock dependencies
vi.mock('../../../server/services/codeBlocks/CodeBlockService', () => ({
    codeBlockService: {
        execute: vi.fn(),
        // CB-3: the coordinator now sweeps every eligible block through
        // evaluateAll instead of executing only the submitted page's.
        evaluateAll: vi.fn().mockResolvedValue([]),
    },
}));
// Mock PersistenceWriter
vi.mock('../../../server/services/runs/RunPersistenceWriter', () => {
    const mockPersistence = {
        saveStepValue: vi.fn().mockResolvedValue(undefined),
        bulkSaveValues: vi.fn().mockResolvedValue(undefined),
        getRunValues: vi.fn(),
        advanceRun: vi.fn().mockResolvedValue(undefined),
    };
    return {
        RunPersistenceWriter: vi.fn().mockImplementation(() => mockPersistence),
        runPersistenceWriter: mockPersistence
    };
});
// Mock other services
vi.mock('../../../server/services/LogicService', () => ({
    logicService: {}
}));
vi.mock('../../../server/services/BlockRunner', () => ({
    blockRunner: {
        runPhase: vi.fn()
    }
}));
vi.mock('../../../server/repositories', () => ({
    stepRepository: {
        findByPageId: vi.fn(),
        findByPageIds: vi.fn(),
        findById: vi.fn()
    },
    stepValueRepository: {
        upsert: vi.fn(), // still mock for compilation if needed
        findByRunId: vi.fn()
    },
    // RVP-3: `RunExecutionCoordinator` now resolves the run first (via
    // `workflowRunRepository`) and sources pages/steps/logic-rules from
    // `RunDefinitionProvider` rather than reading `stepRepository`/
    // `pageRepository` directly. The provider's default singleton reads
    // from this same mocked module, so a versionless run here takes its
    // `source: 'live'` branch and lands on exactly the `findByWorkflowId`/
    // `findByPageIds` mocks below -- keeping most of this file's existing
    // per-test setups valid. Pinned-run (`source: 'version'`) behaviour is
    // covered separately in RunExecutionCoordinator.pinnedDefinition.test.ts.
    workflowRunRepository: {
        findById: vi.fn().mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null })
    },
    pageRepository: {
        findById: vi.fn(),
        findByWorkflowId: vi.fn()
    },
    sectionRepository: {
        findByWorkflowId: vi.fn().mockResolvedValue([])
    },
    workflowRepository: {},
    logicRuleRepository: {
        findByWorkflowId: vi.fn()
    },
    workflowVersionRepository: {
        findById: vi.fn()
    }
}));

describe('RunExecutionCoordinator - Code Block Execution', () => {
    let coordinator: RunExecutionCoordinator;
    let mockStepRepo: Mocked<typeof stepRepository>;
    let mockPageRepo: Mocked<typeof pageRepository>;
    let mockSectionRepo: Mocked<typeof sectionRepository>;
    let mockWorkflowRepo: Mocked<typeof workflowRepository>;
    let mockLogicRuleRepo: Mocked<typeof logicRuleRepository>;
    let mockRunRepo: Mocked<typeof workflowRunRepository>;
    let mockRunPersistence: Mocked<RunPersistenceWriter>;

    beforeEach(async () => {
        vi.clearAllMocks();

        const persistenceModule = await import('../../../server/services/runs/RunPersistenceWriter');
        mockRunPersistence = persistenceModule.runPersistenceWriter as unknown as Mocked<RunPersistenceWriter>;

        mockStepRepo = stepRepository as unknown as Mocked<typeof stepRepository>;
        mockPageRepo = pageRepository as unknown as Mocked<typeof pageRepository>;
        mockSectionRepo = sectionRepository as unknown as Mocked<typeof sectionRepository>;
        mockWorkflowRepo = workflowRepository as unknown as Mocked<typeof workflowRepository>;
        mockLogicRuleRepo = logicRuleRepository as unknown as Mocked<typeof logicRuleRepository>;
        mockRunRepo = workflowRunRepository as unknown as Mocked<typeof workflowRunRepository>;
        // vi.clearAllMocks() clears call history but not the resolved value
        // baked into the module factory above -- restate it explicitly so
        // this default survives even if a test overrides and doesn't reset.
        mockRunRepo.findById.mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null } as never);
        mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
        // Same reason as above: clearAllMocks drops the factory's default, and
        // every submitPage/next test now awaits this sweep (CB-3).
        vi.mocked(codeBlockService.evaluateAll).mockResolvedValue([]);

        coordinator = new RunExecutionCoordinator(
            mockRunPersistence,
            logicService as unknown as typeof logicService,
            mockWorkflowRepo,
            mockRunRepo
            // definitionProvider defaults to the real `runDefinitionProvider`
            // singleton, which reads from the mocked repositories module above.
        );
    });
    const mockJsStep = {
        id: 'step-js-1',
        pageId: 'page-1',
        type: 'js_question',
        title: 'Calculate Total',
        config: {
            code: 'emit({ result: input.a + input.b });',
            inputs: [{ key: 'a', required: true }, { key: 'b', required: true }],
            outputs: [{ key: 'result', type: 'number' }],
            timeoutMs: 1000
        },
        alias: 'total'
    };
    describe('CB-3: evaluateAll wiring and error routing', () => {
        beforeEach(() => {
            mockPageRepo.findByWorkflowId.mockResolvedValue([{ id: 'page-1', workflowId: 'wf-1', order: 0 }] as never);
            mockStepRepo.findByPageIds.mockResolvedValue([mockJsStep] as never);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({});
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true } as never);
        });
        it('sweeps every eligible Code Block through evaluateAll on submit, not only the submitted page', async () => {
            // CB-3: `everySubmit` means the whole run is reconsidered, which is what
            // lets a block on page 1 fire once page 2 supplies its last input. The
            // old behavior filtered to `step.pageId === pageId` and could not.
            vi.mocked(codeBlockService.evaluateAll).mockResolvedValue([]);
            const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

            await coordinator.submitPage(context, 'page-1', []);

            expect(codeBlockService.evaluateAll).toHaveBeenCalledWith(
                'run-1',
                'wf-1',
                'submit',
                expect.any(Object)
            );
        });
        it('fails the submit when a Code Block ON THIS PAGE errors', async () => {
            vi.mocked(codeBlockService.evaluateAll).mockResolvedValue([{
                success: false,
                error: 'Code Block "Calculate Total" failed: SyntaxError: Unexpected token',
                state: { stepId: 'step-js-1' } as never,
            }]);
            const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

            const result = await coordinator.submitPage(context, 'page-1', []);

            expect(result.success).toBe(false);
            expect(result.errors).toContainEqual(expect.stringContaining('SyntaxError'));
        });
        it('does NOT fail the submit when the erroring Code Block belongs to another page', async () => {
            // Decisions 5 + the CB-3 ruling: an error nulls that block's outputs and
            // records `status: 'error'`; it does not block the respondent's
            // navigation. Otherwise one broken block anywhere in a workflow makes
            // every later page un-submittable, which is strictly worse than a blank.
            vi.mocked(codeBlockService.evaluateAll).mockResolvedValue([{
                success: false,
                error: 'Code Block on page 9 failed: TypeError',
                state: { stepId: 'step-on-another-page' } as never,
            }]);
            const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

            const result = await coordinator.submitPage(context, 'page-1', []);

            expect(result.success).toBe(true);
            expect(result.errors).toBeUndefined();
        });
    });
    it('rejects page submits containing values from another page before writing', async () => {
        // The other-page step must exist SOMEWHERE on this workflow for this
        // to be the mass-assignment case rather than the edited-mid-run case
        // that RUN2-15 drops.
        mockPageRepo.findByWorkflowId.mockResolvedValue([
            { id: 'page-1', workflowId: 'wf-1', order: 0 } as unknown as Page,
            { id: 'page-2', workflowId: 'wf-1', order: 1 } as unknown as Page,
        ]);
        mockStepRepo.findByPageIds.mockResolvedValue([
            { id: 'current-step', pageId: 'page-1', type: 'short_text', title: 'Current Step' } as unknown as Step,
            { id: 'other-page-step', pageId: 'page-2', type: 'short_text', title: 'Other Step' } as unknown as Step,
        ]);
        mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        await expect(coordinator.submitPage(context, 'page-1', [
            { stepId: 'current-step', value: 'ok' },
            { stepId: 'other-page-step', value: 'not ok' },
        ])).rejects.toMatchObject({
            statusCode: 400,
            details: { stepIds: ['other-page-step'] },
        });

        expect(mockRunPersistence.bulkSaveValues).not.toHaveBeenCalled();
    });

    describe('submitPage with a workflow edited mid-run (RUN2-15)', () => {
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        beforeEach(() => {
            mockPageRepo.findByWorkflowId.mockResolvedValue([
                { id: 'page-1', workflowId: 'wf-1', order: 0 } as unknown as Page,
            ]);
            // The workflow no longer has 'deleted-step' anywhere: the author
            // removed that question after the respondent's runtime was pinned.
            mockStepRepo.findByPageIds.mockResolvedValue([
                { id: 'current-step', pageId: 'page-1', type: 'short_text', title: 'Current Step' } as unknown as Step,
            ]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            // Needed now that RVP-3 gives the fixture a real `pageId`: the
            // step is genuinely visible, so `validatePage` actually reads the
            // run's data map instead of skipping every step. Before RVP-3 these
            // fixtures omitted `pageId`, which made the step invisible and
            // meant validation was never exercised at all.
            mockRunPersistence.getRunValues.mockResolvedValue({ 'current-step': 'ok' });
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true });
        });

        it('drops values for steps that no longer exist and lets the respondent continue (AC1)', async () => {
            const result = await coordinator.submitPage(context, 'page-1', [
                { stepId: 'current-step', value: 'ok' },
                { stepId: 'deleted-step', value: 'orphaned' },
            ]);

            expect(result.success).toBe(true);
        });

        it('persists only the surviving values (AC3)', async () => {
            await coordinator.submitPage(context, 'page-1', [
                { stepId: 'current-step', value: 'ok' },
                { stepId: 'deleted-step', value: 'orphaned' },
            ]);

            expect(mockRunPersistence.bulkSaveValues).toHaveBeenCalledWith(
                'run-1',
                [{ stepId: 'current-step', value: 'ok' }],
                'wf-1'
            );
        });

        it('logs the dropped ids once (AC1)', async () => {
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
            try {
                await coordinator.submitPage(context, 'page-1', [
                    { stepId: 'current-step', value: 'ok' },
                    { stepId: 'deleted-step', value: 'orphaned' },
                ]);

                // RLS-5: count the DROPPED-IDS warning specifically rather than
                // every warn. `withCurrentTenant` also warns while RLS is
                // unenforced ("no tenant in async context"), and a bare
                // toHaveBeenCalledTimes(1) counted that too — which made this
                // assert "nothing else in the stack ever warns", a claim it was
                // never meant to make. AC1 is that the drop is logged ONCE.
                const dropWarnings = warnSpy.mock.calls.filter(
                    (call) => typeof call[0] === 'object' && call[0] !== null && 'droppedStepIds' in call[0]
                );
                expect(dropWarnings).toHaveLength(1);
                expect(dropWarnings[0][0]).toMatchObject({
                    runId: 'run-1',
                    pageId: 'page-1',
                    droppedStepIds: ['deleted-step'],
                });
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('does not touch the normal path when every id is in the page (AC3)', async () => {
            await coordinator.submitPage(context, 'page-1', [
                { stepId: 'current-step', value: 'ok' },
            ]);

            expect(mockRunPersistence.bulkSaveValues).toHaveBeenCalledWith(
                'run-1',
                [{ stepId: 'current-step', value: 'ok' }],
                'wf-1'
            );
        });
    });

    describe('submitPage visibility (RUN2-1: shared evaluateWorkflowVisibility engine)', () => {
        const page: Page = { id: 'page-1', workflowId: 'wf-1', order: 0 } as unknown as Page;
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        beforeEach(() => {
            mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true });
        });

        it('excludes a required step hidden by a "hide" logic rule from validation (AC2)', async () => {
            const requiredStep = {
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                pageId: 'page-1',
                visibleIf: null,
            } as unknown as Step;
            mockStepRepo.findByPageIds.mockResolvedValue([requiredStep]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([{
                targetType: 'step',
                targetStepId: 'req-step',
                action: 'hide',
                conditionStepId: 'trigger-step',
                when: buildTestWhen('trigger-step', 'equals', 'yes'),
            } as unknown as LogicRule]);
            mockRunPersistence.getRunValues.mockResolvedValue({ 'trigger-step': 'yes' });

            const result = await coordinator.submitPage(context, 'page-1', []);

            expect(result).toEqual({ success: true, errors: undefined });
        });

        it('treats a step with a malformed visibleIf as hidden (fail-closed) and does not block submit (AC3)', async () => {
            const requiredStep = {
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                pageId: 'page-1',
                // Malformed visibleIf: not a valid ConditionExpression shape.
                // evaluateWorkflowVisibility must fail closed (treat as hidden).
                visibleIf: 'not-a-valid-condition-expression',
            } as unknown as Step;
            mockStepRepo.findByPageIds.mockResolvedValue([requiredStep]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({});

            const result = await coordinator.submitPage(context, 'page-1', []);

            expect(result).toEqual({ success: true, errors: undefined });
        });

        it('still blocks submit for a required, visible step with no value (AC4, unchanged behavior)', async () => {
            const requiredStep = {
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                pageId: 'page-1',
                visibleIf: null,
            } as unknown as Step;
            mockStepRepo.findByPageIds.mockResolvedValue([requiredStep]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({});

            const result = await coordinator.submitPage(context, 'page-1', []);

            expect(result).toEqual({
                success: false,
                errors: ['Required Step: Required Step is required'],
            });
            expect(blockRunner.runPhase).not.toHaveBeenCalled();
        });

        it('does not validate a required step whose parent Section is hidden', async () => {
            const sectionPage = { ...page, sectionId: 'section-1' } as Page;
            mockPageRepo.findByWorkflowId.mockResolvedValue([sectionPage]);
            mockSectionRepo.findByWorkflowId.mockResolvedValue([{
                id: 'section-1',
                workflowId: 'wf-1',
                title: 'Conditional',
                visibleIf: buildTestWhen('controller', 'is_true'),
            }] as never);
            mockStepRepo.findByPageIds.mockResolvedValue([{
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                pageId: 'page-1',
                visibleIf: null,
            }] as never);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({ controller: false });

            await expect(coordinator.submitPage(context, 'page-1', [])).resolves.toEqual({ success: true, errors: undefined });
        });
    });

    describe('submitPage validates supported uploads and skips unknown required steps', () => {
        const page: Page = { id: 'page-1', workflowId: 'wf-1', order: 0 } as unknown as Page;
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        beforeEach(() => {
            mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({});
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true });
        });

        it('blocks a required, visible file_upload with no value', async () => {
                const uploadStep = {
                    id: 'req-step',
                    type: 'file_upload',
                    title: 'Supporting File',
                    required: true,
                    pageId: 'page-1',
                    visibleIf: null,
                } as unknown as Step;
                mockStepRepo.findByPageIds.mockResolvedValue([uploadStep]);

                const result = await coordinator.submitPage(context, 'page-1', []);

                expect(result).toEqual({
                    success: false,
                    errors: ['Supporting File: Supporting File is required'],
                });
        });

        it('submits successfully for a required step of an unrecognized type', async () => {
            const unknownStep = {
                id: 'req-step',
                type: 'some_future_type',
                title: 'Unknown Step',
                required: true,
                pageId: 'page-1',
                visibleIf: null,
            } as unknown as Step;
            mockStepRepo.findByPageIds.mockResolvedValue([unknownStep]);

            const result = await coordinator.submitPage(context, 'page-1', []);

            expect(result).toEqual({ success: true, errors: undefined });
        });
    });

    describe('next - branch block nextPageId validation (RUN2-12)', () => {
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };
        let mockEvaluateNavigation: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockRunPersistence.getRunValues.mockResolvedValue({});
            mockStepRepo.findByPageIds.mockResolvedValue([]); // no JS questions; alias map source
            mockPageRepo.findByWorkflowId.mockResolvedValue([]); // definition source
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

            mockEvaluateNavigation = vi.fn();
            (logicService as unknown as { evaluateNavigation: typeof mockEvaluateNavigation })
                .evaluateNavigation = mockEvaluateNavigation;
        });

        it('ignores a branch block nextPageId that is not a visible page, falls back to computed navigation, and logs a warning (AC1)', async () => {
            const computed: NavigationResult = {
                visiblePages: ['page-a', 'page-b'],
                visibleSteps: ['step-a'],
                requiredSteps: ['step-a'],
                nextPageId: 'page-b',
                currentProgress: 50,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, nextPageId: 'stale-page-id' });
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);

            const result = await coordinator.next(context, 'page-a');

            expect(result).toEqual(computed);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({ invalidNextPageId: 'stale-page-id', pageId: 'page-a' }),
                expect.stringContaining('not visible in this workflow')
            );
            expect(mockRunPersistence.advanceRun).toHaveBeenCalledWith('run-1', 'page-b', 50);

            warnSpy.mockRestore();
        });

        it('includes the offending block id in the warning when BlockRunner supplies nextPageBlockId (RUN2-21)', async () => {
            const computed: NavigationResult = {
                visiblePages: ['page-a', 'page-b'],
                visibleSteps: ['step-a'],
                requiredSteps: ['step-a'],
                nextPageId: 'page-b',
                currentProgress: 50,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({
                success: true,
                nextPageId: 'stale-page-id',
                nextPageBlockId: 'branch-block-42',
            });
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);

            const result = await coordinator.next(context, 'page-a');

            expect(result).toEqual(computed);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    invalidNextPageId: 'stale-page-id',
                    pageId: 'page-a',
                    blockId: 'branch-block-42',
                }),
                expect.stringContaining('not visible in this workflow')
            );

            warnSpy.mockRestore();
        });

        it('honors a branch block nextPageId that is a visible page of this workflow (AC2)', async () => {
            const computed: NavigationResult = {
                visiblePages: ['page-a', 'page-b', 'page-c'],
                visibleSteps: ['step-a'],
                requiredSteps: ['step-a'],
                nextPageId: 'page-b',
                currentProgress: 33,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, nextPageId: 'page-c' });

            const result = await coordinator.next(context, 'page-a');

            expect(result).toEqual({ ...computed, nextPageId: 'page-c' });
        });

        it('populates visiblePages/visibleSteps/requiredSteps/currentProgress from computed navigation when a branch overrides (AC3)', async () => {
            const computed: NavigationResult = {
                visiblePages: ['page-a', 'page-c'],
                visibleSteps: ['step-a', 'step-c'],
                requiredSteps: ['step-c'],
                nextPageId: 'page-c',
                currentProgress: 75,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, nextPageId: 'page-c' });

            const result = await coordinator.next(context, 'page-a');

            expect(result.visiblePages).toEqual(computed.visiblePages);
            expect(result.visibleSteps).toEqual(computed.visibleSteps);
            expect(result.requiredSteps).toEqual(computed.requiredSteps);
            expect(result.currentProgress).toBe(computed.currentProgress);
        });

        it('populates visiblePages/visibleSteps/requiredSteps/currentProgress from computed navigation in the normal (no branch) path (AC3)', async () => {
            const computed: NavigationResult = {
                visiblePages: ['page-a', 'page-b'],
                visibleSteps: ['step-a', 'step-b'],
                requiredSteps: ['step-b'],
                nextPageId: 'page-b',
                currentProgress: 50,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true }); // no branch decision

            const result = await coordinator.next(context, 'page-a');

            expect(result).toEqual(computed);
        });
    });
});
