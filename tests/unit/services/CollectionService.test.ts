import { describe, it, expect, beforeEach, vi, type Mock, beforeAll, afterAll } from 'vitest';

import { CollectionService } from '../../../server/services/CollectionService';
import { getCurrentTenantId, runWithTenantContext } from '../../../server/utils/rlsContext';

import type { DbTransaction } from '../../../server/repositories';

// RLS-2a: every public CollectionService method now opens a tenant-scoped
// transaction at the service boundary (via `withTx` -> `withCurrentTenant`)
// when no `tx` is supplied, and `withCurrentTenant` requires a tenant in the
// request's async context (RLS-1) — which a plain unit test never has. These
// mocked-repo tests are exercising business logic, not the RLS transaction
// itself (that is proven against a real database in
// tests/integration/rls2a-collectionService.test.ts), so they pass an
// explicit fake `tx` to take the "caller already has a transaction" branch
// of `withTx`, which reuses it directly and never touches the async context.
const mockTx = { __fakeTx: true } as unknown as DbTransaction;

describe('CollectionService', () => {
  let service: CollectionService;
  let mockCollectionRepo: {
    findById: Mock;
    findByTenantId: Mock;
    findByTenantAndSlug: Mock;
    slugExists: Mock;
    create: Mock;
    update: Mock;
    delete: Mock;
  };
  let mockFieldRepo: {
    findByCollectionId: Mock;
    countByCollectionIds: Mock;
  };
  let mockRecordRepo: {
    countByCollectionId: Mock;
    countByCollectionIds: Mock;
  };

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockCollectionId = '660e8400-e29b-41d4-a716-446655440001';
  const _mockUserId = '770e8400-e29b-41d4-a716-446655440002';

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
      countByCollectionIds: vi.fn(),
    };

    mockRecordRepo = {
      countByCollectionId: vi.fn(),
      countByCollectionIds: vi.fn(),
    };

    service = new CollectionService(
      mockCollectionRepo as unknown as ConstructorParameters<typeof CollectionService>[0],
      mockFieldRepo as unknown as ConstructorParameters<typeof CollectionService>[1],
      mockRecordRepo as unknown as ConstructorParameters<typeof CollectionService>[2]
    );
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

      const result = await service.createCollection(insertData, mockTx);

      expect(result).toEqual(createdCollection);
      expect(mockCollectionRepo.slugExists).toHaveBeenCalledWith(
        mockTenantId,
        'test-collection',
        undefined,
        mockTx
      );
      expect(mockCollectionRepo.create).toHaveBeenCalledWith(
        {
          ...insertData,
          slug: 'test-collection',
        },
        mockTx
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

      const result = await service.createCollection(insertData, mockTx);

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

      const result = await service.createCollection(insertData, mockTx);

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

      const result = await service.verifyTenantOwnership(mockCollectionId, mockTenantId, mockTx);

      expect(result).toEqual(collection);
    });

    it('should throw error if collection not found', async () => {
      mockCollectionRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.verifyTenantOwnership(mockCollectionId, mockTenantId, mockTx)
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
        service.verifyTenantOwnership(mockCollectionId, mockTenantId, mockTx)
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

      const result = await service.getCollectionWithFields(mockCollectionId, mockTenantId, mockTx);

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
      // Service batches counts via countByCollectionIds -> Map<collectionId, count>
      mockFieldRepo.countByCollectionIds.mockResolvedValue(new Map([[mockCollectionId, 1]]));
      mockRecordRepo.countByCollectionIds.mockResolvedValue(new Map([[mockCollectionId, 5]]));

      const result = await service.listCollectionsWithStats(mockTenantId, mockTx);

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
        { name: 'New Name' },
        mockTx
      );

      expect(result).toEqual(updatedCollection);
      expect(mockCollectionRepo.update).toHaveBeenCalledWith(
        mockCollectionId,
        { name: 'New Name', slug: 'new-name' },
        mockTx
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
        service.updateCollection(mockCollectionId, mockTenantId, { name: 'New Name' }, mockTx)
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

      await service.deleteCollection(mockCollectionId, mockTenantId, mockTx);

      expect(mockCollectionRepo.delete).toHaveBeenCalledWith(mockCollectionId, mockTx);
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
        service.deleteCollection(mockCollectionId, mockTenantId, mockTx)
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

      const result = await service.createCollection(insertData, mockTx);

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

      const result = await service.createCollection(insertData, mockTx);

      expect(result.slug).toBe('test-collection');
    });
  });

  // RLS-2a AC5 + the ambient-vs-argument mismatch guard (see CollectionService's
  // class doc comment). These are pure business-logic assertions — both fail
  // BEFORE any repository call, so they need no database and belong in
  // unit-fast. The positive "GUC set to the caller's tenant inside a real
  // transaction, and does not survive it" proof needs a real database and
  // lives in tests/integration/rls2a-collectionService.test.ts.
  describe('RLS-2a service-boundary transaction: fails closed', () => {
  // Staged rollout: `withCurrentTenant` only THROWS on a missing tenant once
  // RLS is enforced. Before that it warns and runs unscoped — failing early
  // buys no safety while every row is visible anyway, and throwing
  // unconditionally broke real customer paths (anonymous runs, run tokens).
  // These assertions are about the ENFORCED behaviour, so enable it here.
  const priorRlsEnforced = process.env.RLS_ENFORCED;
  beforeAll(() => { process.env.RLS_ENFORCED = "true"; });
  afterAll(() => {
    if (priorRlsEnforced === undefined) { delete process.env.RLS_ENFORCED; }
    else { process.env.RLS_ENFORCED = priorRlsEnforced; }
  });

    it('throws (and never calls the repository) when called with no tx and no tenant in the async context', async () => {
      expect(getCurrentTenantId()).toBeUndefined();

      await expect(
        service.getCollection(mockCollectionId, mockTenantId)
      ).rejects.toThrow(/no tenant in context/i);

      expect(mockCollectionRepo.findById).not.toHaveBeenCalled();
    });

    it('throws (and never calls the repository) when the ambient tenant disagrees with the tenantId argument', async () => {
      const ambientTenantId = 'ambient-tenant-does-not-match';

      await runWithTenantContext(ambientTenantId, async () => {
        await expect(
          service.getCollection(mockCollectionId, mockTenantId)
        ).rejects.toThrow(/tenant mismatch/i);
      });

      expect(mockCollectionRepo.findById).not.toHaveBeenCalled();
    });

    // The "ambient matches the argument, so the guard lets it through and
    // opens a real transaction" case needs an actual database
    // (`withCurrentTenant` calls `db.transaction`) and is proven in
    // tests/integration/rls2a-collectionService.test.ts instead — that is
    // also where both AC4 halves (GUC = caller's tenant, and does not
    // survive the transaction) are proven end to end.
  });
});
