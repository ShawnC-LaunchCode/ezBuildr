import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { Template, InsertTemplate } from '@shared/schema';

import { DocumentTemplateRepository } from '../../../server/repositories/DocumentTemplateRepository';

/**
 * Stage 21 PR 2: Document Template Repository Tests
 *
 * Unit tests for DocumentTemplateRepository
 */

describe('DocumentTemplateRepository', () => {
  let repository: DocumentTemplateRepository;
  let mockDb: any;

  beforeEach(() => {
    // Mock database with chainable query builder
    // The last method in the chain should be awaitable and resolve to mock data
    let mockReturnValue: any = [];

    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve(mockReturnValue)),
      _setMockReturnValue: (value: any) => { mockReturnValue = value; },
    };

    // @ts-ignore - mocking db for tests
    repository = new DocumentTemplateRepository(mockDb);
  });

  describe('findByProjectId', () => {
    it('should find templates by project ID', async () => {
      const projectId = 'proj-123';
      const mockTemplates: Template[] = [
        {
          id: 'tpl-1',
          projectId,
          name: 'Engagement Letter',
          description: 'Standard engagement letter',
          fileRef: 'files/template-1.docx',
          type: 'docx',
          helpersVersion: 1,
          metadata: {},
          mapping: {},
          currentVersion: 1,
          lastModifiedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tpl-2',
          projectId,
          name: 'Invoice',
          description: null,
          fileRef: 'files/template-2.docx',
          type: 'docx',
          helpersVersion: 1,
          metadata: {},
          mapping: {},
          currentVersion: 1,
          lastModifiedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb._setMockReturnValue(mockTemplates);

      const result = await repository.findByProjectId(projectId);

      expect(result).toEqual(mockTemplates);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should return empty array when no templates found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findByProjectId('proj-nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByType', () => {
    it('should find templates by type', async () => {
      const projectId = 'proj-123';
      const type = 'docx';
      const mockTemplates: Template[] = [
        {
          id: 'tpl-1',
          projectId,
          name: 'DOCX Template',
          description: null,
          fileRef: 'files/template.docx',
          type: 'docx',
          helpersVersion: 1,
          metadata: {},
          mapping: {},
          currentVersion: 1,
          lastModifiedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb._setMockReturnValue(mockTemplates);

      const result = await repository.findByType(projectId, type);

      expect(result).toEqual(mockTemplates);
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('findByIdAndProjectId', () => {
    it('should find template by ID and project ID', async () => {
      const mockTemplate: Template = {
        id: 'tpl-1',
        projectId: 'proj-123',
        name: 'Test Template',
        description: 'Test description',
        fileRef: 'files/template.docx',
        type: 'docx',
        helpersVersion: 1,
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb._setMockReturnValue([mockTemplate]);

      const result = await repository.findByIdAndProjectId('tpl-1', 'proj-123');

      expect(result).toEqual(mockTemplate);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return undefined when template not found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findByIdAndProjectId('tpl-nonexistent', 'proj-123');

      expect(result).toBeUndefined();
    });
  });

  describe('updateMetadata', () => {
    it('should update template name and description', async () => {
      const mockUpdated: Template = {
        id: 'tpl-1',
        projectId: 'proj-123',
        name: 'Updated Name',
        description: 'Updated description',
        fileRef: 'files/template.docx',
        type: 'docx',
        helpersVersion: 1,
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb._setMockReturnValue([mockUpdated]);

      const result = await repository.updateMetadata('tpl-1', 'proj-123', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(result).toEqual(mockUpdated);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return undefined when template not found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.updateMetadata('tpl-nonexistent', 'proj-123', {
        name: 'New Name',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('updateFileRef', () => {
    it('should update template file reference', async () => {
      const mockUpdated: Template = {
        id: 'tpl-1',
        projectId: 'proj-123',
        name: 'Test Template',
        description: null,
        fileRef: 'files/new-template.docx',
        type: 'docx',
        helpersVersion: 1,
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb._setMockReturnValue([mockUpdated]);

      const result = await repository.updateFileRef(
        'tpl-1',
        'proj-123',
        'files/new-template.docx'
      );

      expect(result).toEqual(mockUpdated);
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          fileRef: 'files/new-template.docx',
        })
      );
    });
  });

  describe('deleteByIdAndProjectId', () => {
    it('should delete template and return true', async () => {
      mockDb._setMockReturnValue([{ id: 'tpl-1' }]);

      const result = await repository.deleteByIdAndProjectId('tpl-1', 'proj-123');

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return false when template not found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.deleteByIdAndProjectId('tpl-nonexistent', 'proj-123');

      expect(result).toBe(false);
    });
  });

  describe('existsByNameInProject', () => {
    it('should return true when template name exists', async () => {
      mockDb._setMockReturnValue([{ id: 'tpl-1' }]);

      const result = await repository.existsByNameInProject(
        'Existing Template',
        'proj-123'
      );

      expect(result).toBe(true);
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it('should return false when template name does not exist', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.existsByNameInProject(
        'Nonexistent Template',
        'proj-123'
      );

      expect(result).toBe(false);
    });

    it('should exclude specific template ID when checking existence', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.existsByNameInProject(
        'Template Name',
        'proj-123',
        'tpl-exclude'
      );

      expect(result).toBe(false);
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new template', async () => {
      const insertData: InsertTemplate = {
        projectId: 'proj-123',
        name: 'New Template',
        description: 'New description',
        fileRef: 'files/new-template.docx',
        type: 'docx',
        helpersVersion: 1,
      };

      const mockCreated: Template = {
        id: 'tpl-new',
        ...insertData,
        description: insertData.description!,
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        helpersVersion: 1,
      };

      mockDb._setMockReturnValue([mockCreated]);

      const result = await repository.create(insertData);

      expect(result).toEqual(mockCreated);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(insertData);
    });
  });

  describe('findById', () => {
    it('should find template by ID', async () => {
      const mockTemplate: Template = {
        id: 'tpl-1',
        projectId: 'proj-123',
        name: 'Test Template',
        description: null,
        fileRef: 'files/template.docx',
        type: 'docx',
        helpersVersion: 1,
        metadata: {},
        mapping: {},
        currentVersion: 1,
        lastModifiedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb._setMockReturnValue([mockTemplate]);

      const result = await repository.findById('tpl-1');

      expect(result).toEqual(mockTemplate);
    });
  });
});
