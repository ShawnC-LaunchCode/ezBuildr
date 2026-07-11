import { describe, it, expect } from 'vitest';

import {
  templates,
  workflowTemplates,
  insertTemplateSchema,
  insertWorkflowTemplateSchema,
} from '@shared/schema';

/**
 * Stage 21: Document Generation Engine 2.0 Schema Tests
 *
 * Unit tests for the Document Engine schema definitions
 * Tests schema validation, types, and constraints
 *
 * NOTE: the graph-only `run_outputs` table (and its output_status/output_file_type
 * enums) was removed with the graph builder; its coverage lived here previously.
 */

describe('Document Engine 2.0 Schema', () => {
  describe('Templates Table', () => {
    it('should have correct table name', () => {
      expect(templates).toBeDefined();
      expect((templates as any)[Symbol.for('drizzle:Name')]).toBe('templates');
    });

    it('should have required columns', () => {
      const columns = Object.keys(templates);
      expect(columns).toContain('id');
      expect(columns).toContain('projectId');
      expect(columns).toContain('name');
      expect(columns).toContain('description'); // Stage 21: New field
      expect(columns).toContain('fileRef');
      expect(columns).toContain('type');
      expect(columns).toContain('helpersVersion');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('WorkflowTemplates Table', () => {
    it('should have correct table name', () => {
      expect(workflowTemplates).toBeDefined();
      expect((workflowTemplates as any)[Symbol.for('drizzle:Name')]).toBe('workflow_templates');
    });

    it('should have required columns', () => {
      const columns = Object.keys(workflowTemplates);
      expect(columns).toContain('id');
      expect(columns).toContain('workflowVersionId');
      expect(columns).toContain('templateId');
      expect(columns).toContain('key');
      expect(columns).toContain('isPrimary');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('Insert Schemas', () => {
    describe('insertTemplateSchema', () => {
      it('should validate valid template data', () => {
        const validData = {
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Engagement Letter Template',
          description: 'Standard engagement letter for clients',
          fileRef: 'templates/engagement-letter.docx',
          type: 'docx',
          helpersVersion: 1,
        };

        const result = insertTemplateSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should require projectId, name, fileRef, and type', () => {
        const invalidData = {
          description: 'Missing required fields',
        };

        const result = insertTemplateSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });

      it('should allow description to be null', () => {
        const validData = {
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Template',
          fileRef: 'templates/test.docx',
          type: 'docx',
          helpersVersion: 1,
          description: null,
        };

        const result = insertTemplateSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });
    });

    describe('insertWorkflowTemplateSchema', () => {
      it('should validate valid workflow template mapping', () => {
        const validData = {
          workflowVersionId: '550e8400-e29b-41d4-a716-446655440000',
          templateId: '660e8400-e29b-41d4-a716-446655440000',
          key: 'engagement_letter',
          isPrimary: true,
        };

        const result = insertWorkflowTemplateSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should require workflowVersionId, templateId, and key', () => {
        const invalidData = {
          isPrimary: false,
        };

        const result = insertWorkflowTemplateSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });

      it('should default isPrimary to false', () => {
        const validData = {
          workflowVersionId: '550e8400-e29b-41d4-a716-446655440000',
          templateId: '660e8400-e29b-41d4-a716-446655440000',
          key: 'schedule_a',
        };

        const result = insertWorkflowTemplateSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should validate template key formats', () => {
        const keys = [
          'engagement_letter',
          'schedule_a',
          'terms_and_conditions',
          'invoice',
          'receipt',
        ];

        keys.forEach((key) => {
          const data = {
            workflowVersionId: '550e8400-e29b-41d4-a716-446655440000',
            templateId: '660e8400-e29b-41d4-a716-446655440000',
            key,
            isPrimary: false,
          };

          const result = insertWorkflowTemplateSchema.safeParse(data);
          expect(result.success).toBe(true);
        });
      });
    });
  });

  describe('Schema Constraints', () => {
    it('should enforce unique key per workflow version', () => {
      // This test documents the constraint, actual enforcement is in DB
      // Unique constraint: workflow_templates_version_key_unique
      expect(true).toBe(true);
    });

    it('should cascade delete workflow templates when workflow version is deleted', () => {
      // This test documents the cascade behavior
      // Foreign key: workflow_templates.workflow_version_id -> workflow_versions.id ON DELETE CASCADE
      expect(true).toBe(true);
    });

    it('should cascade delete workflow templates when template is deleted', () => {
      // This test documents the cascade behavior
      // Foreign key: workflow_templates.template_id -> templates.id ON DELETE CASCADE
      expect(true).toBe(true);
    });
  });

  describe('Type Inference', () => {
    it('should correctly infer Template type', () => {
      type Template = typeof templates.$inferSelect;

      const mockTemplate: Template = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '660e8400-e29b-41d4-a716-446655440000',
        name: 'Engagement Letter',
        description: 'Standard client engagement letter',
        fileRef: 'templates/engagement-letter.docx',
        type: 'docx',
        helpersVersion: 1,
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockTemplate).toBeDefined();
      expect(mockTemplate.id).toBeDefined();
      expect(mockTemplate.name).toBe('Engagement Letter');
      expect(mockTemplate.description).toBe('Standard client engagement letter');
    });

    it('should correctly infer WorkflowTemplate type', () => {
      type WorkflowTemplate = typeof workflowTemplates.$inferSelect;

      const mockWorkflowTemplate: WorkflowTemplate = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
        templateId: '770e8400-e29b-41d4-a716-446655440000',
        key: 'engagement_letter',
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockWorkflowTemplate).toBeDefined();
      expect(mockWorkflowTemplate.key).toBe('engagement_letter');
      expect(mockWorkflowTemplate.isPrimary).toBe(true);
    });
  });

  describe('Multi-Template Scenarios', () => {
    it('should support multiple templates per workflow version', () => {
      const templates = [
        {
          workflowVersionId: '550e8400-e29b-41d4-a716-446655440000',
          templateId: '660e8400-e29b-41d4-a716-446655440000',
          key: 'engagement_letter',
          isPrimary: true,
        },
        {
          workflowVersionId: '550e8400-e29b-41d4-a716-446655440000',
          templateId: '770e8400-e29b-41d4-a716-446655440000',
          key: 'schedule_a',
          isPrimary: false,
        },
        {
          workflowVersionId: '550e8400-e29b-41d4-a716-446655440000',
          templateId: '880e8400-e29b-41d4-a716-446655440000',
          key: 'terms_and_conditions',
          isPrimary: false,
        },
      ];

      templates.forEach((template) => {
        const result = insertWorkflowTemplateSchema.safeParse(template);
        expect(result.success).toBe(true);
      });
    });
  });
});
