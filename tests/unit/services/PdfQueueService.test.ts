/**
 * Stage 21: PDF Queue Service Unit Tests
 *
 * Tests for queue-based PDF conversion with retry logic
 */
import fs from 'fs/promises';

import { eq, and } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';

import { db, initializeDatabase, dbInitPromise } from '../../../server/db';
import { logger } from '../../../server/logger';
import { DbTransaction } from '../../../server/repositories';
import { PdfQueueService } from '../../../server/services/PdfQueueService';
import { projects, workflows, workflowVersions, runs, runOutputs, users, tenants } from '../../../shared/schema';
import { describeWithDb } from '../../helpers/dbTestHelper';

// Mock logger (include all methods used by db.ts)
vi.mock('../../../server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(), // Add debug method for db.ts
  },
}));

// Mock the docxRenderer2 module
vi.mock('../../../server/services/docxRenderer2', () => ({
  convertDocxToPdf2: vi.fn(async (docxPath: string) => {
    return docxPath.replace(/\.docx$/i, '.pdf');
  }),
}));

// Mock template file operations
vi.mock('../../../server/services/templates', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getOutputFilePath: vi.fn((fileRef: string) => `/fake/outputs/${fileRef}`),
  };
});

// Mock fs operations
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(async () => { }),
    mkdir: vi.fn(async () => { }),
    writeFile: vi.fn(async () => { }),
    unlink: vi.fn(async () => { }),
  },
}));

describeWithDb('PdfQueueService', () => {
  let service: PdfQueueService;
  let testProjectId: string;
  let testWorkflowId: string;
  let testVersionId: string;
  let testRunId: string;
  let testTenantId: string;

  beforeAll(async () => {
    // Initialize database before running tests
    await initializeDatabase();
    await dbInitPromise;

    // Create a new service instance for testing (don't use singleton)
    service = new PdfQueueService();
  });

  beforeEach(async () => {
    testTenantId = '00000000-0000-0000-0000-000000000000';

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: 'test@example.com',
        role: 'creator' as any,
      })
      .returning();
    const testUserId = user.id;

    // Create test tenant
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Test Tenant',
      })
      .returning();
    testTenantId = tenant.id;

    // Create test project
    const [project] = await db
      .insert(projects)
      .values({
        name: 'Test Project',
        title: 'Test Project',
        description: 'Test project',
        tenantId: testTenantId,
        creatorId: testUserId,
        createdBy: testUserId,
        ownerId: testUserId,
      })
      .returning();
    testProjectId = project.id;

    // Create test workflow
    const [workflow] = await db
      .insert(workflows)
      .values({
        projectId: testProjectId,
        title: 'Test Workflow',
        name: 'Test Workflow',
        description: 'Test workflow',
        status: 'draft',
        creatorId: testUserId,
        ownerId: testUserId,
      })
      .returning();
    testWorkflowId = workflow.id;

    // Create test workflow version
    const [version] = await db
      .insert(workflowVersions)
      .values({
        workflowId: testWorkflowId,
        versionNumber: 1,
        isDraft: true,
        changelog: 'Initial version',
        definition: {},
        graphJson: {},
        createdBy: testUserId,
      } as any)
      .returning();
    testVersionId = version.id;

    // Create test run
    const [run] = await db
      .insert(runs)
      .values({
        workflowVersionId: testVersionId,
        status: 'pending',
        createdBy: testUserId,
      })
      .returning();
    testRunId = run.id;
  });

  afterEach(async () => {
    // Stop service if running
    service.stop();

    // Cleanup in reverse order of dependencies
    await db.delete(runOutputs).where(eq(runOutputs.runId, testRunId));
    await db.delete(runs).where(eq(runs.id, testRunId));
    await db.delete(workflowVersions).where(eq(workflowVersions.id, testVersionId));
    await db.delete(workflows).where(eq(workflows.id, testWorkflowId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
  });

  afterAll(() => {
    // Ensure service is stopped
    service.stop();
  });

  describe('enqueue', () => {
    it('should enqueue a PDF conversion job', async () => {
      const outputId = await service.enqueue(
        'test.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      expect(outputId).toBeDefined();

      // Verify output was created
      const output = await db.query.runOutputs.findFirst({
        where: eq(runOutputs.id, outputId),
      });

      expect(output).toBeDefined();
      expect(output!.runId).toBe(testRunId);
      expect(output!.workflowVersionId).toBe(testVersionId);
      expect(output!.templateKey).toBe('engagement_letter');
      expect(output!.fileType).toBe('pdf');
      expect(output!.status).toBe('pending');
    });

    it('should create output with empty storagePath initially', async () => {
      const outputId = await service.enqueue(
        'test.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      const output = await db.query.runOutputs.findFirst({
        where: eq(runOutputs.id, outputId),
      });

      expect(output!.storagePath).toBe('');
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for pending job', async () => {
      const outputId = await service.enqueue(
        'test.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      const status = await service.getJobStatus(outputId);

      expect(status).toBeDefined();
      expect(status!.status).toBe('pending');
    });

    it('should return null for non-existent job', async () => {
      const status = await service.getJobStatus('00000000-0000-0000-0000-000000000000');
      expect(status).toBeNull();
    });

    it('should parse attempt count from error field', async () => {
      // Create failed output with attempt info
      const [output] = await db
        .insert(runOutputs)
        .values({
          runId: testRunId,
          workflowVersionId: testVersionId,
          templateKey: 'engagement_letter',
          fileType: 'pdf',
          storagePath: '',
          status: 'pending',
          error: JSON.stringify({
            message: 'Test error',
            attempt: 2,
          }),
        })
        .returning();

      const status = await service.getJobStatus(output.id);

      expect(status!.attempt).toBe(2);
    });
  });

  describe('convertImmediate', () => {
    it('should convert DOCX to PDF immediately', async () => {
      // First create a DOCX output
      await db.insert(runOutputs).values({
        runId: testRunId,
        workflowVersionId: testVersionId,
        templateKey: 'engagement_letter',
        fileType: 'docx',
        storagePath: 'test.docx',
        status: 'ready',
      });

      const result = await service.convertImmediate(
        '/fake/outputs/test.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      expect(result.success).toBe(true);
      expect(result.pdfPath).toBeDefined();
      expect(result.attemptsMade).toBe(1);

      // Verify PDF output was created
      const pdfOutputs = await db
        .select()
        .from(runOutputs)
        .where(
          and(
            eq(runOutputs.runId, testRunId),
            eq(runOutputs.fileType, 'pdf'),
            eq(runOutputs.templateKey, 'engagement_letter')
          )
        );

      expect(pdfOutputs).toHaveLength(1);
      expect(pdfOutputs[0].status).toBe('ready');
      expect(pdfOutputs[0].storagePath).toContain('.pdf');
    });

    it('should handle conversion errors gracefully', async () => {
      // Mock fs.access to throw error
      const fsModule = await import('fs/promises');
      vi.mocked(fsModule.default.access).mockRejectedValueOnce(new Error('File not found'));

      const result = await service.convertImmediate(
        '/fake/outputs/nonexistent.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Verify failed output was created
      const outputs = await db
        .select()
        .from(runOutputs)
        .where(
          and(
            eq(runOutputs.runId, testRunId),
            eq(runOutputs.fileType, 'pdf')
          )
        );

      expect(outputs).toHaveLength(1);
      expect(outputs[0].status).toBe('failed');
      expect(outputs[0].error).toBeDefined();
    });
  });

  describe('Service Lifecycle', () => {
    it('should start and stop service', () => {
      expect(service['isRunning']).toBe(false);

      service.start();
      expect(service['isRunning']).toBe(true);

      service.stop();
      expect(service['isRunning']).toBe(false);
    });

    it('should not start if already running', () => {
      service.start();

      service.start(); // Try to start again

      expect(logger.warn).toHaveBeenCalledWith('PDF queue processor is already running');

      service.stop();
    });

    it('should handle stop when not running', () => {
      // Should not throw
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('Queue Processing', () => {
    it('should process pending jobs when queue is processed', async () => {
      // Create a DOCX output first
      await db.insert(runOutputs).values({
        runId: testRunId,
        workflowVersionId: testVersionId,
        templateKey: 'engagement_letter',
        fileType: 'docx' as any,
        storagePath: 'test.docx',
        status: 'ready' as any,
      });

      // Enqueue PDF job
      const outputId = await service.enqueue(
        'test.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      // Process queue manually (bypass polling)
      service['isRunning'] = true;
      await service['processQueue']();

      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if job was processed
      const output = await db.query.runOutputs.findFirst({
        where: eq(runOutputs.id, outputId),
      });

      // Job should be processed (status changed from pending)
      expect(output!.status).not.toBe('pending');
    });

    it('should process multiple jobs in batch', async () => {
      // Create DOCX output
      await db.insert(runOutputs).values({
        runId: testRunId,
        workflowVersionId: testVersionId,
        templateKey: 'engagement_letter',
        fileType: 'docx' as any,
        storagePath: 'test.docx',
        status: 'ready' as any,
      });

      // Enqueue multiple PDF jobs
      const job1 = await service.enqueue(
        'test1.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      const job2 = await service.enqueue(
        'test2.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      // Process queue
      service['isRunning'] = true;
      await service['processQueue']();

      // Give it time to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Both jobs should be processed
      const outputs = await db
        .select()
        .from(runOutputs)
        .where(
          and(
            eq(runOutputs.runId, testRunId),
            eq(runOutputs.fileType, 'pdf')
          )
        );

      expect(outputs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing DOCX output gracefully', async () => {
      // Enqueue PDF without corresponding DOCX
      const outputId = await service.enqueue(
        'nonexistent.docx',
        testRunId,
        testVersionId,
        'engagement_letter'
      );

      // Process queue
      await service['processQueue']();

      // Give it time to fail
      await new Promise((resolve) => setTimeout(resolve, 100));

      const output = await db.query.runOutputs.findFirst({
        where: eq(runOutputs.id, outputId),
      });

      // Should have error
      expect(output!.error).toBeDefined();
    });
  });

  describe('Transaction Support', () => {
    it('should support enqueue within transaction', async () => {
      await db.transaction(async (tx: DbTransaction) => {
        const outputId = await service.enqueue(
          'test.docx',
          testRunId,
          testVersionId,
          'engagement_letter',
          tx
        );

        expect(outputId).toBeDefined();

        // Verify within transaction
        const outputs = await tx
          .select()
          .from(runOutputs)
          .where(eq(runOutputs.id, outputId));

        expect(outputs).toHaveLength(1);
      });
    });

    it('should support convertImmediate within transaction', async () => {
      await db.transaction(async (tx: DbTransaction) => {
        const result = await service.convertImmediate(
          '/fake/outputs/test.docx',
          testRunId,
          testVersionId,
          'engagement_letter',
          tx
        );

        expect(result.success).toBe(true);
      });
    });
  });
});
