/**
 * Stage 21: WorkflowTemplateService Unit Tests
 *
 * Tests for workflow template mapping business logic
 *
 * NOTE: These are integration tests that require database connectivity
 */
import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { db } from '../../../server/db';
import { documentTemplateService } from '../../../server/services/DocumentTemplateService';
import { WorkflowTemplateService } from '../../../server/services/WorkflowTemplateService';
import { createError } from '../../../server/utils/errors';
import {    projects } from '../../../shared/schema';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { createTestFactory } from '../../helpers/testFactory';
// Mock DocumentTemplateService
vi.mock('../../../server/services/DocumentTemplateService', () => ({
  documentTemplateService: {
    getTemplate: vi.fn(),
  },
}));
describeWithDb('WorkflowTemplateService', () => {
  let factory: ReturnType<typeof createTestFactory>;
  let service: WorkflowTemplateService;
  let testUserId: string;
  let testTenantId: string;
  let testProjectId: string;
  let testWorkflowId: string;
  let testVersionId: string;
  let testTemplateId1: string;
  let testTemplateId2: string;
  const nonExistentId = randomUUID(); // Use unique ID for non-existent entity tests
  beforeEach(async () => {
    factory = createTestFactory();
    service = new WorkflowTemplateService();
    // Create test hierarchy using factory
    const { tenant, user, project } = await factory.createTenant();
    testTenantId = tenant.id;
    testUserId = user.id;
    testProjectId = project.id;
    // Create test workflow with version
    const { workflow, version } = await factory.createWorkflow(project.id, user.id, {
      workflow: {
        name: 'Test Workflow',
      },
      version: {
        graphJson: {},
        createdBy: user.id,
      },
    });
    testWorkflowId = workflow.id;
    testVersionId = version.id;
    // Create test templates
    const { template: template1 } = await factory.createTemplate(project.id, user.id, {
      name: 'Template 1',
      description: 'First test template',
      type: 'docx',
      fileRef: '/uploads/template1.docx',
    });
    testTemplateId1 = template1.id;
    const { template: template2 } = await factory.createTemplate(project.id, user.id, {
      name: 'Template 2',
      description: 'Second test template',
      type: 'docx',
      fileRef: '/uploads/template2.docx',
    });
    testTemplateId2 = template2.id;
    // Mock getTemplate to return valid template
    vi.mocked(documentTemplateService.getTemplate).mockResolvedValue({
      id: testTemplateId1,
      projectId: testProjectId,
      name: 'Template 1',
      type: 'docx',
      fileRef: '/uploads/template1.docx',
      createdAt: new Date(),
      updatedAt: new Date(),
      description: 'Test template',
      helpersVersion: 1,
      metadata: {},
      mapping: {},
      currentVersion: 1,
      lastModifiedBy: testUserId,
    });
  });
  afterEach(async () => {
    // Cleanup using factory (respects foreign key order)
    await factory.cleanup({ tenantIds: [testTenantId] });
    vi.clearAllMocks();
  });
  describe('attachTemplate', () => {
    it('should throw error if template belongs to different project', async () => {
      // Create another project
      const [otherProject] = await db
        .insert(projects)
        .values({
          name: 'Other Project',
          title: 'Other Project',
          description: 'Another project',
          creatorId: testUserId,
          createdBy: testUserId,
          ownerId: testUserId,
        })
        .returning();
      // Mock getTemplate to throw for this project
      vi.mocked(documentTemplateService.getTemplate).mockRejectedValueOnce(
        createError.notFound('Template not found')
      );
      await expect(
        service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: otherProject.id,
          key: 'engagement_letter',
          isPrimary: false,
        })
      ).rejects.toThrow('not found');
      // Cleanup
      await db.delete(projects).where(eq(projects.id, otherProject.id));
    });
    it('should automatically unset other primaries when setting new primary', async () => {
      // Attach first template as primary
      const first = await service.attachTemplate({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        projectId: testProjectId,
        key: 'first',
        isPrimary: true,
      });
      // Attach second template as non-primary
      const second = await service.attachTemplate({
        workflowVersionId: testVersionId,
        templateId: testTemplateId2,
        projectId: testProjectId,
        key: 'second',
        isPrimary: false,
      });
      // Set second as primary
      await service.setPrimaryTemplate(second.id, testVersionId);
      // First should no longer be primary
      const firstUpdated = await service.getTemplateMapping(first.id, testVersionId);
      expect(firstUpdated.isPrimary).toBe(false);
      // Second should be primary
      const secondUpdated = await service.getTemplateMapping(second.id, testVersionId);
      expect(secondUpdated.isPrimary).toBe(true);
    });
    describe('listTemplates', () => {
      it('should list all templates for workflow version', async () => {
        await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: true,
        });
        await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId2,
          projectId: testProjectId,
          key: 'schedule_a',
          isPrimary: false,
        });
        const templates = await service.listTemplates(testVersionId);
        expect(templates).toHaveLength(2);
        expect(templates.map(t => t.key).sort()).toEqual(['engagement_letter', 'schedule_a']);
      });
      it('should return empty array for version with no templates', async () => {
        const templates = await service.listTemplates(testVersionId);
        expect(templates).toEqual([]);
      });
    });
    describe('getTemplateMapping', () => {
      it('should get template mapping by id and version', async () => {
        const created = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: true,
        });
        const found = await service.getTemplateMapping(created.id, testVersionId);
        expect(found).toBeDefined();
        expect(found.id).toBe(created.id);
        expect(found.key).toBe('engagement_letter');
      });
      it('should throw error if mapping not found', async () => {
        await expect(
          service.getTemplateMapping(nonExistentId, testVersionId)
        ).rejects.toThrow('not found');
      });
    });
    describe('getTemplateByKey', () => {
      it('should get template by key', async () => {
        await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: true,
        });
        const found = await service.getTemplateByKey(testVersionId, 'engagement_letter');
        expect(found).toBeDefined();
        expect(found.key).toBe('engagement_letter');
        expect(found.templateId).toBe(testTemplateId1);
      });
      it('should throw error if key not found', async () => {
        await expect(
          service.getTemplateByKey(testVersionId, 'nonexistent')
        ).rejects.toThrow('not found');
      });
    });
    describe('getPrimaryTemplate', () => {
      it('should get primary template for workflow version', async () => {
        const primary = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: true,
        });
        await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId2,
          projectId: testProjectId,
          key: 'schedule_a',
          isPrimary: false,
        });
        const found = await service.getPrimaryTemplate(testVersionId);
        expect(found).toBeDefined();
        expect(found!.id).toBe(primary.id);
        expect(found!.isPrimary).toBe(true);
      });
      it('should return null when no primary template exists', async () => {
        await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'schedule_a',
          isPrimary: false,
        });
        const found = await service.getPrimaryTemplate(testVersionId);
        expect(found).toBeNull();
      });
    });
    describe('updateTemplateMapping', () => {
      it('should update mapping key', async () => {
        const mapping = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: false,
        });
        const updated = await service.updateTemplateMapping(
          mapping.id,
          testVersionId,
          { key: 'engagement_letter_v2' }
        );
        expect(updated.key).toBe('engagement_letter_v2');
      });
      it('should update isPrimary flag', async () => {
        const mapping = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: false,
        });
        const updated = await service.updateTemplateMapping(
          mapping.id,
          testVersionId,
          { isPrimary: true }
        );
        expect(updated.isPrimary).toBe(true);
      });
      it('should throw error if new key already exists', async () => {
        const first = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'first',
          isPrimary: false,
        });
        await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId2,
          projectId: testProjectId,
          key: 'second',
          isPrimary: false,
        });
        await expect(
          service.updateTemplateMapping(first.id, testVersionId, { key: 'second' })
        ).rejects.toThrow('already exists');
      });
      it('should throw error if mapping not found', async () => {
        await expect(
          service.updateTemplateMapping(nonExistentId, testVersionId, { key: 'new_key' })
        ).rejects.toThrow('not found');
      });
      it('should unset other primaries when setting isPrimary to true', async () => {
        const first = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'first',
          isPrimary: true,
        });
        const second = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId2,
          projectId: testProjectId,
          key: 'second',
          isPrimary: false,
        });
        await service.updateTemplateMapping(second.id, testVersionId, { isPrimary: true });
        // First should no longer be primary
        const firstUpdated = await service.getTemplateMapping(first.id, testVersionId);
        expect(firstUpdated.isPrimary).toBe(false);
        // Second should be primary
        const secondUpdated = await service.getTemplateMapping(second.id, testVersionId);
        expect(secondUpdated.isPrimary).toBe(true);
      });
    });
    describe('detachTemplate', () => {
      it('should detach template from workflow version', async () => {
        const mapping = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'engagement_letter',
          isPrimary: true,
        });
        await service.detachTemplate(mapping.id, testVersionId);
        await expect(
          service.getTemplateMapping(mapping.id, testVersionId)
        ).rejects.toThrow('not found');
      });
      it('should throw error if mapping not found', async () => {
        await expect(
          service.detachTemplate(nonExistentId, testVersionId)
        ).rejects.toThrow('not found');
      });
    });
    describe('setPrimaryTemplate', () => {
      it('should set template as primary', async () => {
        const first = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId1,
          projectId: testProjectId,
          key: 'first',
          isPrimary: true,
        });
        const second = await service.attachTemplate({
          workflowVersionId: testVersionId,
          templateId: testTemplateId2,
          projectId: testProjectId,
          key: 'second',
          isPrimary: false,
        });
        const updated = await service.setPrimaryTemplate(second.id, testVersionId);
        expect(updated.isPrimary).toBe(true);
        // First should no longer be primary
        const firstUpdated = await service.getTemplateMapping(first.id, testVersionId);
        expect(firstUpdated.isPrimary).toBe(false);
      });
      it('should throw error if mapping not found', async () => {
        await expect(
          service.setPrimaryTemplate(nonExistentId, testVersionId)
        ).rejects.toThrow('not found');
      });
    });
    describe('transaction support', () => {
      it('should support operations within a transaction', async () => {
        await db.transaction(async (tx) => {
          const mapping = await service.attachTemplate({
            workflowVersionId: testVersionId,
            templateId: testTemplateId1,
            projectId: testProjectId,
            key: 'engagement_letter',
            isPrimary: true,
          }, tx);
          expect(mapping).toBeDefined();
          const found = await service.getTemplateMapping(mapping.id, testVersionId, tx);
          expect(found).toBeDefined();
        });
      });
      it('should rollback on transaction error', async () => {
        let mappingId: string | undefined;
        try {
          await db.transaction(async (tx) => {
            const mapping = await service.attachTemplate({
              workflowVersionId: testVersionId,
              templateId: testTemplateId1,
              projectId: testProjectId,
              key: 'engagement_letter',
              isPrimary: true,
            }, tx);
            mappingId = mapping.id;
            // Force error
            throw new Error('Intentional rollback');
          });
        } catch (error) {
          // Expected error
        }
        // Mapping should not exist outside transaction
        if (mappingId) {
          await expect(
            service.getTemplateMapping(mappingId, testVersionId)
          ).rejects.toThrow('not found');
        }
      });
    });
  });
});