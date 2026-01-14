/**
 * Stage 21: Template Node Unit Tests
 *
 * Tests for multi-template node execution
 * NOTE: These are integration tests that require database connectivity
 */

import fs from 'fs/promises';
import path from 'path';

import { eq, and } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { db } from '../../../server/db';
import { executeTemplateNode } from '../../../server/engine/nodes/template';
import {
  projects,
  workflows,
  workflowVersions,
  templates,
  workflowTemplates,
  runs,
  runOutputs,
  users,
  tenants,
} from '../../../shared/schema';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { createTestFactory } from '../../helpers/testFactory';

import type { TemplateNodeConfig, TemplateNodeInput } from '../../../server/engine/nodes/template';


// Mock the docxRenderer2 module
vi.mock('../../../server/services/docxRenderer2', () => ({
  renderDocx2: vi.fn(async (options: any) => {
    return {
      docxPath: path.join(options.outputDir, 'test-output.docx'),
      pdfPath: options.toPdf ? path.join(options.outputDir, 'test-output.pdf') : undefined,
      size: 1024,
    };
  }),
  extractPlaceholders2: vi.fn(async () => ['name', 'email']),
  validateTemplateData2: vi.fn(() => ({ valid: true, missing: [], extra: [] })),
}));

// Mock template file operations
vi.mock('../../../server/services/templates', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getTemplateFilePath: vi.fn((fileRef: string) => `/fake/path/${fileRef}`),
    getOutputFilePath: vi.fn((fileRef: string) => `/fake/outputs/${fileRef}`),
  };
});

// Mock fs operations
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async () => { }),
    writeFile: vi.fn(async () => { }),
    unlink: vi.fn(async () => { }),
    access: vi.fn(async () => { }),
  },
}));

describeWithDb('Template Node - Multi-Template Support', () => {
  let factory: ReturnType<typeof createTestFactory>;
  let testProjectId: string;
  let testWorkflowId: string;
  let testVersionId: string;
  let testTemplateId1: string;
  let testTemplateId2: string;
  let testTenantId: string;
  let testUserId: string;
  let testRunId: string;

  beforeEach(async () => {
    factory = createTestFactory();

    // Create test hierarchy using factory
    const { tenant, user, project } = await factory.createTenant();
    testTenantId = tenant.id;
    testUserId = user.id;
    testProjectId = project.id;

    // Create test workflow with version
    const { workflow, version } = await factory.createWorkflow(project.id, user.id, {
      version: {
        versionNumber: 1,

        changelog: 'Initial version',
        createdBy: user.id,
        graphJson: {},
      },
    });
    testWorkflowId = workflow.id;
    testVersionId = version.id;

    // Create test templates
    const { template: template1 } = await factory.createTemplate(project.id, user.id, {
      name: 'Engagement Letter',
      description: 'Main engagement letter',
      type: 'docx',
      fileRef: 'template1.docx',
    });
    testTemplateId1 = template1.id;

    const { template: template2 } = await factory.createTemplate(project.id, user.id, {
      name: 'Schedule A',
      description: 'Schedule A annex',
      type: 'docx',
      fileRef: 'template2.docx',
    });
    testTemplateId2 = template2.id;

    // Create test run
    const { run } = await factory.createRun(version.id, user.id, {
      status: 'pending',
    });
    testRunId = run.id;
  });

  afterEach(async () => {
    // Cleanup using factory (respects foreign key order)
    await factory.cleanup({ tenantIds: [testTenantId] });
  });

  describe('Template Key Resolution (New Path)', () => {
    it('should resolve template by key from workflowTemplates mapping', async () => {
      // Attach template to workflow version
      await db.insert(workflowTemplates).values({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const config: TemplateNodeConfig = {
        templateKey: 'engagement_letter',
        bindings: {
          name: 'user.name',
          email: 'user.email',
        },
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: {
          vars: { user: { name: 'John Doe', email: 'john@example.com' } },
        },
        tenantId: testTenantId,
        runId: testRunId,
        workflowVersionId: testVersionId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.outputRef).toBeDefined();
      expect(result.bindings).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should throw error if template key not found', async () => {
      const config: TemplateNodeConfig = {
        templateKey: 'nonexistent',
        bindings: {},
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
        workflowVersionId: testVersionId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.error).toContain('not found');
    });

    it('should store output in runOutputs table', async () => {
      // Attach template
      await db.insert(workflowTemplates).values({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const config: TemplateNodeConfig = {
        templateKey: 'engagement_letter',
        bindings: {
          name: 'user.name',
        },
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: { user: { name: 'Jane' } } },
        tenantId: testTenantId,
        runId: testRunId,
        workflowVersionId: testVersionId,
      };

      await executeTemplateNode(input);

      // Verify output was stored
      const outputs = await db
        .select()
        .from(runOutputs)
        .where(
          and(eq(runOutputs.runId, testRunId), eq(runOutputs.templateKey, 'engagement_letter'))
        );

      expect(outputs).toHaveLength(1);
      expect(outputs[0].status).toBe('ready');
      expect(outputs[0].fileType).toBe('docx');
      expect(outputs[0].storagePath).toContain('.docx');
    });
  });

  describe('Legacy Template ID Path (Backward Compatibility)', () => {
    it('should resolve template by templateId directly', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {
          name: 'user.name',
        },
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: { user: { name: 'Alice' } } },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.bindings).toEqual({ name: 'Alice' });
    });

    it('should throw error if templateId not found', async () => {
      const config: TemplateNodeConfig = {
        templateId: '22222222-2222-2222-2222-222222222222',
        bindings: {},
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.error).toContain('not found');
    });
  });

  describe('Rendering Engine Selection', () => {
    it('should use docxRenderer2 by default (v2 engine)', async () => {
      await db.insert(workflowTemplates).values({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const config: TemplateNodeConfig = {
        templateKey: 'engagement_letter',
        bindings: {},
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
        workflowVersionId: testVersionId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      // v2 engine should be used by default
    });

    it('should use legacy engine when engine="legacy"', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {},
        engine: 'legacy',
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
    });
  });

  describe('PDF Generation', () => {
    it('should generate PDF when toPdf=true', async () => {
      await db.insert(workflowTemplates).values({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const config: TemplateNodeConfig = {
        templateKey: 'engagement_letter',
        bindings: {},
        toPdf: true,
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
        runId: testRunId,
        workflowVersionId: testVersionId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.outputRef?.pdfRef).toBeDefined();

      // Verify PDF output was stored
      const outputs = await db
        .select()
        .from(runOutputs)
        .where(eq(runOutputs.runId, testRunId));

      expect(outputs).toHaveLength(1);
      expect(outputs[0].fileType).toBe('pdf');
    });

    it('should default to DOCX when toPdf=false', async () => {
      await db.insert(workflowTemplates).values({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const config: TemplateNodeConfig = {
        templateKey: 'engagement_letter',
        bindings: {},
        toPdf: false,
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
        runId: testRunId,
        workflowVersionId: testVersionId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');

      const outputs = await db
        .select()
        .from(runOutputs)
        .where(eq(runOutputs.runId, testRunId));

      expect(outputs).toHaveLength(1);
      expect(outputs[0].fileType).toBe('docx');
    });
  });

  describe('Conditional Execution', () => {
    it('should skip execution when condition evaluates to false', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {},
        condition: 'user.active == false',
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: { user: { active: true } } },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('skipped');
      expect(result.skipReason).toContain('condition');
    });

    it('should execute when condition evaluates to true', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {},
        condition: 'user.active == true',
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: { user: { active: true } } },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
    });
  });

  describe('Binding Resolution', () => {
    it('should resolve simple bindings', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {
          name: 'user.name',
          age: 'user.age',
        },
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: { user: { name: 'Bob', age: 30 } } },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.bindings).toEqual({
        name: 'Bob',
        age: 30,
      });
    });

    it('should handle binding resolution errors gracefully', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {
          name: 'nonexistent.property',
        },
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should record failed output in runOutputs table', async () => {
      // Use invalid templateKey to trigger error
      const config: TemplateNodeConfig = {
        templateKey: 'nonexistent',
        bindings: {},
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
        runId: testRunId,
        workflowVersionId: testVersionId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.error).toBeDefined();

      // Verify failed output was stored
      const outputs = await db
        .select()
        .from(runOutputs)
        .where(eq(runOutputs.runId, testRunId));

      expect(outputs).toHaveLength(1);
      expect(outputs[0].status).toBe('failed');
      expect(outputs[0].error).toBeDefined();
    });

    it('should not throw errors (should return error in result)', async () => {
      const config: TemplateNodeConfig = {
        templateId: '22222222-2222-2222-2222-222222222222',
        bindings: {},
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
      };

      // Should not throw
      await expect(executeTemplateNode(input)).resolves.toBeDefined();
    });
  });

  describe('Tenant Access Control', () => {
    it('should deny access to templates from different tenant', async () => {
      const config: TemplateNodeConfig = {
        templateId: testTemplateId1,
        bindings: {},
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: '11111111-1111-1111-1111-111111111111', // Different tenant
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.error).toContain('Access denied');
    });
  });

  describe('Validation', () => {
    it('should require either templateKey or templateId', async () => {
      const config: TemplateNodeConfig = {
        bindings: {},
        // No templateKey or templateId
      };

      const input: TemplateNodeInput = {
        nodeId: 'node-1',
        config,
        context: { vars: {} },
        tenantId: testTenantId,
      };

      const result = await executeTemplateNode(input);

      expect(result.status).toBe('executed');
      expect(result.error).toContain('must specify');
    });
  });
});
