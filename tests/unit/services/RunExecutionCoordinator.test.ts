import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';

import { JsQuestionConfig } from '@shared/types/steps';
import type { Step, Section, LogicRule } from '@shared/schema';

import { logger } from '../../../server/logger';
import { buildTestWhen } from '../../helpers/conditionFixtures';
import { stepRepository, sectionRepository, workflowRepository, logicRuleRepository, workflowRunRepository } from '../../../server/repositories';
import { blockRunner } from '../../../server/services/BlockRunner';
import { logicService, type NavigationResult } from '../../../server/services/LogicService';
import { RunExecutionCoordinator, type ExecutionContext } from '../../../server/services/runs/RunExecutionCoordinator';
import { type RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';
import { scriptEngine } from '../../../server/services/scripting/ScriptEngine';
import type { RunDefinition, RunStep } from '../../../server/services/workflow-runs/RunDefinitionProvider';

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
vi.mock('../../../server/services/scripting/ScriptEngine', () => ({
    scriptEngine: {
        execute: vi.fn()
    }
}));
// Mock PersistenceWriter
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
        findBySectionId: vi.fn(),
        findBySectionIds: vi.fn(),
        findById: vi.fn()
    },
    stepValueRepository: {
        upsert: vi.fn(), // still mock for compilation if needed
        findByRunId: vi.fn()
    },
    // RVP-3: `RunExecutionCoordinator` now resolves the run first (via
    // `workflowRunRepository`) and sources sections/steps/logic-rules from
    // `RunDefinitionProvider` rather than reading `stepRepository`/
    // `sectionRepository` directly. The provider's default singleton reads
    // from this same mocked module, so a versionless run here takes its
    // `source: 'live'` branch and lands on exactly the `findByWorkflowId`/
    // `findBySectionIds` mocks below -- keeping most of this file's existing
    // per-test setups valid. Pinned-run (`source: 'version'`) behaviour is
    // covered separately in RunExecutionCoordinator.pinnedDefinition.test.ts.
    workflowRunRepository: {
        findById: vi.fn().mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null })
    },
    sectionRepository: {
        findById: vi.fn(),
        findByWorkflowId: vi.fn()
    },
    workflowRepository: {},
    logicRuleRepository: {
        findByWorkflowId: vi.fn()
    },
    workflowVersionRepository: {
        findById: vi.fn()
    }
}));

interface TestCoordinator {
    executeJsQuestions(
        sectionId: string,
        dataMap: Record<string, unknown>,
        context: ExecutionContext,
        definition: RunDefinition,
        aliasMap?: Record<string, string>
    ): Promise<{ success: boolean; errors?: string[] }>;
}

/** Builds a minimal `RunDefinition` for tests that only care about a handful
 * of steps -- fills in the fields `RunStep`/`RunDefinition` require but that
 * a given test doesn't exercise. Inputs are loosely typed (test fixtures use
 * plain string literals for `type` etc.) and cast at the boundary. */
function makeDefinition(
    steps: ReadonlyArray<Record<string, unknown> & { id: string; sectionId: string }>,
    sections: Section[] = [],
    logicRules: LogicRule[] = []
): RunDefinition {
    return {
        sections: sections as unknown as RunDefinition['sections'],
        steps: steps.map((step) => ({
            workflowId: 'wf-1',
            type: 'short_text',
            title: 'Step',
            description: null,
            required: false,
            alias: null,
            order: 0,
            isVirtual: false,
            config: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...step,
        })) as unknown as RunStep[],
        logicRules,
        source: 'live',
    };
}

describe('RunExecutionCoordinator - JS Execution', () => {
    let coordinator: RunExecutionCoordinator;
    let mockStepRepo: Mocked<typeof stepRepository>;
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
        mockSectionRepo = sectionRepository as unknown as Mocked<typeof sectionRepository>;
        mockWorkflowRepo = workflowRepository as unknown as Mocked<typeof workflowRepository>;
        mockLogicRuleRepo = logicRuleRepository as unknown as Mocked<typeof logicRuleRepository>;
        mockRunRepo = workflowRunRepository as unknown as Mocked<typeof workflowRunRepository>;
        // vi.clearAllMocks() clears call history but not the resolved value
        // baked into the module factory above -- restate it explicitly so
        // this default survives even if a test overrides and doesn't reset.
        mockRunRepo.findById.mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null } as never);

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
        sectionId: 'section-1',
        type: 'js_question',
        title: 'Calculate Total',
        config: {
            code: 'return input.a + input.b;',
            inputKeys: ['a', 'b'],
            outputKey: 'result',
            display: 'visible',
            timeoutMs: 1000
        } as JsQuestionConfig,
        alias: 'total'
    };
    it('should execute JS questions using ScriptEngine', async () => {
        // Mock ScriptEngine success
        vi.mocked(scriptEngine.execute).mockResolvedValue({
            ok: true,
            output: 30,
            durationMs: 5
        });

        // Test via private method execution
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };
        const definition = makeDefinition([mockJsStep]);

        const testCoordinator = coordinator as unknown as TestCoordinator;
        const result = await testCoordinator.executeJsQuestions(
            'section-1',
            { 'step-a': 10, 'step-b': 20 },
            context,
            definition
        );

        expect(result.success).toBe(true);
        const executionRequest = vi.mocked(scriptEngine.execute).mock.calls[0]?.[0];
        expect(executionRequest).toMatchObject({
            code: mockJsStep.config.code,
            inputKeys: mockJsStep.config.inputKeys,
            data: { 'step-a': 10, 'step-b': 20 },
            context: {
                runId: 'run-1',
                phase: 'question_execution',
                metadata: {
                    stepId: mockJsStep.id
                }
            }
        });

        const { runPersistenceWriter } = await import('../../../server/services/runs/RunPersistenceWriter');
        expect(runPersistenceWriter.saveStepValue).toHaveBeenCalledWith(
            'run-1',
            mockJsStep.id,
            30,
            'wf-1'
        );
    });
    it('should handle ScriptEngine errors gracefully', async () => {
        vi.mocked(scriptEngine.execute).mockResolvedValue({
            ok: false,
            error: 'SyntaxError: Unexpected token'
        });

        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };
        const definition = makeDefinition([mockJsStep]);

        const testCoordinator = coordinator as unknown as TestCoordinator;
        const result = await testCoordinator.executeJsQuestions(
            'section-1',
            { 'step-a': 10, 'step-b': 20 },
            context,
            definition
        );

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('SyntaxError'));
    });

    it('rejects section submits containing values from another section before writing', async () => {
        // The other-section step must exist SOMEWHERE on this workflow for this
        // to be the mass-assignment case rather than the edited-mid-run case
        // that RUN2-15 drops.
        mockSectionRepo.findByWorkflowId.mockResolvedValue([
            { id: 'section-1', workflowId: 'wf-1', order: 0 } as unknown as Section,
            { id: 'section-2', workflowId: 'wf-1', order: 1 } as unknown as Section,
        ]);
        mockStepRepo.findBySectionIds.mockResolvedValue([
            { id: 'current-step', sectionId: 'section-1', type: 'short_text', title: 'Current Step' } as unknown as Step,
            { id: 'other-section-step', sectionId: 'section-2', type: 'short_text', title: 'Other Step' } as unknown as Step,
        ]);
        mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        await expect(coordinator.submitSection(context, 'section-1', [
            { stepId: 'current-step', value: 'ok' },
            { stepId: 'other-section-step', value: 'not ok' },
        ])).rejects.toMatchObject({
            statusCode: 400,
            details: { stepIds: ['other-section-step'] },
        });

        expect(mockRunPersistence.bulkSaveValues).not.toHaveBeenCalled();
    });

    describe('submitSection with a workflow edited mid-run (RUN2-15)', () => {
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        beforeEach(() => {
            mockSectionRepo.findByWorkflowId.mockResolvedValue([
                { id: 'section-1', workflowId: 'wf-1', order: 0 } as unknown as Section,
            ]);
            // The workflow no longer has 'deleted-step' anywhere: the author
            // removed that question after the respondent's runtime was pinned.
            mockStepRepo.findBySectionIds.mockResolvedValue([
                { id: 'current-step', sectionId: 'section-1', type: 'short_text', title: 'Current Step' } as unknown as Step,
            ]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            // Needed now that RVP-3 gives the fixture a real `sectionId`: the
            // step is genuinely visible, so `validatePage` actually reads the
            // run's data map instead of skipping every step. Before RVP-3 these
            // fixtures omitted `sectionId`, which made the step invisible and
            // meant validation was never exercised at all.
            mockRunPersistence.getRunValues.mockResolvedValue({ 'current-step': 'ok' });
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true });
        });

        it('drops values for steps that no longer exist and lets the respondent continue (AC1)', async () => {
            const result = await coordinator.submitSection(context, 'section-1', [
                { stepId: 'current-step', value: 'ok' },
                { stepId: 'deleted-step', value: 'orphaned' },
            ]);

            expect(result.success).toBe(true);
        });

        it('persists only the surviving values (AC3)', async () => {
            await coordinator.submitSection(context, 'section-1', [
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
                await coordinator.submitSection(context, 'section-1', [
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
                    sectionId: 'section-1',
                    droppedStepIds: ['deleted-step'],
                });
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('does not touch the normal path when every id is in the section (AC3)', async () => {
            await coordinator.submitSection(context, 'section-1', [
                { stepId: 'current-step', value: 'ok' },
            ]);

            expect(mockRunPersistence.bulkSaveValues).toHaveBeenCalledWith(
                'run-1',
                [{ stepId: 'current-step', value: 'ok' }],
                'wf-1'
            );
        });
    });

    describe('submitSection visibility (RUN2-1: shared evaluateWorkflowVisibility engine)', () => {
        const section: Section = { id: 'section-1', workflowId: 'wf-1', order: 0 } as unknown as Section;
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        beforeEach(() => {
            mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true });
        });

        it('excludes a required step hidden by a "hide" logic rule from validation (AC2)', async () => {
            const requiredStep = {
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                sectionId: 'section-1',
                visibleIf: null,
            } as unknown as Step;
            mockStepRepo.findBySectionIds.mockResolvedValue([requiredStep]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([{
                targetType: 'step',
                targetStepId: 'req-step',
                action: 'hide',
                conditionStepId: 'trigger-step',
                when: buildTestWhen('trigger-step', 'equals', 'yes'),
            } as unknown as LogicRule]);
            mockRunPersistence.getRunValues.mockResolvedValue({ 'trigger-step': 'yes' });

            const result = await coordinator.submitSection(context, 'section-1', []);

            expect(result).toEqual({ success: true, errors: undefined });
        });

        it('treats a step with a malformed visibleIf as hidden (fail-closed) and does not block submit (AC3)', async () => {
            const requiredStep = {
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                sectionId: 'section-1',
                // Malformed visibleIf: not a valid ConditionExpression shape.
                // evaluateWorkflowVisibility must fail closed (treat as hidden).
                visibleIf: 'not-a-valid-condition-expression',
            } as unknown as Step;
            mockStepRepo.findBySectionIds.mockResolvedValue([requiredStep]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({});

            const result = await coordinator.submitSection(context, 'section-1', []);

            expect(result).toEqual({ success: true, errors: undefined });
        });

        it('still blocks submit for a required, visible step with no value (AC4, unchanged behavior)', async () => {
            const requiredStep = {
                id: 'req-step',
                type: 'short_text',
                title: 'Required Step',
                required: true,
                sectionId: 'section-1',
                visibleIf: null,
            } as unknown as Step;
            mockStepRepo.findBySectionIds.mockResolvedValue([requiredStep]);
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
            mockRunPersistence.getRunValues.mockResolvedValue({});

            const result = await coordinator.submitSection(context, 'section-1', []);

            expect(result).toEqual({
                success: false,
                errors: ['Required Step: Required Step is required'],
            });
            expect(blockRunner.runPhase).not.toHaveBeenCalled();
        });
    });

    describe('submitSection validates supported uploads and skips unknown required steps', () => {
        const section: Section = { id: 'section-1', workflowId: 'wf-1', order: 0 } as unknown as Section;
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        beforeEach(() => {
            mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
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
                    sectionId: 'section-1',
                    visibleIf: null,
                } as unknown as Step;
                mockStepRepo.findBySectionIds.mockResolvedValue([uploadStep]);

                const result = await coordinator.submitSection(context, 'section-1', []);

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
                sectionId: 'section-1',
                visibleIf: null,
            } as unknown as Step;
            mockStepRepo.findBySectionIds.mockResolvedValue([unknownStep]);

            const result = await coordinator.submitSection(context, 'section-1', []);

            expect(result).toEqual({ success: true, errors: undefined });
        });
    });

    describe('next - branch block nextSectionId validation (RUN2-12)', () => {
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };
        let mockEvaluateNavigation: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockRunPersistence.getRunValues.mockResolvedValue({});
            mockStepRepo.findBySectionIds.mockResolvedValue([]); // no JS questions; alias map source
            mockSectionRepo.findByWorkflowId.mockResolvedValue([]); // definition source
            mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

            mockEvaluateNavigation = vi.fn();
            (logicService as unknown as { evaluateNavigation: typeof mockEvaluateNavigation })
                .evaluateNavigation = mockEvaluateNavigation;
        });

        it('ignores a branch block nextSectionId that is not a visible section, falls back to computed navigation, and logs a warning (AC1)', async () => {
            const computed: NavigationResult = {
                visibleSections: ['section-a', 'section-b'],
                visibleSteps: ['step-a'],
                requiredSteps: ['step-a'],
                nextSectionId: 'section-b',
                currentProgress: 50,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, nextSectionId: 'stale-section-id' });
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);

            const result = await coordinator.next(context, 'section-a');

            expect(result).toEqual(computed);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({ invalidNextSectionId: 'stale-section-id', sectionId: 'section-a' }),
                expect.stringContaining('not visible in this workflow')
            );
            expect(mockRunPersistence.updateRun).toHaveBeenCalledWith('run-1', {
                currentSectionId: 'section-b',
                progress: 50,
            });

            warnSpy.mockRestore();
        });

        it('includes the offending block id in the warning when BlockRunner supplies nextSectionBlockId (RUN2-21)', async () => {
            const computed: NavigationResult = {
                visibleSections: ['section-a', 'section-b'],
                visibleSteps: ['step-a'],
                requiredSteps: ['step-a'],
                nextSectionId: 'section-b',
                currentProgress: 50,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({
                success: true,
                nextSectionId: 'stale-section-id',
                nextSectionBlockId: 'branch-block-42',
            });
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);

            const result = await coordinator.next(context, 'section-a');

            expect(result).toEqual(computed);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    invalidNextSectionId: 'stale-section-id',
                    sectionId: 'section-a',
                    blockId: 'branch-block-42',
                }),
                expect.stringContaining('not visible in this workflow')
            );

            warnSpy.mockRestore();
        });

        it('honors a branch block nextSectionId that is a visible section of this workflow (AC2)', async () => {
            const computed: NavigationResult = {
                visibleSections: ['section-a', 'section-b', 'section-c'],
                visibleSteps: ['step-a'],
                requiredSteps: ['step-a'],
                nextSectionId: 'section-b',
                currentProgress: 33,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, nextSectionId: 'section-c' });

            const result = await coordinator.next(context, 'section-a');

            expect(result).toEqual({ ...computed, nextSectionId: 'section-c' });
        });

        it('populates visibleSections/visibleSteps/requiredSteps/currentProgress from computed navigation when a branch overrides (AC3)', async () => {
            const computed: NavigationResult = {
                visibleSections: ['section-a', 'section-c'],
                visibleSteps: ['step-a', 'step-c'],
                requiredSteps: ['step-c'],
                nextSectionId: 'section-c',
                currentProgress: 75,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true, nextSectionId: 'section-c' });

            const result = await coordinator.next(context, 'section-a');

            expect(result.visibleSections).toEqual(computed.visibleSections);
            expect(result.visibleSteps).toEqual(computed.visibleSteps);
            expect(result.requiredSteps).toEqual(computed.requiredSteps);
            expect(result.currentProgress).toBe(computed.currentProgress);
        });

        it('populates visibleSections/visibleSteps/requiredSteps/currentProgress from computed navigation in the normal (no branch) path (AC3)', async () => {
            const computed: NavigationResult = {
                visibleSections: ['section-a', 'section-b'],
                visibleSteps: ['step-a', 'step-b'],
                requiredSteps: ['step-b'],
                nextSectionId: 'section-b',
                currentProgress: 50,
            };
            mockEvaluateNavigation.mockResolvedValue(computed);
            vi.mocked(blockRunner.runPhase).mockResolvedValue({ success: true }); // no branch decision

            const result = await coordinator.next(context, 'section-a');

            expect(result).toEqual(computed);
        });
    });
});
