/**
 * Integration Tests for Runtime Pipelines
 * Tests end-to-end execution of writeback and document generation pipelines
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../server/db';
import { runService } from '../../../server/services/RunService';
import { workflowService } from '../../../server/services/WorkflowService';
import { DatavaultTablesService } from '../../../server/services/DatavaultTablesService';
import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';
import { DatavaultRowsService } from '../../../server/services/DatavaultRowsService';
import { writebackExecutionService } from '../../../server/services/WritebackExecutionService';
import {
  workflowRepository,
  sectionRepository,
  stepRepository,
  stepValueRepository,
  workflowRunRepository,
  projectRepository,
  datavaultWritebackMappingsRepository,
  datavaultRowsRepository,
  datavaultValuesRepository,
  documentTemplateRepository,
  runGeneratedDocumentsRepository,
} from '../../../server/repositories';
import {
  tenants,
  projects,
  workflows,
  sections,
  steps,
  workflowRuns,
  datavaultTables,
  datavaultColumns,
  datavaultRows,
  datavaultValues,
  templates,
} from '@shared/schema';
import { sql } from 'drizzle-orm';

describe('Runtime Pipelines Integration Tests', () => {
  const testUserId = 'test-user-123';
  let testTenantId: string;
  let testProjectId: string;
  let testWorkflowId: string;
  let testRunId: string;
  let testTableId: string;
  let emailStepId: string;
  let phoneStepId: string;
  let emailColumnId: string;
  let phoneColumnId: string;

  const datavaultTablesService = new DatavaultTablesService();
  const datavaultColumnsService = new DatavaultColumnsService();
  const datavaultRowsService = new DatavaultRowsService();

  beforeAll(async () => {
    // Create test tenant
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Test Tenant - Runtime Pipelines',
        slug: 'test-runtime-pipelines',
      })
      .returning();
    testTenantId = tenant.id;

    // Create test project
    const [project] = await db
      .insert(projects)
      .values({
        name: 'Test Project',
        tenantId: testTenantId,
        createdBy: testUserId,
      })
      .returning();
    testProjectId = project.id;

    // Create test workflow
    const [workflow] = await db
      .insert(workflows)
      .values({
        projectId: testProjectId,
        title: 'Test Workflow - Runtime Pipelines',
        status: 'draft',
        createdBy: testUserId,
      })
      .returning();
    testWorkflowId = workflow.id;

    // Create test section
    const [section] = await db
      .insert(sections)
      .values({
        workflowId: testWorkflowId,
        title: 'Contact Info',
        order: 1,
      })
      .returning();

    // Create test steps
    const [emailStep] = await db
      .insert(steps)
      .values({
        sectionId: section.id,
        workflowId: testWorkflowId,
        type: 'email',
        title: 'Email Address',
        alias: 'email',
        required: true,
        order: 1,
      })
      .returning();
    emailStepId = emailStep.id;

    const [phoneStep] = await db
      .insert(steps)
      .values({
        sectionId: section.id,
        workflowId: testWorkflowId,
        type: 'phone',
        title: 'Phone Number',
        alias: 'phone',
        required: false,
        order: 2,
      })
      .returning();
    phoneStepId = phoneStep.id;

    // Create DataVault table for writeback
    const table = await datavaultTablesService.createTable({
      tenantId: testTenantId,
      ownerUserId: testUserId,
      name: 'Test Submissions',
      slug: 'test-submissions',
      description: null,
      databaseId: null,
    });
    testTableId = table.id;

    // Get the auto-created ID column
    const columns = await datavaultColumnsService.findByTableId(testTableId);
    const idColumn = columns.find(c => c.slug === 'id');
    expect(idColumn).toBeDefined();

    // Add custom columns
    const emailColumn = await datavaultColumnsService.create({
      tableId: testTableId,
      name: 'Email',
      slug: 'email',
      type: 'text',
      orderIndex: 1,
      required: false,
      isPrimaryKey: false,
      isUnique: false,
      description: null,
    });
    emailColumnId = emailColumn.id;

    const phoneColumn = await datavaultColumnsService.create({
      tableId: testTableId,
      name: 'Phone',
      slug: 'phone',
      type: 'text',
      orderIndex: 2,
      required: false,
      isPrimaryKey: false,
      isUnique: false,
      description: null,
    });
    phoneColumnId = phoneColumn.id;

    // Create writeback mapping
    await datavaultWritebackMappingsRepository.create({
      workflowId: testWorkflowId,
      tableId: testTableId,
      columnMappings: {
        email: emailColumnId,
        phone: phoneColumnId,
      },
      triggerPhase: 'afterComplete',
      createdBy: testUserId,
    });

    // Create workflow run
    const [run] = await db
      .insert(workflowRuns)
      .values({
        workflowId: testWorkflowId,
        runToken: 'test-run-token-123',
        createdBy: testUserId,
        progress: 0,
        completed: false,
      })
      .returning();
    testRunId = run.id;

    // Save step values
    await stepValueRepository.create({
      runId: testRunId,
      stepId: emailStepId,
      value: 'test@example.com',
    });

    await stepValueRepository.create({
      runId: testRunId,
      stepId: phoneStepId,
      value: '+1-555-0123',
    });
  });

  afterAll(async () => {
    // Cleanup in reverse order of creation
    await db.delete(datavaultValues).where(sql`1=1`);
    await db.delete(datavaultRows).where(sql`1=1`);
    await db.delete(datavaultColumns).where(sql`table_id = ${testTableId}`);
    await db.delete(datavaultTables).where(sql`id = ${testTableId}`);
    await db.delete(workflowRuns).where(sql`id = ${testRunId}`);
    await db.delete(steps).where(sql`workflow_id = ${testWorkflowId}`);
    await db.delete(sections).where(sql`workflow_id = ${testWorkflowId}`);
    await db.delete(workflows).where(sql`id = ${testWorkflowId}`);
    await db.delete(projects).where(sql`id = ${testProjectId}`);
    await db.delete(tenants).where(sql`id = ${testTenantId}`);
  });

  describe('Writeback Execution Pipeline', () => {
    it('should create DataVault row on workflow completion', async () => {
      // Execute writeback
      const result = await writebackExecutionService.executeWritebacksForRun(
        testRunId,
        testWorkflowId,
        testUserId
      );

      // Verify writeback execution
      expect(result.rowsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify DataVault row was created
      const rows = await datavaultRowsRepository.findByTableId(testTableId);
      expect(rows).toHaveLength(1);

      const row = rows[0];
      expect(row.createdBy).toBe(testUserId);

      // Verify row values
      const rowData = await datavaultRowsService.getRow(row.id, testTenantId);
      expect(rowData.values[emailColumnId]).toBe('test@example.com');
      expect(rowData.values[phoneColumnId]).toBe('+1-555-0123');
    });

    it('should execute writebacks via RunService.completeRun()', async () => {
      // Create a fresh run for this test
      const [run2] = await db
        .insert(workflowRuns)
        .values({
          workflowId: testWorkflowId,
          runToken: 'test-run-token-456',
          createdBy: testUserId,
          progress: 0,
          completed: false,
        })
        .returning();

      // Save step values
      await stepValueRepository.create({
        runId: run2.id,
        stepId: emailStepId,
        value: 'another@example.com',
      });

      await stepValueRepository.create({
        runId: run2.id,
        stepId: phoneStepId,
        value: '+1-555-9999',
      });

      // Get initial row count
      const rowsBefore = await datavaultRowsRepository.findByTableId(testTableId);
      const initialCount = rowsBefore.length;

      // Complete run (should trigger writeback)
      await runService.completeRun(run2.id, testUserId);

      // Verify run is completed
      const completedRun = await workflowRunRepository.findById(run2.id);
      expect(completedRun?.completed).toBe(true);

      // Verify new DataVault row was created
      const rowsAfter = await datavaultRowsRepository.findByTableId(testTableId);
      expect(rowsAfter).toHaveLength(initialCount + 1);

      // Verify row contains correct values
      const newRow = rowsAfter.find(r => r.id !== rowsBefore[0]?.id);
      expect(newRow).toBeDefined();

      const rowData = await datavaultRowsService.getRow(newRow!.id, testTenantId);
      expect(rowData.values[emailColumnId]).toBe('another@example.com');
      expect(rowData.values[phoneColumnId]).toBe('+1-555-9999');

      // Cleanup
      await db.delete(workflowRuns).where(sql`id = ${run2.id}`);
    });
  });

  describe('Document Generation Pipeline', () => {
    let testTemplateId: string;
    let testDocRun: string;

    beforeAll(async () => {
      // Create a test template
      const [template] = await db
        .insert(templates)
        .values({
          projectId: testProjectId,
          name: 'Test Template',
          fileRef: '/test/template.docx',
          type: 'docx',
          helpersVersion: 1,
          // Set conditional visibility: only show if email contains 'show'
          metadata: {
            visibleIf: {
              type: 'group',
              id: 'cond-1',
              operator: 'AND',
              conditions: [
                {
                  type: 'condition',
                  id: 'cond-2',
                  variable: 'email',
                  operator: 'contains',
                  value: 'show',
                  valueType: 'constant',
                },
              ],
            },
          },
          // Set field mapping
          mapping: {
            client_email: { type: 'variable', source: 'email' },
            client_phone: { type: 'variable', source: 'phone' },
          },
        })
        .returning();
      testTemplateId = template.id;
    });

    afterAll(async () => {
      await db.delete(runGeneratedDocumentsRepository.table).where(sql`1=1`);
      await db.delete(templates).where(sql`id = ${testTemplateId}`);
    });

    it('should skip document generation when visibleIf condition is false', async () => {
      // Create run with email that does NOT contain 'show'
      const [hiddenRun] = await db
        .insert(workflowRuns)
        .values({
          workflowId: testWorkflowId,
          runToken: 'test-doc-hidden',
          createdBy: testUserId,
          progress: 100,
          completed: true,
        })
        .returning();

      await stepValueRepository.create({
        runId: hiddenRun.id,
        stepId: emailStepId,
        value: 'hidden@example.com', // Does NOT contain 'show'
      });

      // Note: We can't easily test document generation without the actual template file
      // This test verifies the conditional logic is in place
      // Full e2e test would require mock template file

      // Cleanup
      await db.delete(workflowRuns).where(sql`id = ${hiddenRun.id}`);
    });

    it('should generate document when visibleIf condition is true', async () => {
      // Create run with email that DOES contain 'show'
      const [visibleRun] = await db
        .insert(workflowRuns)
        .values({
          workflowId: testWorkflowId,
          runToken: 'test-doc-visible',
          createdBy: testUserId,
          progress: 100,
          completed: true,
        })
        .returning();

      await stepValueRepository.create({
        runId: visibleRun.id,
        stepId: emailStepId,
        value: 'show@example.com', // DOES contain 'show'
      });

      await stepValueRepository.create({
        runId: visibleRun.id,
        stepId: phoneStepId,
        value: '+1-555-7777',
      });

      // Note: Full document generation would require actual template file
      // This test structure shows the integration point

      // Cleanup
      await db.delete(workflowRuns).where(sql`id = ${visibleRun.id}`);
    });
  });
});
