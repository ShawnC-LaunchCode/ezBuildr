/**
 * Stage 21: WorkflowTemplateRepository Unit Tests
 *
 * Tests for workflow template mapping repository operations
 * NOTE: These are integration tests that require database connectivity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { db } from '../../../server/db';
import { workflowTemplates, workflowVersions, workflows, projects, templates, users } from '../../../shared/schema';
import { WorkflowTemplateRepository } from '../../../server/repositories/WorkflowTemplateRepository';
import { eq } from 'drizzle-orm';

describeWithDb('WorkflowTemplateRepository', () => {
  const repo = new WorkflowTemplateRepository();

  let testProjectId: string;
  let testWorkflowId: string;
  let testVersionId: string;
  let testTemplateId1: string;
  let testTemplateId2: string;
  let testUserId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: 'test@example.com',
        role: 'creator',
      })
      .returning();
    testUserId = user.id;

    // Create test project
    const [project] = await db
      .insert(projects)
      .values({
        name: 'Test Project',
        title: 'Test Project',
        description: 'Test project for workflow templates',
        creatorId: testUserId,
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
        version: '1.0.0',
        status: 'draft',
        changelog: 'Initial version',
        createdBy: testUserId,
        graphJson: {},
      })
      .returning();
    testVersionId = version.id;

    // Create test templates
    const [template1] = await db
      .insert(templates)
      .values({
        projectId: testProjectId,
        name: 'Template 1',
        description: 'First test template',
        type: 'docx',
        fileRef: '/uploads/template1.docx',
      })
      .returning();
    testTemplateId1 = template1.id;

    const [template2] = await db
      .insert(templates)
      .values({
        projectId: testProjectId,
        name: 'Template 2',
        description: 'Second test template',
        type: 'docx',
        fileRef: '/uploads/template2.docx',
      })
      .returning();
    testTemplateId2 = template2.id;
  });

  afterEach(async () => {
    // Cleanup in reverse order of dependencies
    await db.delete(workflowTemplates).where(eq(workflowTemplates.workflowVersionId, testVersionId));
    await db.delete(workflowVersions).where(eq(workflowVersions.id, testVersionId));
    await db.delete(workflows).where(eq(workflows.id, testWorkflowId));
    await db.delete(templates).where(eq(templates.projectId, testProjectId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
  });

  describe('create', () => {
    it('should create a workflow template mapping', async () => {
      const mapping = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      expect(mapping).toBeDefined();
      expect(mapping.id).toBeDefined();
      expect(mapping.workflowVersionId).toBe(testVersionId);
      expect(mapping.templateId).toBe(testTemplateId1);
      expect(mapping.key).toBe('engagement_letter');
      expect(mapping.isPrimary).toBe(true);
      expect(mapping.createdAt).toBeDefined();
    });

    it('should create non-primary mapping by default', async () => {
      const mapping = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'schedule_a',
      });

      expect(mapping.isPrimary).toBe(false);
    });
  });

  describe('findByWorkflowVersionId', () => {
    it('should find all templates for a workflow version', async () => {
      // Create multiple mappings
      await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId2,
        key: 'schedule_a',
        isPrimary: false,
      });

      const mappings = await repo.findByWorkflowVersionId(testVersionId);

      expect(mappings).toHaveLength(2);
      expect(mappings.map(m => m.key).sort()).toEqual(['engagement_letter', 'schedule_a']);
    });

    it('should return empty array for version with no templates', async () => {
      const mappings = await repo.findByWorkflowVersionId(testVersionId);
      expect(mappings).toEqual([]);
    });

    it('should order by createdAt desc (newest first)', async () => {
      const first = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'first',
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const second = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId2,
        key: 'second',
      });

      const mappings = await repo.findByWorkflowVersionId(testVersionId);

      expect(mappings).toHaveLength(2);
      expect(mappings[0].key).toBe('second'); // Newest first
      expect(mappings[1].key).toBe('first');
    });
  });

  describe('findByWorkflowVersionAndKey', () => {
    it('should find mapping by workflow version and key', async () => {
      const created = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const found = await repo.findByWorkflowVersionAndKey(testVersionId, 'engagement_letter');

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.key).toBe('engagement_letter');
    });

    it('should return undefined for non-existent key', async () => {
      const found = await repo.findByWorkflowVersionAndKey(testVersionId, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findPrimaryByWorkflowVersionId', () => {
    it('should find primary template for workflow version', async () => {
      const primary = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId2,
        key: 'schedule_a',
        isPrimary: false,
      });

      const found = await repo.findPrimaryByWorkflowVersionId(testVersionId);

      expect(found).toBeDefined();
      expect(found!.id).toBe(primary.id);
      expect(found!.isPrimary).toBe(true);
    });

    it('should return undefined when no primary template exists', async () => {
      await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'schedule_a',
        isPrimary: false,
      });

      const found = await repo.findPrimaryByWorkflowVersionId(testVersionId);
      expect(found).toBeUndefined();
    });
  });

  describe('setPrimary', () => {
    it('should set a template as primary and unset others', async () => {
      const first = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'first',
        isPrimary: true,
      });

      const second = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId2,
        key: 'second',
        isPrimary: false,
      });

      // Set second as primary
      await repo.setPrimary(second.id, testVersionId);

      // Verify first is no longer primary
      const firstUpdated = await repo.findById(first.id);
      expect(firstUpdated!.isPrimary).toBe(false);

      // Verify second is now primary
      const secondUpdated = await repo.findById(second.id);
      expect(secondUpdated!.isPrimary).toBe(true);
    });

    it('should handle setting primary when none existed before', async () => {
      const mapping = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'first',
        isPrimary: false,
      });

      await repo.setPrimary(mapping.id, testVersionId);

      const updated = await repo.findById(mapping.id);

      const deleted = await repo.deleteByIdAndWorkflowVersion(mapping.id, testVersionId);

      expect(deleted).toBe(true);
      const found = await repo.findById(mapping.id);
      expect(found).toBeUndefined();
    });

    it('should not delete mapping if workflow version does not match', async () => {
      // Create another version
      const [anotherVersion] = await db
        .insert(workflowVersions)
        .values({
          workflowId: testWorkflowId,
          version: '1.0.1',
          status: 'draft',
          changelog: 'Another version',
          createdBy: testUserId,
          graphJson: {},
        })
        .returning();

      const mapping = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      // Try to delete with wrong version ID
      const deleted = await repo.deleteByIdAndWorkflowVersion(mapping.id, anotherVersion.id);
      expect(deleted).toBe(false);

      // Mapping should still exist
      const found = await repo.findById(mapping.id);
      expect(found).toBeDefined();

      // Cleanup
      await db.delete(workflowVersions).where(eq(workflowVersions.id, anotherVersion.id));
    });
  });

  describe('existsByKey', () => {
    it('should return true if key exists in workflow version', async () => {
      await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const exists = await repo.existsByKey(testVersionId, 'engagement_letter');
      expect(exists).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      const exists = await repo.existsByKey(testVersionId, 'nonexistent');
      expect(exists).toBe(false);
    });

    it('should exclude specified id when checking existence', async () => {
      const mapping = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      // Should return false because we're excluding the only mapping with this key
      const exists = await repo.existsByKey(testVersionId, 'engagement_letter', mapping.id);
      expect(exists).toBe(false);
    });

    it('should return true if key exists on different mapping', async () => {
      const first = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'first',
        isPrimary: true,
      });

      const second = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId2,
        key: 'engagement_letter',
        isPrimary: false,
      });

      // Check if 'engagement_letter' exists, excluding first mapping
      const exists = await repo.existsByKey(testVersionId, 'engagement_letter', first.id);
      expect(exists).toBe(true);
    });
  });

  describe('update', () => {
    it('should update mapping fields', async () => {
      const mapping = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: false,
      });

      const updated = await repo.update(mapping.id, {
        key: 'engagement_letter_v2',
        isPrimary: true,
      });

      expect(updated).toBeDefined();
      expect(updated!.key).toBe('engagement_letter_v2');
      expect(updated!.isPrimary).toBe(true);
      expect(updated!.updatedAt).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find mapping by id', async () => {
      const created = await repo.create({
        workflowVersionId: testVersionId,
        templateId: testTemplateId1,
        key: 'engagement_letter',
        isPrimary: true,
      });

      const found = await repo.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.key).toBe('engagement_letter');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeUndefined();
    });
  });
});
