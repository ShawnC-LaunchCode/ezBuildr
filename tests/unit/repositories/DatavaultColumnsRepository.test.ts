import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { DatavaultColumn, InsertDatavaultColumn } from '@shared/schema';

import { DatavaultColumnsRepository } from '../../../server/repositories/DatavaultColumnsRepository';

/**
 * DataVault Phase 1 PR 9: DatavaultColumnsRepository Tests
 *
 * Unit tests for DatavaultColumnsRepository
 */

describe('DatavaultColumnsRepository', () => {
  let repository: DatavaultColumnsRepository;
  let mockDb: any;

  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';
  const mockColumnId = '770e8400-e29b-41d4-a716-446655440002';

  beforeEach(() => {
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
    repository = new DatavaultColumnsRepository(mockDb);
  });

  describe('findByTableId', () => {
    it('should find columns by table ID in order', async () => {
      const mockColumns: DatavaultColumn[] = [
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'First Name',
          slug: 'first_name',
          type: 'text',
          required: true,
          orderIndex: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'col-2',
          tableId: mockTableId,
          name: 'Last Name',
          slug: 'last_name',
          type: 'text',
          required: true,
          orderIndex: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any[];

      mockDb._setMockReturnValue(mockColumns);

      const result = await repository.findByTableId(mockTableId);

      expect(result).toEqual(mockColumns);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should return empty array if no columns found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findByTableId(mockTableId);

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find column by ID', async () => {
      const mockColumn: DatavaultColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Email',
        slug: 'email',
        type: 'email',
        required: true,
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      mockDb._setMockReturnValue([mockColumn]);

      const result = await repository.findById(mockColumnId);

      expect(result).toEqual(mockColumn);
    });

    it('should return undefined if column not found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeUndefined();
    });
  });

  describe('slugExists', () => {
    it('should return true if slug exists', async () => {
      mockDb._setMockReturnValue([{ id: mockColumnId }]);

      const result = await repository.slugExists(mockTableId, 'first_name');

      expect(result).toBe(true);
    });

    it('should return false if slug does not exist', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.slugExists(mockTableId, 'non_existent');

      expect(result).toBe(false);
    });

    it('should exclude specific column ID when checking slug', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.slugExists(mockTableId, 'first_name', mockColumnId);

      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('should create a new column', async () => {
      const insertData: InsertDatavaultColumn = {
        tableId: mockTableId,
        name: 'Phone',
        slug: 'phone',
        type: 'phone',
        required: false,
        orderIndex: 2,
      };

      const createdColumn: DatavaultColumn = {
        id: mockColumnId,
        ...insertData,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      mockDb.returning.mockResolvedValue([createdColumn]);

      const result = await repository.create(insertData);

      expect(result).toEqual(createdColumn);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an existing column', async () => {
      const updateData = {
        name: 'Mobile Phone',
        required: true,
      };

      const updatedColumn: DatavaultColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        slug: 'phone',
        type: 'phone',
        orderIndex: 0,
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      mockDb.returning.mockResolvedValue([updatedColumn]);

      const result = await repository.update(mockColumnId, updateData);

      expect(result).toEqual(updatedColumn);
    });
  });

  describe('delete', () => {
    it('should delete a column', async () => {
      mockDb.returning.mockResolvedValue([{ id: mockColumnId }]);

      await repository.delete(mockColumnId);

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('reorderColumns', () => {
    it('should update order indices for multiple columns', async () => {
      const columnIds = ['col-1', 'col-2', 'col-3'];

      mockDb.returning.mockResolvedValue([]);

      await repository.reorderColumns(mockTableId, columnIds);

      expect(mockDb.update).toHaveBeenCalledTimes(3);
    });
  });

  describe('getMaxOrderIndex', () => {
    it('should return max order index', async () => {
      mockDb._setMockReturnValue([{ max: 5 }]);

      const result = await repository.getMaxOrderIndex(mockTableId);

      expect(result).toBe(5);
    });

    it('should return 0 if no columns exist', async () => {
      mockDb._setMockReturnValue([{ max: null }]);

      const result = await repository.getMaxOrderIndex(mockTableId);

      expect(result).toBe(-1);
    });
  });
});
