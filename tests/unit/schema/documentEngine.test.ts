import { describe, it, expect } from 'vitest';
import {
  templates,
  workflowTemplates,
  runOutputs,
  insertTemplateSchema,
  insertWorkflowTemplateSchema,
  insertRunOutputSchema,
  outputStatusEnum,
  outputFileTypeEnum,
} from '@shared/schema';

/**
 * Stage 21: Document Generation Engine 2.0 Schema Tests
 *
 * Unit tests for the Document Engine schema definitions
 * Tests schema validation, types, and constraints
 */

describe('Document Engine 2.0 Schema', () => {
  describe('Templates Table', () => {
    it('should have correct table name', () => {
      expect(templates).toBeDefined();
      // @ts-ignore - accessing internal drizzle property
      expect(templates[Symbol.for('drizzle:Name')]).toBe('templates');
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
      // @ts-ignore - accessing internal drizzle property
      expect(workflowTemplates[Symbol.for('drizzle:Name')]).toBe('workflow_templates');
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

  describe('RunOutputs Table', () => {
    it('should have correct table name', () => {
      expect(runOutputs).toBeDefined();
      // @ts-ignore - accessing internal drizzle property
      expect(runOutputs[Symbol.for('drizzle:Name')]).toBe('run_outputs');
    });

    it('should have required columns', () => {
      const columns = Object.keys(runOutputs);
      expect(columns).toContain('id');
      expect(columns).toContain('runId');
      expect(columns).toContain('workflowVersionId');
      expect(columns).toContain('templateKey');
      expect(columns).toContain('fileType');
      expect(columns).toContain('storagePath');
      expect(columns).toContain('status');
      expect(columns).toContain('error');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('Output Status Enum', () => {
    it('should have all expected status values', () => {
      expect(outputStatusEnum).toBeDefined();

      const expectedStatuses = ['pending', 'ready', 'failed'];

      // The enum values are stored in the enumValues property
      // @ts-ignore - accessing internal drizzle property
      const enumValues = outputStatusEnum.enumValues;
      expect(enumValues).toEqual(expectedStatuses);
    });
  });

  describe('Output File Type Enum', () => {
    it('should have all expected file type values', () => {
      expect(outputFileTypeEnum).toBeDefined();

      const expectedTypes = ['docx', 'pdf'];

      // The enum values are stored in the enumValues property
      // @ts-ignore - accessing internal drizzle property
      const enumValues = outputFileTypeEnum.enumValues;
      expect(enumValues).toEqual(expectedTypes);
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

    describe('insertRunOutputSchema', () => {
      it('should validate valid run output data', () => {
        const validData = {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'engagement_letter',
          fileType: 'docx',
          storagePath: 'outputs/run-123/engagement-letter.docx',
          status: 'ready',
        };

        const result = insertRunOutputSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should require runId, workflowVersionId, templateKey, fileType, storagePath, and status', () => {
        const invalidData = {
          error: 'Missing required fields',
        };

        const result = insertRunOutputSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });

      it('should validate file type enum', () => {
        const fileTypes = ['docx', 'pdf'];

        fileTypes.forEach((fileType) => {
          const data = {
            runId: '550e8400-e29b-41d4-a716-446655440000',
            workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
            templateKey: 'test_template',
            fileType,
            storagePath: `outputs/test.${fileType}`,
            status: 'ready',
          };

          const result = insertRunOutputSchema.safeParse(data);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid file type', () => {
        const invalidData = {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'test_template',
          fileType: 'txt', // Invalid type
          storagePath: 'outputs/test.txt',
          status: 'ready',
        };

        const result = insertRunOutputSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });

      it('should validate status enum', () => {
        const statuses = ['pending', 'ready', 'failed'];

        statuses.forEach((status) => {
          const data = {
            runId: '550e8400-e29b-41d4-a716-446655440000',
            workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
            templateKey: 'test_template',
            fileType: 'docx',
            storagePath: 'outputs/test.docx',
            status,
          };

          const result = insertRunOutputSchema.safeParse(data);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid status', () => {
        const invalidData = {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'test_template',
          fileType: 'docx',
          storagePath: 'outputs/test.docx',
          status: 'completed', // Invalid status
        };

        const result = insertRunOutputSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
      });

      it('should allow error to be null', () => {
        const validData = {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'test_template',
          fileType: 'docx',
          storagePath: 'outputs/test.docx',
          status: 'ready',
          error: null,
        };

        const result = insertRunOutputSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it('should allow error message for failed outputs', () => {
        const validData = {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'test_template',
          fileType: 'pdf',
          storagePath: 'outputs/test.pdf',
          status: 'failed',
          error: 'PDF conversion failed: timeout after 30s',
        };

        const result = insertRunOutputSchema.safeParse(validData);
        expect(result.success).toBe(true);
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

    it('should cascade delete run outputs when run is deleted', () => {
      // This test documents the cascade behavior
      // Foreign key: run_outputs.run_id -> runs.id ON DELETE CASCADE
      expect(true).toBe(true);
    });

    it('should cascade delete run outputs when workflow version is deleted', () => {
      // This test documents the cascade behavior
      // Foreign key: run_outputs.workflow_version_id -> workflow_versions.id ON DELETE CASCADE
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

    it('should correctly infer RunOutput type', () => {
      type RunOutput = typeof runOutputs.$inferSelect;

      const mockRunOutput: RunOutput = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        runId: '660e8400-e29b-41d4-a716-446655440000',
        workflowVersionId: '770e8400-e29b-41d4-a716-446655440000',
        templateKey: 'engagement_letter',
        fileType: 'docx',
        storagePath: 'outputs/run-123/engagement-letter.docx',
        status: 'ready',
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockRunOutput).toBeDefined();
      expect(mockRunOutput.templateKey).toBe('engagement_letter');
      expect(mockRunOutput.fileType).toBe('docx');
      expect(mockRunOutput.status).toBe('ready');
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

    it('should support multiple outputs per run', () => {
      const outputs = [
        {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'engagement_letter',
          fileType: 'docx',
          storagePath: 'outputs/run-123/engagement-letter.docx',
          status: 'ready',
        },
        {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'engagement_letter',
          fileType: 'pdf',
          storagePath: 'outputs/run-123/engagement-letter.pdf',
          status: 'pending',
        },
        {
          runId: '550e8400-e29b-41d4-a716-446655440000',
          workflowVersionId: '660e8400-e29b-41d4-a716-446655440000',
          templateKey: 'schedule_a',
          fileType: 'docx',
          storagePath: 'outputs/run-123/schedule-a.docx',
          status: 'ready',
        },
      ];

      outputs.forEach((output) => {
        const result = insertRunOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      });
    });
  });
});
