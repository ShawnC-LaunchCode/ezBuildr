/**
 * Unit Tests for LifecycleHookService
 *
 * Tests lifecycle hook execution, CRUD operations, error handling,
 * and mutation mode functionality.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { LifecycleHook } from '@shared/types/scripting';

import { lifecycleHookRepository } from '../../server/repositories/LifecycleHookRepository';
import { scriptExecutionLogRepository } from '../../server/repositories/ScriptExecutionLogRepository';
import { workflowRepository } from '../../server/repositories/WorkflowRepository';
import { LifecycleHookService } from '../../server/services/scripting/LifecycleHookService';
import { scriptEngine } from '../../server/services/scripting/ScriptEngine';


// Mock dependencies
vi.mock('../../server/repositories/LifecycleHookRepository');
vi.mock('../../server/repositories/ScriptExecutionLogRepository');
vi.mock('../../server/repositories/WorkflowRepository');
vi.mock('../../server/services/scripting/ScriptEngine');

describe('LifecycleHookService', () => {
  let lifecycleHookService: LifecycleHookService;

  beforeEach(() => {
    lifecycleHookService = new LifecycleHookService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeHooksForPhase()', () => {
    it('should execute hooks in order', async () => {
      const mockHooks: LifecycleHook[] = [
        {
          id: 'hook-1',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 1',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({ a: 1 });',
          inputKeys: [],
          outputKeys: ['a'],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'hook-2',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 2',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({ b: 2 });',
          inputKeys: [],
          outputKeys: ['b'],
          enabled: true,
          order: 1,
          timeoutMs: 1000,
          mutationMode: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockResolvedValue(mockHooks as any);

      vi.mocked(scriptEngine.execute)
        .mockResolvedValueOnce({
          ok: true,
          output: { a: 1 },
          consoleLogs: [],
          durationMs: 10,
        })
        .mockResolvedValueOnce({
          ok: true,
          output: { b: 2 },
          consoleLogs: [],
          durationMs: 15,
        });

      vi.mocked(scriptExecutionLogRepository.createLog).mockResolvedValue(undefined as any);

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: { initial: 'data' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ initial: 'data', a: 1, b: 2 });
      expect(result.errors).toBeUndefined();
      expect(scriptEngine.execute).toHaveBeenCalledTimes(2);
    });

    it('should handle hooks with no mutations', async () => {
      const mockHooks: LifecycleHook[] = [
        {
          id: 'hook-1',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 1',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({ log: "test" });',
          inputKeys: [],
          outputKeys: [],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: false, // No mutation
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockResolvedValue(mockHooks as any);

      vi.mocked(scriptEngine.execute).mockResolvedValue({
        ok: true,
        output: { log: 'test' },
        consoleLogs: [],
        durationMs: 10,
      });

      vi.mocked(scriptExecutionLogRepository.createLog).mockResolvedValue(undefined as any);

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: { initial: 'data' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ initial: 'data' }); // Data unchanged
    });

    it('should collect errors without breaking execution', async () => {
      const mockHooks: LifecycleHook[] = [
        {
          id: 'hook-1',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 1',
          phase: 'beforePage',
          language: 'javascript',
          code: 'throw new Error("Test error");',
          inputKeys: [],
          outputKeys: [],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'hook-2',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 2',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({ success: true });',
          inputKeys: [],
          outputKeys: ['success'],
          enabled: true,
          order: 1,
          timeoutMs: 1000,
          mutationMode: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockResolvedValue(mockHooks as any);

      vi.mocked(scriptEngine.execute)
        .mockResolvedValueOnce({
          ok: false,
          error: 'Test error',
        })
        .mockResolvedValueOnce({
          ok: true,
          output: { success: true },
          consoleLogs: [],
          durationMs: 10,
        });

      vi.mocked(scriptExecutionLogRepository.createLog).mockResolvedValue(undefined as any);

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: { initial: 'data' },
      });

      expect(result.success).toBe(false); // Has errors
      expect(result.data).toEqual({ initial: 'data', success: true }); // Hook 2 still executed
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].hookName).toBe('Hook 1');
      expect(scriptEngine.execute).toHaveBeenCalledTimes(2); // Both hooks executed
    });

    it('should collect console logs', async () => {
      const mockHooks: LifecycleHook[] = [
        {
          id: 'hook-1',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 1',
          phase: 'beforePage',
          language: 'javascript',
          code: 'helpers.console.log("test"); emit({});',
          inputKeys: [],
          outputKeys: [],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockResolvedValue(mockHooks as any);

      vi.mocked(scriptEngine.execute).mockResolvedValue({
        ok: true,
        output: {},
        consoleLogs: [['test']],
        durationMs: 10,
      });

      vi.mocked(scriptExecutionLogRepository.createLog).mockResolvedValue(undefined as any);

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: {},
      });

      expect(result.success).toBe(true);
      expect(result.consoleOutput).toBeDefined();
      expect(result.consoleOutput?.length).toBe(1);
      expect(result.consoleOutput?.[0].hookName).toBe('Hook 1');
      expect(result.consoleOutput?.[0].logs).toEqual([['test']]);
    });

    it('should return original data when no hooks exist', async () => {
      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockResolvedValue([]);

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: { test: 'data' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'data' });
      expect(scriptEngine.execute).not.toHaveBeenCalled();
    });

    it('should handle system errors gracefully', async () => {
      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockRejectedValue(
        new Error('Database error')
      );

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: { test: 'data' },
      });

      expect(result.success).toBe(false);
      expect(result.data).toEqual({ test: 'data' }); // Original data returned
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].hookId).toBe('system');
    });

    it('should pass input keys to script engine', async () => {
      const mockHooks: LifecycleHook[] = [
        {
          id: 'hook-1',
          workflowId: 'workflow-1',
          sectionId: null,
          name: 'Hook 1',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({ result: input.value });',
          inputKeys: ['value'],
          outputKeys: ['result'],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(lifecycleHookRepository.findEnabledByPhase).mockResolvedValue(mockHooks as any);

      vi.mocked(scriptEngine.execute).mockResolvedValue({
        ok: true,
        output: { result: 42 },
        consoleLogs: [],
        durationMs: 10,
      });

      vi.mocked(scriptExecutionLogRepository.createLog).mockResolvedValue(undefined as any);

      await lifecycleHookService.executeHooksForPhase({
        workflowId: 'workflow-1',
        runId: 'run-1',
        phase: 'beforePage',
        data: { value: 42, other: 'ignored' },
      });

      const executeSpy = vi.mocked(scriptEngine.execute);

      expect(executeSpy).toHaveBeenCalled();
      const callArgs = executeSpy.mock.calls[0][0];
      expect(callArgs.inputKeys).toEqual(['value']);
      expect(callArgs.data.value).toBe(42);
      expect(callArgs.data.other).toBe('ignored');
    });
  });

  describe('createHook()', () => {
    it('should create hook with ownership check', async () => {
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };
      const mockHook = {
        id: 'hook-1',
        workflowId: 'workflow-1',
        name: 'Test Hook',
        phase: 'beforePage',
      };

      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);
      vi.mocked(lifecycleHookRepository.create).mockResolvedValue(mockHook as any);

      const result = await lifecycleHookService.createHook('workflow-1', 'user-1', {
        workflowId: 'workflow-1',
        name: 'Test Hook',
        phase: 'beforePage',
        language: 'javascript',
        code: 'emit({});',
        inputKeys: [],
        outputKeys: [],
        enabled: true,
        order: 0,
        timeoutMs: 1000,
        mutationMode: false,
      });

      expect(result).toEqual(mockHook);
      expect(workflowRepository.findById).toHaveBeenCalledWith('workflow-1');
      expect(lifecycleHookRepository.create).toHaveBeenCalled();
    });

    it('should reject creation for non-existent workflow', async () => {
      vi.mocked(workflowRepository.findById).mockResolvedValue(undefined);

      await expect(
        lifecycleHookService.createHook('workflow-1', 'user-1', {
          workflowId: 'workflow-1',
          name: 'Test Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({});',
          inputKeys: [],
          outputKeys: [],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: false,
        })
      ).rejects.toThrow('Workflow not found');
    });

    it('should reject creation for non-owner', async () => {
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);

      await expect(
        lifecycleHookService.createHook('workflow-1', 'user-2', {
          workflowId: 'workflow-1',
          name: 'Test Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({});',
          inputKeys: [],
          outputKeys: [],
          enabled: true,
          order: 0,
          timeoutMs: 1000,
          mutationMode: false,
        })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('updateHook()', () => {
    it('should update hook with ownership check', async () => {
      const mockHook = { id: 'hook-1', workflowId: 'workflow-1' };
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };
      const updatedHook = { ...mockHook, name: 'Updated Hook' };

      vi.mocked(lifecycleHookRepository.findByIdWithWorkflow).mockResolvedValue(mockHook as any);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);
      vi.mocked(lifecycleHookRepository.update).mockResolvedValue(updatedHook as any);

      const result = await lifecycleHookService.updateHook('hook-1', 'user-1', {
        name: 'Updated Hook',
      });

      expect(result).toEqual(updatedHook);
      expect(lifecycleHookRepository.update).toHaveBeenCalledWith('hook-1', { name: 'Updated Hook' });
    });

    it('should reject update for non-owner', async () => {
      const mockHook = { id: 'hook-1', workflowId: 'workflow-1' };
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };

      vi.mocked(lifecycleHookRepository.findByIdWithWorkflow).mockResolvedValue(mockHook as any);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);

      await expect(
        lifecycleHookService.updateHook('hook-1', 'user-2', { name: 'Updated Hook' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('deleteHook()', () => {
    it('should delete hook with ownership check', async () => {
      const mockHook = { id: 'hook-1', workflowId: 'workflow-1' };
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };

      vi.mocked(lifecycleHookRepository.findByIdWithWorkflow).mockResolvedValue(mockHook as any);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);
      vi.mocked(lifecycleHookRepository.delete).mockResolvedValue(undefined as any);

      await lifecycleHookService.deleteHook('hook-1', 'user-1');

      expect(lifecycleHookRepository.delete).toHaveBeenCalledWith('hook-1');
    });

    it('should reject deletion for non-owner', async () => {
      const mockHook = { id: 'hook-1', workflowId: 'workflow-1' };
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };

      vi.mocked(lifecycleHookRepository.findByIdWithWorkflow).mockResolvedValue(mockHook as any);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);

      await expect(lifecycleHookService.deleteHook('hook-1', 'user-2')).rejects.toThrow('Unauthorized');
    });
  });

  describe('testHook()', () => {
    it('should execute hook with test data', async () => {
      const mockHook = {
        id: 'hook-1',
        workflowId: 'workflow-1',
        language: 'javascript',
        code: 'emit({ result: input.value * 2 });',
        inputKeys: ['value'],
        phase: 'beforePage',
        timeoutMs: 1000,
      };
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };

      vi.mocked(lifecycleHookRepository.findByIdWithWorkflow).mockResolvedValue(mockHook as any);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);
      vi.mocked(scriptEngine.execute).mockResolvedValue({
        ok: true,
        output: { result: 84 },
        consoleLogs: [],
        durationMs: 15,
      });

      const result = await lifecycleHookService.testHook('hook-1', 'user-1', {
        testData: { value: 42 },
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 84 });
      expect(result.durationMs).toBe(15);
    });
  });

  describe('listHooks()', () => {
    it('should list all hooks for workflow with ownership check', async () => {
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };
      const mockHooks = [
        { id: 'hook-1', name: 'Hook 1' },
        { id: 'hook-2', name: 'Hook 2' },
      ];

      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);
      vi.mocked(lifecycleHookRepository.findByWorkflowId).mockResolvedValue(mockHooks as any);

      const result = await lifecycleHookService.listHooks('workflow-1', 'user-1');

      expect(result).toEqual(mockHooks);
      expect(lifecycleHookRepository.findByWorkflowId).toHaveBeenCalledWith('workflow-1');
    });

    it('should reject listing for non-owner', async () => {
      const mockWorkflow = { id: 'workflow-1', creatorId: 'user-1' };
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow as any);

      await expect(lifecycleHookService.listHooks('workflow-1', 'user-2')).rejects.toThrow('Unauthorized');
    });
  });
});
