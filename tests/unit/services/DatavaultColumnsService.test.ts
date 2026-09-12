import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import type { DatavaultTable, DatavaultColumn } from '@shared/schema';
import type { DatavaultColumnsRepository, DatavaultTablesRepository, DbTransaction } from '../../../server/repositories';
import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';
import * as repositories from '../../../server/repositories';
import { db } from '../../../server/db';

/**
 * DataVault Phase 1 PR 9: DatavaultColumnsService Tests
 *
 * Unit tests for DatavaultColumnsService
 *
 * RLS-2b: every public method now opens a tenant-scoped transaction at the
 * service boundary (via `withTx` -> `withCurrentTenant`) when no `tx` is
 * supplied, which requires a tenant in the request's async context (RLS-1) —
 * unavailable to a plain unit test. These tests pass an explicit fake `tx` to
 * take the "caller already has a transaction" branch of `withTx`, matching
 * the pattern established in tests/unit/services/CollectionService.test.ts
 * (RLS-2a). The RLS transaction itself is proven against a real database in
 * tests/integration/rls2b-datavault.test.ts.
 *
 * `mockTx` here must BE the mocked `db` object (below), not an unrelated
 * fake: `deleteColumn` -> `checkColumnUsage` (private) reads `tx ?? db`
 * directly rather than going through a repository's `getDb(tx)`, and this
 * file's mocked query chain is wired onto `db.select` — see Guardrail.test.ts
 * for the same fix and fuller explanation.
 */
const mockTx = db as unknown as DbTransaction;

describe('DatavaultColumnsService', () => {
  let service: DatavaultColumnsService;
  let mockTablesRepo: Mocked<DatavaultTablesRepository>;
  let mockColumnsRepo: Mocked<DatavaultColumnsRepository>;

  // Mock db for checkColumnUsage() which queries blocks/transforms directly
  vi.mock('../../../server/db', () => {
    const builder = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue([]),
    };
    builder.select.mockReturnValue(builder);
    builder.from.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    return { db: builder };
  });

  vi.mock('../../../server/repositories', () => ({
    datavaultTablesRepository: {
      findById: vi.fn(),
    },
    datavaultColumnsRepository: {
      findById: vi.fn(),
      findByTableId: vi.fn(),
      slugExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      reorderColumns: vi.fn(),
      getMaxOrderIndex: vi.fn(),
      findByTableAndSlug: vi.fn(),
    },
    datavaultRowsRepository: {
      deleteValuesByColumnId: vi.fn(),
      createNumberSequence: vi.fn(),
    },
  }));

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';
  const mockColumnId = '770e8400-e29b-41d4-a716-446655440002';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTablesRepo = repositories.datavaultTablesRepository as Mocked<DatavaultTablesRepository>;
    mockColumnsRepo = repositories.datavaultColumnsRepository as Mocked<DatavaultColumnsRepository>;

    service = new DatavaultColumnsService(mockColumnsRepo, mockTablesRepo);
  });

  describe('getColumns', () => {
    it('should get all columns for a table', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns: DatavaultColumn[] = [
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'First Name',
          slug: 'first_name',
          type: 'text',
          required: true,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as DatavaultColumn,
      ];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);

      const result = await service.listColumns(mockTableId, mockTenantId, mockTx);

      expect(result).toEqual(mockColumns);
    });

    it('should throw 404 if table not found', async () => {
      mockTablesRepo.findById.mockResolvedValue(undefined);

      await expect(service.listColumns(mockTableId, mockTenantId, mockTx))
        .rejects
        .toThrow('Table not found');
    });
  });

  describe('createColumn', () => {
    it('should create column with generated slug', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertData = {
        tableId: mockTableId,
        name: 'Email Address',
        type: 'email' as const,
        required: false,
      };

      const createdColumn: DatavaultColumn = {
        id: mockColumnId,
        ...insertData,
        slug: 'email_address',
        orderIndex: 0,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        options: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn;

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue(createdColumn);

      const result = await service.createColumn(insertData, mockTenantId, mockTx);

      expect(result).toEqual(createdColumn);
      expect(result.slug).toBe('email_address');
    });

    it('should ensure unique slug by appending counter', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertData = {
        tableId: mockTableId,
        name: 'Email',
        type: 'email' as const,
        required: false,
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists
        .mockResolvedValueOnce(true)  // 'email' exists
        .mockResolvedValueOnce(false); // 'email_1' available
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue({
        id: mockColumnId,
        ...insertData,
        slug: 'email_1',
        orderIndex: 1,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        options: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn);

      const result = await service.createColumn(insertData, mockTenantId, mockTx);

      expect(result.slug).toBe('email_1');
      expect(mockColumnsRepo.slugExists).toHaveBeenCalledTimes(2);
    });

    it('should use provided slug if given', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertData = {
        tableId: mockTableId,
        name: 'Email',
        slug: 'custom_email',
        type: 'email' as const,
        required: false,
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue({
        id: mockColumnId,
        ...insertData,
        orderIndex: 1,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        options: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn);

      const result = await service.createColumn(insertData, mockTenantId, mockTx);

      expect(result.slug).toBe('custom_email');
    });
  });

  describe('updateColumn', () => {
    it('should update column', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumn: DatavaultColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Old Name',
        slug: 'old_name',
        type: 'text',
        required: false,
        orderIndex: 0,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        options: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn;

      const updateData = {
        name: 'New Name',
        required: true,
      };

      const updatedColumn: DatavaultColumn = {
        ...mockColumn,
        ...updateData,
      };

      mockColumnsRepo.findById.mockResolvedValue(mockColumn);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.update.mockResolvedValue(updatedColumn);

      const result = await service.updateColumn(mockColumnId, mockTenantId, updateData, mockTx);

      expect(result).toEqual(updatedColumn);
    });

    it('should throw error if trying to change column type', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumn: DatavaultColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Email',
        slug: 'email',
        type: 'text',
        required: false,
        orderIndex: 0,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        options: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn;

      mockColumnsRepo.findById.mockResolvedValue(mockColumn);
      mockTablesRepo.findById.mockResolvedValue(mockTable);

      await expect(service.updateColumn(mockColumnId, mockTenantId, { type: 'email' as const }, mockTx))
        .rejects
        .toThrow('Cannot change column type');
    });
  });

  describe('deleteColumn', () => {
    it('should delete column', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumn: DatavaultColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Email',
        slug: 'email',
        type: 'email',
        required: false,
        orderIndex: 0,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        options: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn;

      mockColumnsRepo.findById.mockResolvedValue(mockColumn);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.delete.mockResolvedValue(undefined);

      await service.deleteColumn(mockColumnId, mockTenantId, mockTx);

      expect(mockColumnsRepo.delete).toHaveBeenCalledWith(mockColumnId, mockTx);
    });
  });

  describe('reorderColumns', () => {
    it('should reorder columns', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const columnIds = ['col-1', 'col-2', 'col-3'];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(columnIds.map(id => ({ id } as unknown as DatavaultColumn)));
      mockColumnsRepo.reorderColumns.mockResolvedValue(undefined);

      await service.reorderColumns(mockTableId, mockTenantId, columnIds, mockTx);

      expect(mockColumnsRepo.reorderColumns).toHaveBeenCalledWith(mockTableId, columnIds, mockTx);
    });
  });

  describe('select/multiselect columns', () => {
    const mockTable: DatavaultTable = {
      id: mockTableId,
      tenantId: mockTenantId,
      ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
      name: 'Test Table',
      slug: 'test-table',
      description: null,
      databaseId: 'db-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create select column with valid options', async () => {
      const insertData = {
        tableId: mockTableId,
        name: 'Status',
        type: 'select' as const,
        required: false,
        options: [
          { label: 'Active', value: 'active', color: 'green' },
          { label: 'Inactive', value: 'inactive', color: 'gray' },
        ],
      };

      const createdColumn: DatavaultColumn = {
        id: mockColumnId,
        ...insertData,
        slug: 'status',
        orderIndex: 0,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn;

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue(createdColumn);

      const result = await service.createColumn(insertData, mockTenantId, mockTx);

      expect(result).toEqual(createdColumn);
      expect(result.options).toEqual(insertData.options);
    });

    it('should create multiselect column with valid options', async () => {
      const insertData = {
        tableId: mockTableId,
        name: 'Tags',
        type: 'multiselect' as const,
        required: false,
        options: [
          { label: 'Important', value: 'important', color: 'red' },
          { label: 'Urgent', value: 'urgent', color: 'orange' },
          { label: 'Review', value: 'review', color: 'blue' },
        ],
      };

      const createdColumn: DatavaultColumn = {
        id: mockColumnId,
        ...insertData,
        slug: 'tags',
        orderIndex: 0,
        isPrimaryKey: false,
        isUnique: false,
        description: null,
        referenceDisplayColumnSlug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultColumn;

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue(createdColumn);

      const result = await service.createColumn(insertData, mockTenantId, mockTx);

      expect(result).toEqual(createdColumn);
      expect(result.options).toEqual(insertData.options);
    });

    it('should reject select column without options', async () => {
      const explicitTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const explicitTable: DatavaultTable = {
        id: mockTableId,
        tenantId: explicitTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertData = {
        tableId: mockTableId,
        name: 'Status',
        type: 'select' as const,
        required: false,
        options: [],
      };

      mockTablesRepo.findById.mockResolvedValue(explicitTable);

      await expect(service.createColumn(insertData, explicitTenantId, mockTx))
        .rejects
        .toThrow('Select and multiselect columns require at least one option');
    });

    it('should reject options with duplicate values', async () => {
      const explicitTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const explicitTable: DatavaultTable = {
        id: mockTableId,
        tenantId: explicitTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertData = {
        tableId: mockTableId,
        name: 'Status',
        type: 'select' as const,
        required: false,
        options: [
          { label: 'Active', value: 'active', color: 'green' },
          { label: 'Active Again', value: 'active', color: 'blue' },
        ],
      };

      mockTablesRepo.findById.mockResolvedValue(explicitTable);

      await expect(service.createColumn(insertData, explicitTenantId, mockTx))
        .rejects
        .toThrow('Duplicate option value: active');
    });

    it('should reject options without label or value', async () => {
      const explicitTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const explicitTable: DatavaultTable = {
        id: mockTableId,
        tenantId: explicitTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertData = {
        tableId: mockTableId,
        name: 'Status',
        type: 'select' as const,
        required: false,
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive' } as unknown as { label: string; value: string },
        ],
      };

      mockTablesRepo.findById.mockResolvedValue(explicitTable);

      await expect(service.createColumn(insertData, explicitTenantId, mockTx))
        .rejects
        .toThrow('Each option must have both label and value');
    });
  });
});
