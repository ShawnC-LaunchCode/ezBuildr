import { describe, it, expect, vi, beforeEach } from 'vitest';

import { JsQuestionConfig } from '@shared/types/steps';

import { stepRepository, sectionRepository, workflowRepository } from '../../../server/repositories';
import { logicService } from '../../../server/services/LogicService';
import { RunExecutionCoordinator } from '../../../server/services/runs/RunExecutionCoordinator';
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
describe('RunExecutionCoordinator - JS Execution', () => {
    let coordinator: RunExecutionCoordinator;
    beforeEach(async () => {
        vi.clearAllMocks();
        coordinator = new RunExecutionCoordinator(
            // Import the mocked instance directly
            (await import('../../../server/services/runs/RunPersistenceWriter')).runPersistenceWriter as any,
            logicService as any,
            stepRepository as any,
            sectionRepository as any,
            workflowRepository as any
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
        (stepRepository.findBySectionId as any).mockResolvedValue([mockJsStep]);
        (sectionRepository.findById as any).mockResolvedValue({ workflowId: 'wf-1' });
        // Mock ScriptEngine success
        (scriptEngine.execute as any).mockResolvedValue({
            ok: true,
            output: 30,
            durationMs: 5
        });
        // Test via private method execution
        const context = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };
        const result = await (coordinator as any).executeJsQuestions(
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
        (stepRepository.findBySectionId as any).mockResolvedValue([mockJsStep]);
        (sectionRepository.findById as any).mockResolvedValue({ workflowId: 'wf-1' });
        (scriptEngine.execute as any).mockResolvedValue({
            ok: false,
            error: 'SyntaxError: Unexpected token'
        });
        const context = { runId: 'run-1', workflowId: 'wf-1', userId: 'user-1', mode: 'live' };
        const result = await (coordinator as any).executeJsQuestions(
            'run-1',
            'section-1',
            { 'step-a': 10, 'step-b': 20 },
            context
        );
        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('SyntaxError'));
    });
});