/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';

import { JsQuestionConfig } from '@shared/types/steps';
import type { Step } from '@shared/schema';

import { stepRepository, sectionRepository, workflowRepository } from '../../../server/repositories';
import { logicService } from '../../../server/services/LogicService';
import { RunExecutionCoordinator, type ExecutionContext } from '../../../server/services/runs/RunExecutionCoordinator';
import { type RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';
import { scriptEngine } from '../../../server/services/scripting/ScriptEngine';
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
        getRunValues: vi.fn()
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
    blockRunner: {}
}));
vi.mock('../../../server/repositories', () => ({
    stepRepository: {
        findBySectionId: vi.fn(),
        findById: vi.fn()
    },
    stepValueRepository: {
        upsert: vi.fn(), // still mock for compilation if needed
        findByRunId: vi.fn()
    },
    workflowRunRepository: {
        findById: vi.fn()
    },
    sectionRepository: {
        findById: vi.fn()
    },
    workflowRepository: {},
    logicRuleRepository: {}
}));

interface TestCoordinator {
    executeJsQuestions(
        runId: string,
        sectionId: string,
        dataMap: Record<string, unknown>,
        context: ExecutionContext,
        aliasMap?: Record<string, string>
    ): Promise<{ success: boolean; errors?: string[] }>;
}

describe('RunExecutionCoordinator - JS Execution', () => {
    let coordinator: RunExecutionCoordinator;
    let mockStepRepo: Mocked<typeof stepRepository>;
    let mockSectionRepo: Mocked<typeof sectionRepository>;
    let mockWorkflowRepo: Mocked<typeof workflowRepository>;
    let mockRunPersistence: Mocked<RunPersistenceWriter>;

    beforeEach(async () => {
        vi.clearAllMocks();

        const persistenceModule = await import('../../../server/services/runs/RunPersistenceWriter');
        mockRunPersistence = persistenceModule.runPersistenceWriter as unknown as Mocked<RunPersistenceWriter>;

        mockStepRepo = stepRepository as unknown as Mocked<typeof stepRepository>;
        mockSectionRepo = sectionRepository as unknown as Mocked<typeof sectionRepository>;
        mockWorkflowRepo = workflowRepository as unknown as Mocked<typeof workflowRepository>;

        coordinator = new RunExecutionCoordinator(
            mockRunPersistence,
            logicService as unknown as typeof logicService,
            mockStepRepo,
            mockSectionRepo,
            mockWorkflowRepo
        );
    });
    const mockJsStep = {
        id: 'step-js-1',
        type: 'js_question',
        title: 'Calculate Total',
        options: {
            code: 'return input.a + input.b;',
            inputKeys: ['a', 'b'],
            outputKey: 'result',
            display: 'visible',
            timeoutMs: 1000
        } as JsQuestionConfig,
        alias: 'total'
    };
    it('should execute JS questions using ScriptEngine', async () => {
        // Setup mocks
        mockStepRepo.findBySectionId.mockResolvedValue([mockJsStep as unknown as Step]);
        mockSectionRepo.findById.mockResolvedValue({ workflowId: 'wf-1' } as unknown as import('@shared/schema').Section);

        // Mock ScriptEngine success
        vi.mocked(scriptEngine.execute).mockResolvedValue({
            ok: true,
            output: 30,
            durationMs: 5
        });

        // Test via private method execution
        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        const testCoordinator = coordinator as unknown as TestCoordinator;
        const result = await testCoordinator.executeJsQuestions(
            'run-1',
            'section-1',
            { 'step-a': 10, 'step-b': 20 },
            context
        );

        expect(result.success).toBe(true);
        expect(scriptEngine.execute).toHaveBeenCalledWith(expect.objectContaining({
            code: mockJsStep.options.code,
            inputKeys: mockJsStep.options.inputKeys,
            data: expect.objectContaining({ 'step-a': 10, 'step-b': 20 }),
            context: expect.objectContaining({
                runId: 'run-1',
                phase: 'question_execution',
                metadata: expect.objectContaining({
                    stepId: mockJsStep.id
                })
            })
        }));

        const { runPersistenceWriter } = await import('../../../server/services/runs/RunPersistenceWriter');
        expect(runPersistenceWriter.saveStepValue).toHaveBeenCalledWith(
            'run-1',
            mockJsStep.id,
            30,
            'wf-1'
        );
    });
    it('should handle ScriptEngine errors gracefully', async () => {
        mockStepRepo.findBySectionId.mockResolvedValue([mockJsStep as unknown as Step]);
        mockSectionRepo.findById.mockResolvedValue({ workflowId: 'wf-1' } as unknown as import('@shared/schema').Section);

        vi.mocked(scriptEngine.execute).mockResolvedValue({
            ok: false,
            error: 'SyntaxError: Unexpected token'
        });

        const context: ExecutionContext = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };

        const testCoordinator = coordinator as unknown as TestCoordinator;
        const result = await testCoordinator.executeJsQuestions(
            'run-1',
            'section-1',
            { 'step-a': 10, 'step-b': 20 },
            context
        );

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('SyntaxError'));
    });
});