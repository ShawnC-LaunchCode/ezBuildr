/**
 * Lifecycle Hooks Execution Integration Tests
 *
 * Tests all 4 lifecycle hook phases with comprehensive coverage:
 * - beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated
 * - Context mutation mode
 * - JavaScript and Python execution
 * - Timeout enforcement
 * - Error handling (non-breaking)
 * - Console output capture
 * - Execution logging
 */

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

import {
  workflows,
  sections,
  steps,
  workflowRuns,
  stepValues,
  lifecycleHooks,
  scriptExecutionLog
} from '@shared/schema';

import { db } from '../../server/db';
import { createTestWorkflow, createTestSection, createTestStep, createTestWorkflowRun } from '../factories';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';

describe('Lifecycle Hooks Execution', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let workflowVersionId: string; // Added workflowVersionId
  let sectionId: string;
  let stepId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Lifecycle Hooks Test Tenant',
      createProject: true,
    });
  });

  beforeEach(async () => {
    workflowId = uuidv4();
    console.log('TEST SETUP: workflowId =', workflowId);
    workflowVersionId = uuidv4();
    sectionId = uuidv4();
    stepId = uuidv4();

    // Create workflow with section and step for each test
    await db.insert(workflows).values(
      createTestWorkflow({
        id: workflowId,
        projectId: ctx.projectId,
        creatorId: ctx.userId,
        title: 'Lifecycle Hooks Test Workflow',
        ownerType: 'user',
        ownerUuid: ctx.userId,
        ownerId: ctx.userId,
      })
    );

    await db.insert(sections).values(
      createTestSection({
        id: sectionId,
        workflowId,
        title: 'Test Section',
        order: 0,
      })
    );

    await db.insert(steps).values(
      createTestStep({
        id: stepId,
        sectionId,
        type: 'short_text',
        alias: 'user_name',
        title: 'Your Name',
        order: 0,
      })
    ).returning();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('Phase: beforePage', () => {
    it('should execute beforePage hook and capture console output', async () => {
      // Create beforePage hook
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Log Page Entry',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            helpers.console.log('Entering page:', context.sectionId);
            helpers.console.log('User:', context.userId);
            emit({ executed: true });
          `,
          inputKeys: [],
          outputKeys: ['executed'],
          enabled: true,
          mutationMode: false,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      const hookId = createRes.body.data.id;

      // Create a run and trigger beforePage phase
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({
          workflowId,
          createdBy: ctx.userId,
          currentSectionId: sectionId,
        })
      ).returning();

      // Execute hook manually via service (simulating workflow execution)
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: {},
        userId: ctx.userId,
      });

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.consoleOutput).toBeDefined();
      expect(result.consoleOutput?.length).toBeGreaterThan(0);

      // Verify console logs were captured
      const consoleLogs = result.consoleOutput![0].logs;
      expect(consoleLogs.some(log => log[0].includes('Entering page'))).toBe(true);

      // Verify execution was logged
      const logs = await db.select()
        .from(scriptExecutionLog)
        .where(eq(scriptExecutionLog.runId, run.id));

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].scriptType).toBe('lifecycle_hook');
      expect(logs[0].status).toBe('success');
    });

    it('should execute beforePage hook with mutation mode enabled', async () => {
      // Create beforePage hook with mutation mode
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Prefill Data',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            const timestamp = helpers.date.now();
            const formattedDate = helpers.date.format(timestamp, 'yyyy-MM-dd');
            emit({
              pageLoadTime: timestamp,
              pageLoadDate: formattedDate,
              autoFilled: true
            });
          `,
          inputKeys: [],
          outputKeys: ['pageLoadTime', 'pageLoadDate', 'autoFilled'],
          enabled: true,
          mutationMode: true, // Enable mutation
        });

      expect(createRes.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hook
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: {},
        userId: ctx.userId,
      });

      expect(result.success).toBe(true);
      // Verify mutation applied
      expect(result.data).toHaveProperty('pageLoadTime');
      expect(result.data).toHaveProperty('pageLoadDate');
      expect(result.data.autoFilled).toBe(true);
    });

    it('should handle errors gracefully without breaking workflow', async () => {
      // Create hook with intentional error
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Error Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            throw new Error('Intentional test error');
          `,
          inputKeys: [],
          outputKeys: [],
          enabled: true,
        });

      expect(createRes.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hook - should not throw
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: { existingData: 'preserved' },
        userId: ctx.userId,
      });

      // Workflow continues despite error
      // Workflow continues despite error, but reports partial success/failure
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0].error).toContain('Intentional test error');

      // Original data preserved
      expect(result.data.existingData).toBe('preserved');

      // Error logged
      const logs = await db.select()
        .from(scriptExecutionLog)
        .where(eq(scriptExecutionLog.runId, run.id));

      const errorLog = logs.find(log => log.status === 'error');
      expect(errorLog).toBeDefined();
    });
  });

  describe('Phase: afterPage', () => {
    it('should execute afterPage hook with user input data', async () => {
      // Create afterPage hook
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Validate Submission',
          phase: 'afterPage',
          language: 'javascript',
          code: `
            const name = input.user_name;
            helpers.console.log('User submitted name:', name);

            const isValid = name && name.length >= 2;
            const normalized = name ? name.trim().toUpperCase() : '';

            emit({
              validationPassed: isValid,
              normalizedName: normalized
            });
          `,
          inputKeys: ['user_name'],
          outputKeys: ['validationPassed', 'normalizedName'],
          enabled: true,
          mutationMode: true,
        });

      expect(createRes.status).toBe(201);

      // Create run with step value
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      await db.insert(stepValues).values({
        runId: run.id,
        stepId: stepId,
        value: 'John Doe',
      });

      // Execute hook
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'afterPage',
        sectionId,
        data: { [stepId]: 'John Doe' }, // Simulating step values
        userId: ctx.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data.validationPassed).toBe(true);
      expect(result.data.normalizedName).toBe('JOHN DOE');
    });

    it('should execute Python afterPage hook', async () => {
      // Create Python hook
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Python Data Processing',
          phase: 'afterPage',
          language: 'python',
          code: `
import json

name = input.get('user_name', '')
word_count = len(name.split())
char_count = len(name)

result = {
    'wordCount': word_count,
    'charCount': char_count,
    'hasMultipleWords': word_count > 1
}

emit(result)
          `,
          inputKeys: ['user_name'],
          outputKeys: ['wordCount', 'charCount', 'hasMultipleWords'],
          enabled: true,
          mutationMode: true,
        });

      expect(createRes.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hook
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'afterPage',
        sectionId,
        data: { [stepId]: 'Jane Smith' },
        userId: ctx.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data.wordCount).toBe(2);
      expect(result.data.charCount).toBe(10);
      expect(result.data.hasMultipleWords).toBe(true);
    });
  });

  describe('Phase: beforeFinalBlock', () => {
    it('should execute beforeFinalBlock hook before document generation', async () => {
      // Create beforeFinalBlock hook
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Prepare Document Data',
          phase: 'beforeFinalBlock',
          language: 'javascript',
          code: `
            helpers.console.log('Preparing document data...');

            const documentTitle = helpers.string.capitalize(input.user_name || 'Untitled');
            const documentDate = helpers.date.format(helpers.date.now(), 'MMMM dd, yyyy');

            emit({
              documentTitle,
              documentDate,
              documentReady: true
            });
          `,
          inputKeys: ['user_name'],
          outputKeys: ['documentTitle', 'documentDate', 'documentReady'],
          enabled: true,
          mutationMode: true,
        });

      expect(createRes.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hook
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforeFinalBlock',
        data: { [stepId]: 'alice wonderland' },
        userId: ctx.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data.documentTitle).toBe('Alice wonderland');
      expect(result.data.documentDate).toMatch(/[A-Z][a-z]+ \d{2}, \d{4}/);
      expect(result.data.documentReady).toBe(true);
    });
  });

  describe('Phase: afterDocumentsGenerated', () => {
    it('should execute afterDocumentsGenerated hook for cleanup', async () => {
      // Create afterDocumentsGenerated hook
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Post-Generation Cleanup',
          phase: 'afterDocumentsGenerated',
          language: 'javascript',
          code: `
            helpers.console.log('Documents generated successfully');

            const completionTimestamp = helpers.date.now();
            const stats = {
              documentsGenerated: true,
              completedAt: completionTimestamp,
              totalSteps: Object.keys(input).length
            };

            emit(stats);
          `,
          inputKeys: [],
          outputKeys: ['documentsGenerated', 'completedAt', 'totalSteps'],
          enabled: true,
          mutationMode: true,
        });

      expect(createRes.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hook
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'afterDocumentsGenerated',
        data: { step1: 'value1', step2: 'value2' },
        userId: ctx.userId,
      });

      expect(result.success).toBe(true);
      expect(result.data.documentsGenerated).toBe(true);
      expect(result.data.completedAt).toBeDefined();
      expect(result.data.totalSteps).toBeGreaterThan(0);
    });
  });

  describe('Timeout Enforcement', () => {
    it('should timeout hook that exceeds timeoutMs limit', async () => {
      // Create hook with short timeout and infinite loop
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Timeout Test',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            // Infinite loop (will timeout)
            while (true) {
              // Do nothing
            }
            emit({ completed: true });
          `,
          inputKeys: [],
          outputKeys: ['completed'],
          enabled: true,
          timeoutMs: 100, // Very short timeout
        });

      expect(createRes.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hook - should timeout
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: {},
        userId: ctx.userId,
      });

      // Workflow continues despite timeout
      expect(result.success).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].error).toMatch(/timeout|timed out/i);

      // Timeout logged
      const logs = await db.select()
        .from(scriptExecutionLog)
        .where(eq(scriptExecutionLog.runId, run.id));

      const timeoutLog = logs.find(log => log.status === 'timeout');
      expect(timeoutLog).toBeDefined();
    });
  });

  describe('Multiple Hooks Execution Order', () => {
    it('should execute multiple hooks in correct order', async () => {
      // Create 3 hooks with different orders
      const hook1Res = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'First Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            helpers.console.log('Hook 1 executed');
            emit({ step: 1 });
          `,
          inputKeys: [],
          outputKeys: ['step'],
          enabled: true,
          order: 0,
          mutationMode: true,
        });

      const hook2Res = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Second Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            helpers.console.log('Hook 2 executed, step was:', input.step);
            emit({ step: 2 });
          `,
          inputKeys: ['step'],
          outputKeys: ['step'],
          enabled: true,
          order: 1,
          mutationMode: true,
        });

      const hook3Res = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Third Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            helpers.console.log('Hook 3 executed, step was:', input.step);
            emit({ step: 3, final: true });
          `,
          inputKeys: ['step'],
          outputKeys: ['step', 'final'],
          enabled: true,
          order: 2,
          mutationMode: true,
        });

      expect(hook1Res.status).toBe(201);
      expect(hook2Res.status).toBe(201);
      expect(hook3Res.status).toBe(201);

      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hooks
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      const result = await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: {},
        userId: ctx.userId,
      });

      expect(result.success, `Hook execution failed: ${JSON.stringify(result.errors || (result as any).error || result)}`).toBe(true);
      expect(result.data.step).toBe(3); // Final value from hook 3
      expect(result.data.final).toBe(true);

      // Verify all hooks executed
      const logs = await db.select()
        .from(scriptExecutionLog)
        .where(eq(scriptExecutionLog.runId, run.id));

      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Hook Management API', () => {
    it('should list all hooks for a workflow', async () => {
      // Create a hook first
      await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Hook for List',
          phase: 'beforePage',
          language: 'javascript',
          code: 'log("list")',
          enabled: true,
          inputKeys: [],
          outputKeys: []
        });

      const res = await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should update a hook', async () => {
      // Create hook first
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Hook to Update',
          phase: 'beforePage',
          language: 'javascript',
          code: 'log("update")',
          enabled: true,
          inputKeys: [],
          outputKeys: []
        });

      const hookId = createRes.body.data.id;

      // Update hook
      const updateRes = await request(ctx.baseURL)
        .put(`/api/lifecycle-hooks/${hookId}`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Updated Hook Name',
          enabled: false,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.name).toBe('Updated Hook Name');
      expect(updateRes.body.data.enabled).toBe(false);
    });

    it('should delete a hook', async () => {
      // Create hook to delete
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Hook to Delete',
          phase: 'beforePage',
          language: 'javascript',
          code: 'emit({ deleted: true });',
          inputKeys: [],
          outputKeys: ['deleted'],
        });

      const hookId = createRes.body.data.id;

      // Delete hook
      const deleteRes = await request(ctx.baseURL)
        .delete(`/api/lifecycle-hooks/${hookId}`)
        .set('Authorization', `Bearer ${ctx.authToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify deleted
      const hook = await db.query.lifecycleHooks.findFirst({
        where: eq(lifecycleHooks.id, hookId),
      });
      expect(hook).toBeUndefined();
    });

    it('should test a hook with sample data', async () => {
      // Create hook
      const createRes = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/lifecycle-hooks`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          name: 'Test Hook',
          phase: 'beforePage',
          language: 'javascript',
          code: `
            const doubled = input.number * 2;
            emit({ doubled });
          `,
          inputKeys: ['number'],
          outputKeys: ['doubled'],
        });

      const hookId = createRes.body.data.id;

      // Test hook
      const testRes = await request(ctx.baseURL)
        .post(`/api/lifecycle-hooks/${hookId}/test`)
        .set('Authorization', `Bearer ${ctx.authToken}`)
        .send({
          testData: { number: 21 },
          context: {
            workflowId,
            phase: 'beforePage',
          },
        });

      expect(testRes.status).toBe(200);
      expect(testRes.body.success).toBe(true);
      expect(testRes.body.data.output.doubled).toBe(42);
    });
  });

  describe('Script Console Logs', () => {
    it('should retrieve execution logs for a run', async () => {
      // Create run with hooks that have console output
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute some hooks
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: {},
        userId: ctx.userId,
      });

      // Get console logs
      const res = await request(ctx.baseURL)
        .get(`/api/runs/${run.id}/script-console`)
        .set('Authorization', `Bearer ${ctx.authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should clear execution logs for a run', async () => {
      // Create run
      const [run] = await db.insert(workflowRuns).values(
        createTestWorkflowRun({ workflowId, createdBy: ctx.userId })
      ).returning();

      // Execute hooks
      const { lifecycleHookService } = await import('../../server/services/scripting/LifecycleHookService');

      await lifecycleHookService.executeHooksForPhase({
        workflowId,
        runId: run.id,
        phase: 'beforePage',
        sectionId,
        data: {},
        userId: ctx.userId,
      });

      // Clear logs
      const res = await request(ctx.baseURL)
        .delete(`/api/runs/${run.id}/script-console`)
        .set('Authorization', `Bearer ${ctx.authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify cleared
      const logs = await db.select()
        .from(scriptExecutionLog)
        .where(eq(scriptExecutionLog.runId, run.id));

      expect(logs.length).toBe(0);
    });
  });
});
