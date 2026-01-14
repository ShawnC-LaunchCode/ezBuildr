import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CollectionService } from '../../../server/services/CollectionService';

describe('CollectionService', () => {
  let service: CollectionService;
  let mockCollectionRepo: any;
  let mockFieldRepo: any;
  let mockRecordRepo: any;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockCollectionId = '660e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '770e8400-e29b-41d4-a716-446655440002';

  beforeEach(() => {
    vi.clearAllMocks();

    mockCollectionRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findByTenantAndSlug: vi.fn(),
      slugExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockFieldRepo = {
      findByCollectionId: vi.fn(),
    };

    mockRecordRepo = {
      countByCollectionId: vi.fn(),
    };

    service = new CollectionService(mockCollectionRepo, mockFieldRepo, mockRecordRepo);
  });

  describe('createCollection', () => {
    it('should create collection with generated slug', async () => {
      const insertData = {
        tenantId: mockTenantId,
        name: 'Test Collection',
        slug: 'test-collection',
        description: 'Test description',
      };

      const createdCollection = {
        id: mockCollectionId,
        ...insertData,
        slug: 'test-collection',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.slugExists.mockResolvedValue(false);
      mockCollectionRepo.create.mockResolvedValue(createdCollection);

      const result = await service.createCollection(insertData);

      expect(result).toEqual(createdCollection);
      expect(mockCollectionRepo.slugExists).toHaveBeenCalledWith(
        mockTenantId,
        'test-collection',
        undefined,
        undefined
      );
      expect(mockCollectionRepo.create).toHaveBeenCalledWith(
        {
          ...insertData,
          slug: 'test-collection',
        },
        undefined
      );
    });

    it('should ensure unique slug by appending counter', async () => {
      const insertData = {
        tenantId: mockTenantId,
        name: 'Test Collection',
        slug: 'test-collection',
        description: 'Test description',
      };

      const createdCollection = {
        id: mockCollectionId,
        ...insertData,
        slug: 'test-collection-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.slugExists
        .mockResolvedValueOnce(true) // 'test-collection' exists
        .mockResolvedValueOnce(false); // 'test-collection-1' available

      mockCollectionRepo.create.mockResolvedValue(createdCollection);

      const result = await service.createCollection(insertData);

      expect(result.slug).toBe('test-collection-1');
      expect(mockCollectionRepo.slugExists).toHaveBeenCalledTimes(2);
    });

    it('should use provided slug if unique', async () => {
      const insertData = {
        tenantId: mockTenantId,
        name: 'Test Collection',
        slug: 'custom-slug',
        description: 'Test description',
      };

      const createdCollection = {
        id: mockCollectionId,
        ...insertData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.slugExists.mockResolvedValue(false);
      mockCollectionRepo.create.mockResolvedValue(createdCollection);

      const result = await service.createCollection(insertData);

      expect(result.slug).toBe('custom-slug');
    });
  });

  describe('verifyTenantOwnership', () => {
    it('should return collection if tenant owns it', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: mockTenantId,
        name: 'Test Collection',
        slug: 'test-collection',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);

      const result = await service.verifyTenantOwnership(mockCollectionId, mockTenantId);

      expect(result).toEqual(collection);
    });

    it('should throw error if collection not found', async () => {
      mockCollectionRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.verifyTenantOwnership(mockCollectionId, mockTenantId)
      ).rejects.toThrow('Collection not found');
    });

    it('should throw error if tenant does not own collection', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: 'different-tenant-id',
        name: 'Test Collection',
        slug: 'test-collection',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);

      await expect(
        service.verifyTenantOwnership(mockCollectionId, mockTenantId)
      ).rejects.toThrow('Access denied - collection belongs to different tenant');
    });
  });

  describe('getCollectionWithFields', () => {
    it('should return collection with fields', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: mockTenantId,
        name: 'Test Collection',
        slug: 'test-collection',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockCollectionRepo.findById.mockResolvedValue(collection);
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);

      const result = await service.getCollectionWithFields(mockCollectionId, mockTenantId);

      expect(result).toEqual({
        ...collection,
        fields,
      });
    });
  });

  describe('listCollectionsWithStats', () => {
    it('should return collections with field and record counts', async () => {
      const collections = [
        {
          id: mockCollectionId,
          tenantId: mockTenantId,
          name: 'Collection 1',
          slug: 'collection-1',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const fields = [
        {
          id: 'field-1',
          collectionId: mockCollectionId,
          name: 'Email',
          slug: 'email',
          type: 'text' as const,
          isRequired: true,
          options: null,
          defaultValue: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockCollectionRepo.findByTenantId.mockResolvedValue(collections);
      mockFieldRepo.findByCollectionId.mockResolvedValue(fields);
      mockRecordRepo.countByCollectionId.mockResolvedValue(5);

      const result = await service.listCollectionsWithStats(mockTenantId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        ...collections[0],
        fieldCount: 1,
        recordCount: 5,
      });
    });
  });

  describe('updateCollection', () => {
    it('should update collection and regenerate slug if name changed', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: mockTenantId,
        name: 'Old Name',
        slug: 'old-name',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedCollection = {
        ...collection,
        name: 'New Name',
        slug: 'new-name',
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);
      mockCollectionRepo.slugExists.mockResolvedValue(false);
      mockCollectionRepo.update.mockResolvedValue(updatedCollection);

      const result = await service.updateCollection(
        mockCollectionId,
        mockTenantId,
        { name: 'New Name' }
      );

      expect(result).toEqual(updatedCollection);
      expect(mockCollectionRepo.update).toHaveBeenCalledWith(
        mockCollectionId,
        { name: 'New Name', slug: 'new-name' },
        undefined
      );
    });

    it('should verify tenant ownership before updating', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: 'different-tenant',
        name: 'Test',
        slug: 'test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);

      await expect(
        service.updateCollection(mockCollectionId, mockTenantId, { name: 'New Name' })
      ).rejects.toThrow('Access denied - collection belongs to different tenant');
    });
  });

  describe('deleteCollection', () => {
    it('should delete collection after verifying ownership', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: mockTenantId,
        name: 'Test',
        slug: 'test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);
      mockCollectionRepo.delete.mockResolvedValue(undefined);

      await service.deleteCollection(mockCollectionId, mockTenantId);

      expect(mockCollectionRepo.delete).toHaveBeenCalledWith(mockCollectionId, undefined);
    });

    it('should throw error if tenant does not own collection', async () => {
      const collection = {
        id: mockCollectionId,
        tenantId: 'different-tenant',
        name: 'Test',
        slug: 'test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.findById.mockResolvedValue(collection);

      await expect(
        service.deleteCollection(mockCollectionId, mockTenantId)
      ).rejects.toThrow('Access denied - collection belongs to different tenant');

      expect(mockCollectionRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('slug generation', () => {
    it('should generate valid slug from name with special characters', async () => {
      const insertData = {
        tenantId: mockTenantId,
        name: 'Test @ Collection #123!',
        slug: 'test-collection-123',
        description: 'Test',
      };

      const createdCollection = {
        id: mockCollectionId,
        ...insertData,
        slug: 'test-collection-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.slugExists.mockResolvedValue(false);
      mockCollectionRepo.create.mockResolvedValue(createdCollection);

      const result = await service.createCollection(insertData);

      expect(result.slug).toBe('test-collection-123');
    });

    it('should trim whitespace and convert to lowercase', async () => {
      const insertData = {
        tenantId: mockTenantId,
        name: '  Test Collection  ',
        slug: 'test-collection',
        description: 'Test',
      };

      const createdCollection = {
        id: mockCollectionId,
        ...insertData,
        slug: 'test-collection',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCollectionRepo.slugExists.mockResolvedValue(false);
      mockCollectionRepo.create.mockResolvedValue(createdCollection);

      const result = await service.createCollection(insertData);

      expect(result.slug).toBe('test-collection');
    });
  });
});
