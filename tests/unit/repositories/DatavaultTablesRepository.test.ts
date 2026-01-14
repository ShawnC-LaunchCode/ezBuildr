import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { DatavaultTable, InsertDatavaultTable } from '@shared/schema';

import { DatavaultTablesRepository } from '../../../server/repositories/DatavaultTablesRepository';

/**
 * DataVault Phase 1 PR 9: DatavaultTablesRepository Tests
 *
 * Unit tests for DatavaultTablesRepository
 */

describe('DatavaultTablesRepository', () => {
  let repository: DatavaultTablesRepository;
  let mockDb: any;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = '770e8400-e29b-41d4-a716-446655440002';
  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    let mockReturnValue: any = [];

    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn(() => {
        return Promise.resolve(mockReturnValue);
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      limit: vi.fn(() => {
        return Promise.resolve(mockReturnValue);
      }),
      then: vi.fn((resolve) => resolve(mockReturnValue)),
      _setMockReturnValue: (value: any) => { mockReturnValue = value; },
    };

    // @ts-ignore - mocking db for tests
    repository = new DatavaultTablesRepository(mockDb);
  });

  describe('findByTenantId', () => {
    it('should find tables by tenant ID', async () => {
      const mockTables: DatavaultTable[] = [
        {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: mockUserId,
          name: 'Test Table',
          slug: 'test-table',
          description: 'Test description',
          createdAt: new Date(),
          updatedAt: new Date(),
          databaseId: null,
        },
      ];

      mockDb._setMockReturnValue(mockTables);

      const result = await repository.findByTenantId(mockTenantId);

      expect(result).toEqual(mockTables);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return empty array if no tables found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findByTenantId(mockTenantId);

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find table by ID', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'Test Table',
        slug: 'test-table',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
        databaseId: null,
      };

      mockDb._setMockReturnValue([mockTable]);

      const result = await repository.findById(mockTableId);

      expect(result).toEqual(mockTable);
    });

    it('should return undefined if table not found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeUndefined();
    });
  });

  describe('slugExists', () => {
    it('should return true if slug exists', async () => {
      mockDb._setMockReturnValue([{ id: mockTableId }]);

      const result = await repository.slugExists(mockTenantId, 'test-table');

      expect(result).toBe(true);
    });

    it('should return false if slug does not exist', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.slugExists(mockTenantId, 'non-existent-slug');

      expect(result).toBe(false);
    });

    it('should exclude specific table ID when checking slug', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.slugExists(mockTenantId, 'test-table', mockTableId);

      expect(result).toBe(false);
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new table', async () => {
      const insertData: InsertDatavaultTable = {
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'New Table',
        slug: 'new-table',
        description: 'New description',
      };

      const createdTable: DatavaultTable = {
        id: mockTableId,
        ...insertData,
        ownerUserId: mockUserId,
        description: insertData.description!,
        slug: insertData.slug!,
        createdAt: new Date(),
        updatedAt: new Date(),
        databaseId: null,
      };

      mockDb.returning.mockResolvedValue([createdTable]);

      const result = await repository.create(insertData);

      expect(result).toEqual(createdTable);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(insertData);
    });
  });

  describe('update', () => {
    it('should update an existing table', async () => {
      const updateData = {
        name: 'Updated Table',
        description: 'Updated description',
      };

      const updatedTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        slug: 'test-table',
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
        databaseId: null,
      };

      mockDb.returning.mockResolvedValue([updatedTable]);

      const result = await repository.update(mockTableId, updateData);

      expect(result).toEqual(updatedTable);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a table', async () => {
      mockDb.returning.mockResolvedValue([{ id: mockTableId }]);

      await repository.delete(mockTableId);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('countByTenantId', () => {
    it('should count tables by tenant ID', async () => {
      mockDb._setMockReturnValue([{ count: 5 }]);

      const result = await repository.countByTenantId(mockTenantId);

      expect(result).toBe(5);
    });

    it('should return 0 if no tables found', async () => {
      mockDb._setMockReturnValue([{ count: 0 }]);

      const result = await repository.countByTenantId(mockTenantId);

      expect(result).toBe(0);
    });
  });
});
