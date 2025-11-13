import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailTemplateMetadataService } from '../../../server/services/EmailTemplateMetadataService';
import { db } from '../../../server/db';
import type { EmailTemplateMetadata } from '@shared/types/branding';

/**
 * Stage 17: EmailTemplateMetadataService Tests
 *
 * Unit tests for the EmailTemplateMetadataService class
 * Tests email template metadata registry operations
 */

// Mock the database
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../../server/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('EmailTemplateMetadataService', () => {
  let service: EmailTemplateMetadataService;

  beforeEach(() => {
    service = new EmailTemplateMetadataService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('listEmailTemplates', () => {
    it('should return all email templates', async () => {
      const mockTemplates: EmailTemplateMetadata[] = [
        {
          id: 'template-1',
          templateKey: 'workflow_invitation',
          name: 'Workflow Invitation',
          description: 'Invitation to complete a workflow',
          subjectPreview: 'You have been invited',
          brandingTokens: { logoUrl: true, primaryColor: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-2',
          templateKey: 'workflow_reminder',
          name: 'Workflow Reminder',
          description: 'Reminder for incomplete workflow',
          subjectPreview: 'Reminder: Complete your workflow',
          brandingTokens: { logoUrl: true, primaryColor: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockResolvedValue(mockTemplates),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.listEmailTemplates();

      expect(result).toEqual(mockTemplates);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no templates exist', async () => {
      const mockSelect = {
        from: vi.fn().mockResolvedValue([]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.listEmailTemplates();

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      const mockSelect = {
        from: vi.fn().mockRejectedValue(new Error('Database error')),
      };

      (db.select as any).mockReturnValue(mockSelect);

      await expect(service.listEmailTemplates()).rejects.toThrow('Database error');
    });
  });

  describe('getTemplateById', () => {
    it('should return template when found', async () => {
      const mockTemplate: EmailTemplateMetadata = {
        id: 'template-1',
        templateKey: 'workflow_invitation',
        name: 'Workflow Invitation',
        description: 'Invitation to complete a workflow',
        subjectPreview: 'You have been invited',
        brandingTokens: { logoUrl: true, primaryColor: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockTemplate]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplateById('template-1');

      expect(result).toEqual(mockTemplate);
    });

    it('should return null when template not found', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplateById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Connection error')),
      };

      (db.select as any).mockReturnValue(mockSelect);

      await expect(service.getTemplateById('template-1')).rejects.toThrow('Connection error');
    });
  });

  describe('getTemplateByKey', () => {
    it('should return template when found by key', async () => {
      const mockTemplate: EmailTemplateMetadata = {
        id: 'template-1',
        templateKey: 'workflow_invitation',
        name: 'Workflow Invitation',
        description: 'Invitation email',
        subjectPreview: null,
        brandingTokens: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockTemplate]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplateByKey('workflow_invitation');

      expect(result).toEqual(mockTemplate);
    });

    it('should return null when template key not found', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplateByKey('nonexistent_key');

      expect(result).toBeNull();
    });
  });

  describe('updateTemplateMetadata', () => {
    it('should update template metadata successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        description: 'Updated description',
        subjectPreview: 'New subject line',
        brandingTokens: { logoUrl: true, accentColor: true },
      };

      const mockUpdated: EmailTemplateMetadata = {
        id: 'template-1',
        templateKey: 'workflow_invitation',
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUpdated]),
      };

      (db.update as any).mockReturnValue(mockUpdate);

      const result = await service.updateTemplateMetadata('template-1', updateData);

      expect(result).toEqual(mockUpdated);
      expect(mockUpdate.set).toHaveBeenCalled();
    });

    it('should allow partial updates', async () => {
      const partialUpdate = {
        name: 'New Name Only',
      };

      const mockUpdated: EmailTemplateMetadata = {
        id: 'template-1',
        templateKey: 'workflow_invitation',
        name: 'New Name Only',
        description: 'Old description',
        subjectPreview: 'Old subject',
        brandingTokens: { logoUrl: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUpdated]),
      };

      (db.update as any).mockReturnValue(mockUpdate);

      const result = await service.updateTemplateMetadata('template-1', partialUpdate);

      expect(result.name).toBe('New Name Only');
    });

    it('should throw error when template not found', async () => {
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };

      (db.update as any).mockReturnValue(mockUpdate);

      await expect(
        service.updateTemplateMetadata('nonexistent-id', { name: 'Test' })
      ).rejects.toThrow('Template not found');
    });

    it('should handle null values in metadata', async () => {
      const updateData = {
        description: null,
        subjectPreview: null,
        brandingTokens: null,
      };

      const mockUpdated: EmailTemplateMetadata = {
        id: 'template-1',
        templateKey: 'workflow_invitation',
        name: 'Template Name',
        description: null,
        subjectPreview: null,
        brandingTokens: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUpdated]),
      };

      (db.update as any).mockReturnValue(mockUpdate);

      const result = await service.updateTemplateMetadata('template-1', updateData);

      expect(result.description).toBeNull();
      expect(result.subjectPreview).toBeNull();
      expect(result.brandingTokens).toBeNull();
    });
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      const templateData = {
        templateKey: 'custom_template',
        name: 'Custom Template',
        description: 'A custom email template',
        subjectPreview: 'Custom subject',
        brandingTokens: { logoUrl: true, primaryColor: true },
      };

      const mockCreated: EmailTemplateMetadata = {
        id: 'template-new',
        ...templateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockCreated]),
      };

      (db.insert as any).mockReturnValue(mockInsert);

      const result = await service.createTemplate(templateData);

      expect(result).toEqual(mockCreated);
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'custom_template',
          name: 'Custom Template',
        })
      );
    });

    it('should throw error when template key already exists', async () => {
      const templateData = {
        templateKey: 'existing_key',
        name: 'Test Template',
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue({ code: '23505' }), // Unique constraint
      };

      (db.insert as any).mockReturnValue(mockInsert);

      await expect(service.createTemplate(templateData)).rejects.toThrow(
        'Template key already exists'
      );
    });

    it('should handle optional fields', async () => {
      const minimalData = {
        templateKey: 'minimal_template',
        name: 'Minimal Template',
      };

      const mockCreated: EmailTemplateMetadata = {
        id: 'template-minimal',
        templateKey: 'minimal_template',
        name: 'Minimal Template',
        description: null,
        subjectPreview: null,
        brandingTokens: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockCreated]),
      };

      (db.insert as any).mockReturnValue(mockInsert);

      const result = await service.createTemplate(minimalData);

      expect(result.description).toBeNull();
      expect(result.subjectPreview).toBeNull();
      expect(result.brandingTokens).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template successfully', async () => {
      const mockDeleted = {
        id: 'template-1',
        templateKey: 'to_delete',
      };

      const mockDelete = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockDeleted]),
      };

      (db.delete as any).mockReturnValue(mockDelete);

      const result = await service.deleteTemplate('template-1');

      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return false when template not found', async () => {
      const mockDelete = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };

      (db.delete as any).mockReturnValue(mockDelete);

      const result = await service.deleteTemplate('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should throw error on database failure', async () => {
      const mockDelete = {
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error('Delete failed')),
      };

      (db.delete as any).mockReturnValue(mockDelete);

      await expect(service.deleteTemplate('template-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('getTemplatesWithBrandingToken', () => {
    it('should filter templates by branding token', async () => {
      const mockTemplates: EmailTemplateMetadata[] = [
        {
          id: 'template-1',
          templateKey: 'with_logo',
          name: 'With Logo',
          description: null,
          subjectPreview: null,
          brandingTokens: { logoUrl: true, primaryColor: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-2',
          templateKey: 'without_logo',
          name: 'Without Logo',
          description: null,
          subjectPreview: null,
          brandingTokens: { primaryColor: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-3',
          templateKey: 'with_logo_too',
          name: 'With Logo Too',
          description: null,
          subjectPreview: null,
          brandingTokens: { logoUrl: true, accentColor: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockResolvedValue(mockTemplates),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplatesWithBrandingToken('logoUrl');

      expect(result).toHaveLength(2);
      expect(result[0].templateKey).toBe('with_logo');
      expect(result[1].templateKey).toBe('with_logo_too');
    });

    it('should return empty array when no templates match', async () => {
      const mockTemplates: EmailTemplateMetadata[] = [
        {
          id: 'template-1',
          templateKey: 'test',
          name: 'Test',
          description: null,
          subjectPreview: null,
          brandingTokens: { primaryColor: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockResolvedValue(mockTemplates),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplatesWithBrandingToken('nonexistentToken');

      expect(result).toEqual([]);
    });

    it('should handle templates with null branding tokens', async () => {
      const mockTemplates: EmailTemplateMetadata[] = [
        {
          id: 'template-1',
          templateKey: 'no_tokens',
          name: 'No Tokens',
          description: null,
          subjectPreview: null,
          brandingTokens: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-2',
          templateKey: 'with_tokens',
          name: 'With Tokens',
          description: null,
          subjectPreview: null,
          brandingTokens: { logoUrl: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockResolvedValue(mockTemplates),
      };

      (db.select as any).mockReturnValue(mockSelect);

      const result = await service.getTemplatesWithBrandingToken('logoUrl');

      expect(result).toHaveLength(1);
      expect(result[0].templateKey).toBe('with_tokens');
    });
  });
});
