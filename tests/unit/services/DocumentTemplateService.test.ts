import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { Template } from '@shared/schema';

import { documentTemplateRepository } from '../../../server/repositories/DocumentTemplateRepository';
import { DocumentTemplateService } from '../../../server/services/DocumentTemplateService';
import * as templatesModule from '../../../server/services/templates';


/**
 * Stage 21 PR 2: Document Template Service Tests
 *
 * Unit tests for DocumentTemplateService
 */

// Mock modules
vi.mock('../../../server/repositories/DocumentTemplateRepository');
vi.mock('../../../server/services/templates');

describe('DocumentTemplateService', () => {
  let service: DocumentTemplateService;

  beforeEach(() => {
    service = new DocumentTemplateService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTemplate', () => {
    it('should create a new DOCX template successfully', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Engagement Letter',
        description: 'Standard engagement letter',
        fileRef: 'abcd1234.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      vi.spyOn(documentTemplateRepository, 'existsByNameInProject').mockResolvedValue(false);
      vi.spyOn(templatesModule, 'saveTemplateFile').mockResolvedValue('abcd1234.docx');
      vi.spyOn(documentTemplateRepository, 'create').mockResolvedValue(mockTemplate);

      const fileBuffer = Buffer.from('docx content');
      const result = await service.createTemplate({
        projectId: 'proj-123',
        name: 'Engagement Letter',
        description: 'Standard engagement letter',
        fileBuffer,
        originalFileName: 'engagement.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        type: 'docx',
      });

      expect(result).toEqual(mockTemplate);
      expect(templatesModule.saveTemplateFile).toHaveBeenCalledWith(
        fileBuffer,
        'engagement.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(documentTemplateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-123',
          name: 'Engagement Letter',
          fileRef: 'abcd1234.docx',
        }),
        undefined
      );
    });

    it('should throw error if template name already exists', async () => {
      vi.spyOn(documentTemplateRepository, 'existsByNameInProject').mockResolvedValue(true);

      await expect(
        service.createTemplate({
          projectId: 'proj-123',
          name: 'Existing Template',
          fileBuffer: Buffer.from('content'),
          originalFileName: 'template.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          type: 'docx',
        })
      ).rejects.toThrow('Template with this name already exists in the project');
    });

    it('should throw error for invalid DOCX file type', async () => {
      vi.spyOn(documentTemplateRepository, 'existsByNameInProject').mockResolvedValue(false);

      await expect(
        service.createTemplate({
          projectId: 'proj-123',
          name: 'Test Template',
          fileBuffer: Buffer.from('content'),
          originalFileName: 'template.txt',
          mimeType: 'text/plain',
          type: 'docx',
        })
      ).rejects.toThrow('Only .docx files are supported for DOCX templates');
    });

    it('should delete uploaded file if database insert fails', async () => {
      vi.spyOn(documentTemplateRepository, 'existsByNameInProject').mockResolvedValue(false);
      vi.spyOn(templatesModule, 'saveTemplateFile').mockResolvedValue('abcd1234.docx');
      vi.spyOn(documentTemplateRepository, 'create').mockRejectedValue(new Error('DB error'));
      vi.spyOn(templatesModule, 'deleteTemplateFile').mockResolvedValue(undefined);

      await expect(
        service.createTemplate({
          projectId: 'proj-123',
          name: 'Test Template',
          fileBuffer: Buffer.from('content'),
          originalFileName: 'template.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          type: 'docx',
        })
      ).rejects.toThrow('DB error');

      expect(templatesModule.deleteTemplateFile).toHaveBeenCalledWith('abcd1234.docx');
    });
  });

  describe('getTemplate', () => {
    it('should retrieve template by ID', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Test Template',
        description: null,
        fileRef: 'abcd1234.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(true);

      const result = await service.getTemplate('tpl-123', 'proj-123');

      expect(result).toEqual(mockTemplate);
      expect(templatesModule.templateFileExists).toHaveBeenCalledWith('abcd1234.docx');
    });

    it('should throw error if template not found', async () => {
      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(undefined);

      await expect(
        service.getTemplate('tpl-nonexistent', 'proj-123')
      ).rejects.toThrow('Template not found');
    });

    it('should throw error if template file missing from storage', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Test Template',
        description: null,
        fileRef: 'missing.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(false);

      await expect(
        service.getTemplate('tpl-123', 'proj-123')
      ).rejects.toThrow('Template file not found in storage');
    });
  });

  describe('listTemplates', () => {
    it('should list all templates for a project', async () => {
      const mockTemplates: any[] = [
        {
          id: 'tpl-1',
          projectId: 'proj-123',
          name: 'Template 1',
          description: null,
          fileRef: 'file1.docx',
          type: 'docx',
          helpersVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tpl-2',
          projectId: 'proj-123',
          name: 'Template 2',
          description: 'Description 2',
          fileRef: 'file2.docx',
          type: 'docx',
          helpersVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.spyOn(documentTemplateRepository, 'findByProjectId').mockResolvedValue(mockTemplates);

      const result = await service.listTemplates('proj-123');

      expect(result).toEqual(mockTemplates);
      expect(result).toHaveLength(2);
    });
  });

  describe('updateTemplateMeta', () => {
    it('should update template name and description', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Original Name',
        description: 'Original description',
        fileRef: 'file.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      const mockUpdated: Template = {
        ...mockTemplate,
        name: 'Updated Name',
        description: 'Updated description',
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(true);
      vi.spyOn(documentTemplateRepository, 'existsByNameInProject').mockResolvedValue(false);
      vi.spyOn(documentTemplateRepository, 'updateMetadata').mockResolvedValue(mockUpdated);

      const result = await service.updateTemplateMeta('tpl-123', 'proj-123', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(result).toEqual(mockUpdated);
      expect(documentTemplateRepository.updateMetadata).toHaveBeenCalledWith(
        'tpl-123',
        'proj-123',
        {
          name: 'Updated Name',
          description: 'Updated description',
        },
        undefined
      );
    });

    it('should throw error if new name already exists', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Original Name',
        description: null,
        fileRef: 'file.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(true);
      vi.spyOn(documentTemplateRepository, 'existsByNameInProject').mockResolvedValue(true);

      await expect(
        service.updateTemplateMeta('tpl-123', 'proj-123', {
          name: 'Existing Name',
        })
      ).rejects.toThrow('Template with this name already exists in the project');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template and associated file', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Template to Delete',
        description: null,
        fileRef: 'file-to-delete.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(true);
      vi.spyOn(documentTemplateRepository, 'deleteByIdAndProjectId').mockResolvedValue(true);
      vi.spyOn(templatesModule, 'deleteTemplateFile').mockResolvedValue(undefined);

      await service.deleteTemplate('tpl-123', 'proj-123');

      expect(documentTemplateRepository.deleteByIdAndProjectId).toHaveBeenCalledWith(
        'tpl-123',
        'proj-123',
        undefined
      );
      expect(templatesModule.deleteTemplateFile).toHaveBeenCalledWith('file-to-delete.docx');
    });

    it('should throw error if template not found', async () => {
      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(undefined);

      await expect(
        service.deleteTemplate('tpl-nonexistent', 'proj-123')
      ).rejects.toThrow('Template not found');
    });
  });

  describe('storeTemplateFile', () => {
    it('should replace template file', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Test Template',
        description: null,
        fileRef: 'old-file.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      const mockUpdated: Template = {
        ...mockTemplate,
        fileRef: 'new-file.docx',
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(true);
      vi.spyOn(templatesModule, 'saveTemplateFile').mockResolvedValue('new-file.docx');
      vi.spyOn(documentTemplateRepository, 'updateFileRef').mockResolvedValue(mockUpdated);
      vi.spyOn(templatesModule, 'deleteTemplateFile').mockResolvedValue(undefined);

      const result = await service.storeTemplateFile(
        'tpl-123',
        'proj-123',
        Buffer.from('new content'),
        'new-template.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      expect(result).toEqual(mockUpdated);
      expect(templatesModule.deleteTemplateFile).toHaveBeenCalledWith('old-file.docx');
    });

    it('should rollback new file if update fails', async () => {
      const mockTemplate: Template = {
        id: 'tpl-123',
        projectId: 'proj-123',
        name: 'Test Template',
        description: null,
        fileRef: 'old-file.docx',
        type: 'docx',
        helpersVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
      };

      vi.spyOn(documentTemplateRepository, 'findByIdAndProjectId').mockResolvedValue(mockTemplate);
      vi.spyOn(templatesModule, 'templateFileExists').mockResolvedValue(true);
      vi.spyOn(templatesModule, 'saveTemplateFile').mockResolvedValue('new-file.docx');
      vi.spyOn(documentTemplateRepository, 'updateFileRef').mockRejectedValue(new Error('Update failed'));
      vi.spyOn(templatesModule, 'deleteTemplateFile').mockResolvedValue(undefined);

      await expect(
        service.storeTemplateFile(
          'tpl-123',
          'proj-123',
          Buffer.from('new content'),
          'new-template.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      ).rejects.toThrow('Update failed');

      expect(templatesModule.deleteTemplateFile).toHaveBeenCalledWith('new-file.docx');
    });
  });
});
