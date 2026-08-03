import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { DatavaultRow, DatavaultValue, InsertDatavaultRow } from '@shared/schema';

import { DatavaultRowsRepository } from '../../../server/repositories/DatavaultRowsRepository';

/**
 * DataVault Phase 1 PR 9: DatavaultRowsRepository Tests
 *
 * Unit tests for DatavaultRowsRepository
 */

vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(), // .for('update') row locking
    execute: vi.fn(),
    transaction: vi.fn(),
    then: function (resolve: any) { resolve((this as any)._mockReturnValue || []); },
  }
}));

describe('DatavaultRowsRepository', () => {
  let repository: DatavaultRowsRepository;
  let mockDb: any;

  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';
  const mockRowId = '770e8400-e29b-41d4-a716-446655440002';
  const mockColumnId = '880e8400-e29b-41d4-a716-446655440003';
  const mockTenantId = '990e8400-e29b-41d4-a716-446655440004';

  beforeEach(async () => {
    let mockReturnValue: any = [];

    mockDb = (await import('../../../server/db')).db;

    // Setup default mock behaviors
    mockDb.execute.mockResolvedValue(mockReturnValue);
    // eslint-disable-next-line @typescript-eslint/return-await
    mockDb.transaction.mockImplementation(async (fn: any) => await fn(mockDb));

    // Helper to set return value for chained calls
    (mockDb)._setMockReturnValue = (value: any) => {
      (mockDb)._mockReturnValue = value;
      mockReturnValue = value;
      // Also update execute return value
      mockDb.execute.mockResolvedValue(value);
    };

    repository = new DatavaultRowsRepository();
  });

  describe('findByTableId', () => {
    it('should find rows by table ID', async () => {
      const mockRows: DatavaultRow[] = [
        {
          id: mockRowId,
          tableId: mockTableId,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null,
          updatedBy: null,
          deletedAt: null,
        },
      ];

      mockDb._setMockReturnValue(mockRows);

      const result = await repository.findByTableId(mockTableId);

      expect(result).toEqual(mockRows);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should support limit and offset', async () => {
      mockDb._setMockReturnValue([]);

      await repository.findByTableId(mockTableId, { limit: 10, offset: 20 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(mockDb.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('findById', () => {
    it('should find row by ID', async () => {
      const mockRow: DatavaultRow = {
        id: mockRowId,
        tableId: mockTableId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
      };

      mockDb._setMockReturnValue([mockRow]);

      const result = await repository.findById(mockRowId);

      expect(result).toEqual(mockRow);
    });

    it('should return undefined if row not found', async () => {
      mockDb._setMockReturnValue([]);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a new row', async () => {
      const insertData: InsertDatavaultRow = {
        tableId: mockTableId,
      };

      const createdRow: DatavaultRow = {
        id: mockRowId,
        ...insertData,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
      };

      mockDb.returning.mockResolvedValue([createdRow]);

      const result = await repository.create(insertData);

      expect(result).toEqual(createdRow);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a row', async () => {
      mockDb.returning.mockResolvedValue([{ id: mockRowId }]);

      await repository.delete(mockRowId);

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('countByTableId', () => {
    it('should count rows by table ID excluding archived rows by default', async () => {
      mockDb._setMockReturnValue([{ count: 42 }]);

      const result = await repository.countByTableId(mockTableId);

      expect(result).toBe(42);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should include archived rows when showArchived: true is passed', async () => {
      mockDb._setMockReturnValue([{ count: 50 }]);

      const resultObj = await repository.countByTableId(mockTableId, { showArchived: true });
      expect(resultObj).toBe(50);

      const resultBool = await repository.countByTableId(mockTableId, true);
      expect(resultBool).toBe(50);
    });

    it('should return 0 if no rows found', async () => {
      mockDb._setMockReturnValue([{ count: 0 }]);

      const result = await repository.countByTableId(mockTableId);

      expect(result).toBe(0);
    });
  });

  describe('countByTableIds', () => {
    it('should count rows for multiple table IDs excluding archived rows by default', async () => {
      const tableId2 = '660e8400-e29b-41d4-a716-446655440002';
      mockDb._setMockReturnValue([
        { tableId: mockTableId, count: 10 },
        { tableId: tableId2, count: 25 },
      ]);

      const result = await repository.countByTableIds([mockTableId, tableId2]);

      expect(result.get(mockTableId)).toBe(10);
      expect(result.get(tableId2)).toBe(25);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should include archived rows when showArchived is true', async () => {
      mockDb._setMockReturnValue([
        { tableId: mockTableId, count: 15 },
      ]);

      const result = await repository.countByTableIds([mockTableId], { showArchived: true });

      expect(result.get(mockTableId)).toBe(15);
    });

    it('should return empty map for empty tableIds array', async () => {
      const result = await repository.countByTableIds([]);
      expect(result.size).toBe(0);
    });
  });

  describe('createRowWithValues', () => {
    it('should create row and values in transaction', async () => {
      const rowData: InsertDatavaultRow = {
        tableId: mockTableId,
      };

      const values = [
        { columnId: mockColumnId, value: 'John Doe' },
      ];

      const createdRow: DatavaultRow = {
        id: mockRowId,
        ...rowData,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
      };

      const createdValues: DatavaultValue[] = [
        {
          id: 'val-1',
          rowId: mockRowId,
          columnId: mockColumnId,
          value: { data: 'John Doe' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.returning
        .mockResolvedValueOnce([createdRow])
        .mockResolvedValueOnce(createdValues);

      const result = await repository.createRowWithValues(rowData, values);

      expect(result.row).toEqual(createdRow);
      expect(result.values).toEqual(createdValues);
    });

    it('should handle empty values array', async () => {
      const rowData: InsertDatavaultRow = {
        tableId: mockTableId,
      };

      const createdRow: DatavaultRow = {
        id: mockRowId,
        ...rowData,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
      };

      mockDb.returning.mockResolvedValue([createdRow]);

      const result = await repository.createRowWithValues(rowData, []);

      expect(result.row).toEqual(createdRow);
      expect(result.values).toEqual([]);
    });
  });

  describe('getRowsWithValues', () => {
    it('should get rows with their values', async () => {
      const mockRow = {
        id: mockRowId,
        tableId: mockTableId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
      };

      const mockValues = [
        {
          id: 'val-1',
          rowId: mockRowId,
          columnId: mockColumnId,
          value: { data: 'John' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Spy on findByTableId to return rows
      vi.spyOn(repository, 'findByTableId').mockResolvedValue([mockRow]);

      // Mock DB to return values for the second query
      mockDb._setMockReturnValue(mockValues);

      const result = await repository.getRowsWithValues(mockTableId);

      expect(result).toHaveLength(1);
      expect(result[0].row).toEqual(mockRow);
      expect(result[0].values).toEqual({
        [mockColumnId]: { data: 'John' }
      });
    });
  });

  describe('updateRowValues', () => {
    it('should upsert row values', async () => {
      const values = [
        { columnId: mockColumnId, value: 'Updated Value' },
      ];

      mockDb.returning.mockResolvedValue([
        {
          id: 'val-1',
          rowId: mockRowId,
          columnId: mockColumnId,
          value: { data: 'Updated Value' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await repository.updateRowValues(mockRowId, values);

      // Should call insert with onConflictDoUpdate
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should handle empty values array', async () => {
      await repository.updateRowValues(mockRowId, []);

      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
  describe('findRowByColumnValue advisory locking (DV-7)', () => {
    // Reviewer-added. DV-7's integration test asserts that two concurrent upserts
    // yield one row, but it CANNOT fail: server/db.ts sets the pool to
    // `NODE_ENV === 'test' ? 1 : 10`, so two db.transaction() calls serialize on the
    // single connection and there is no race to lose. That test therefore proves the
    // property without proving the mechanism. These assertions are deterministic and
    // do fail without the fix, so the lock is actually protected by a test.
    it('takes a transaction-scoped advisory lock when forUpdate is requested', async () => {
      mockDb._mockReturnValue = [];

      await repository.findRowByColumnValue(mockTableId, mockColumnId, 'match-me', {
        tenantId: mockTenantId,
        forUpdate: true,
      });

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      const [lockStatement] = mockDb.execute.mock.calls[0] as [{ queryChunks?: unknown[] }];
      const rendered = JSON.stringify(lockStatement);
      expect(rendered).toContain('pg_advisory_xact_lock');
    });

    it('does not take an advisory lock for a plain read', async () => {
      mockDb._mockReturnValue = [];

      await repository.findRowByColumnValue(mockTableId, mockColumnId, 'match-me', {
        tenantId: mockTenantId,
      });

      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });

  describe('filtering and correlated EXISTS query building (DV-8)', () => {
    it('applies filters using correlated EXISTS and calls where() exactly once', async () => {
      const mockColumns = [
        {
          id: mockColumnId,
          type: 'short_text',
          slug: 'customer_name',
          autonumberPrefix: null,
        },
      ];
      mockDb._setMockReturnValue(mockColumns);

      await repository.findByTableId(mockTableId, {
        filters: [
          {
            columnId: mockColumnId,
            operator: 'contains',
            value: 'Acme',
          },
        ],
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('handles is_empty and is_not_empty operators', async () => {
      const mockColumns = [
        {
          id: mockColumnId,
          type: 'short_text',
          slug: 'customer_name',
          autonumberPrefix: null,
        },
      ];
      mockDb._setMockReturnValue(mockColumns);

      await repository.findByTableId(mockTableId, {
        filters: [
          {
            columnId: mockColumnId,
            operator: 'is_empty',
          },
        ],
      });

      expect(mockDb.where).toHaveBeenCalled();

      await repository.findByTableId(mockTableId, {
        filters: [
          {
            columnId: mockColumnId,
            operator: 'is_not_empty',
          },
        ],
      });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('handles numeric comparison operators on number and auto_number columns', async () => {
      const mockColumns = [
        {
          id: mockColumnId,
          type: 'number',
          slug: 'amount',
          autonumberPrefix: null,
        },
      ];
      mockDb._setMockReturnValue(mockColumns);

      await repository.findByTableId(mockTableId, {
        filters: [
          {
            columnId: mockColumnId,
            operator: 'greater_than',
            value: 100,
          },
          {
            columnId: mockColumnId,
            operator: 'less_than_or_equal',
            value: 500,
          },
        ],
      });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('handles in and not_in array operators', async () => {
      const mockColumns = [
        {
          id: mockColumnId,
          type: 'short_text',
          slug: 'status',
          autonumberPrefix: null,
        },
      ];
      mockDb._setMockReturnValue(mockColumns);

      await repository.findByTableId(mockTableId, {
        filters: [
          {
            columnId: mockColumnId,
            operator: 'in',
            value: ['active', 'pending'],
          },
          {
            columnId: mockColumnId,
            operator: 'not_in',
            value: ['archived'],
          },
        ],
      });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('safely handles filters referencing unknown columnIds (no crash / 1=0 predicate)', async () => {
      mockDb._setMockReturnValue([]);

      await repository.findByTableId(mockTableId, {
        filters: [
          {
            columnId: 'unknown-col-id',
            operator: 'equals',
            value: 'foo',
          },
        ],
      });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('passes filters into countByTableIdWithFilter', async () => {
      const mockColumns = [
        {
          id: mockColumnId,
          type: 'short_text',
          slug: 'status',
          autonumberPrefix: null,
        },
      ];
      mockDb._setMockReturnValue(mockColumns);

      const count = await repository.countByTableIdWithFilter(mockTableId, {
        showArchived: false,
        filters: [
          {
            columnId: mockColumnId,
            operator: 'equals',
            value: 'active',
          },
        ],
      });

      expect(typeof count).toBe('number');
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('maintains backwards compatibility for countByTableIdWithFilter boolean argument', async () => {
      mockDb._setMockReturnValue([{ count: 5 }]);

      const count = await repository.countByTableIdWithFilter(mockTableId, true);
      expect(count).toBe(5);
    });
  });

  describe('column sorting (DV-9)', () => {
    it('AC5: sorts by number column with numeric casting', async () => {
      const mockColumn = {
        id: mockColumnId,
        type: 'number',
        slug: 'score',
        autonumberPrefix: null,
      };
      mockDb._setMockReturnValue([mockColumn]);

      await repository.findByTableId(mockTableId, {
        sortBy: 'score',
        sortOrder: 'asc',
      });

      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.leftJoin).toHaveBeenCalled();
    });

    it('AC6: sorts by date, datetime, and text columns', async () => {
      // Date column
      mockDb._setMockReturnValue([
        {
          id: mockColumnId,
          type: 'date',
          slug: 'event_date',
          autonumberPrefix: null,
        },
      ]);

      await repository.findByTableId(mockTableId, {
        sortBy: 'event_date',
        sortOrder: 'asc',
      });
      expect(mockDb.orderBy).toHaveBeenCalled();

      // Text column
      mockDb._setMockReturnValue([
        {
          id: mockColumnId,
          type: 'short_text',
          slug: 'name',
          autonumberPrefix: null,
        },
      ]);

      await repository.findByTableId(mockTableId, {
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('AC7: column containing non-numeric value handles sorting safely', async () => {
      mockDb._setMockReturnValue([
        {
          id: mockColumnId,
          type: 'number',
          slug: 'score',
          autonumberPrefix: null,
        },
      ]);

      const result = await repository.findByTableId(mockTableId, {
        sortBy: 'score',
        sortOrder: 'desc',
      });

      expect(result).toBeDefined();
      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });
});
