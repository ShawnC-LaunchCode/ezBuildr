import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import type { DatavaultColumn, DatavaultTable, DatavaultRow } from '@shared/schema';
import type { DatavaultColumnsRepository, DatavaultTablesRepository, DatavaultRowsRepository, DbTransaction } from '../../../server/repositories';
import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';
import { DatavaultRowsService } from '../../../server/services/DatavaultRowsService';
import * as repositories from '../../../server/repositories';

// RLS-2b: every public method on these services now opens a tenant-scoped
// transaction at the service boundary when no `tx` is supplied, which
// requires a tenant in the request's async context (RLS-1) — unavailable to
// a plain unit test. Pass an explicit fake `tx` to take the "caller already
// has a transaction" branch, matching CollectionService.test.ts (RLS-2a).
const mockTx = { __fakeTx: true } as unknown as DbTransaction;

// Mock db module
vi.mock('../../../server/db', () => ({
  db: {
    transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

vi.mock('../../../server/repositories', () => ({
  datavaultTablesRepository: {
    findById: vi.fn(),
  },
  datavaultColumnsRepository: {
    findByTableId: vi.fn(),
    getMaxOrderIndex: vi.fn(),
    findByTableAndSlug: vi.fn(),
    create: vi.fn(),
    slugExists: vi.fn(),
  },
  datavaultRowsRepository: {
    findById: vi.fn(),
    createRowWithValues: vi.fn(),
  },
}));

describe('DataVault Reference Columns', () => {
  describe('DatavaultColumnsService - Reference Column Validation', () => {
    let columnsService: DatavaultColumnsService;
    let mockTablesRepo: Mocked<DatavaultTablesRepository>;
    let mockColumnsRepo: Mocked<DatavaultColumnsRepository>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockTablesRepo = repositories.datavaultTablesRepository as Mocked<DatavaultTablesRepository>;
      mockColumnsRepo = repositories.datavaultColumnsRepository as Mocked<DatavaultColumnsRepository>;

      // Default mock behavior for slugExists (often assumed false in these tests unless specified)
      mockColumnsRepo.slugExists.mockResolvedValue(false);

      columnsService = new DatavaultColumnsService(mockColumnsRepo, mockTablesRepo);
    });

    it('should throw error if referenceTableId is missing for reference column', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const mockTable: DatavaultTable = {
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        updatedBy: null
      } as unknown as DatavaultTable;

      mockTablesRepo.findById.mockResolvedValue(mockTable);

      await expect(
        columnsService.createColumn(
          {
            tableId,
            name: 'Reference Column',
            type: 'reference',
            required: false,
          },
          tenantId,
          mockTx
        )
      ).rejects.toThrow('Reference columns require referenceTableId');
    });

    it('should validate that referenced table exists and belongs to same tenant', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refTableId = 'ref-table-1';

      // Main table exists
      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockImplementation((id: string) => {
        if (id === tableId) {
          // @ts-expect-error - TODO: fix type
          return Promise.resolve({
            id: tableId,
            tenantId,
            name: 'Test Table',
            slug: 'test-table',
            description: null,
            databaseId: 'db-1',
            createdAt: new Date(),
            updatedAt: new Date(),




            deletedAt: null,
            updatedBy: null
          } as DatavaultTable);
        }
        // Referenced table doesn't exist
        return Promise.resolve(null);
      });

      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);

      await expect(
        columnsService.createColumn(
          {
            tableId,
            name: 'Reference Column',
            type: 'reference',
            referenceTableId: refTableId,
            required: false,
          },
          tenantId,
          mockTx
        )
      ).rejects.toThrow('Referenced table not found');
    });

    it('should validate that referenced table belongs to same tenant', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refTableId = 'ref-table-1';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockImplementation((id: string) => {
        if (id === tableId) {
          // @ts-expect-error - TODO: fix type
          return Promise.resolve({
            id: tableId,
            tenantId,
            name: 'Test Table',
            slug: 'test-table',
            description: null,
            databaseId: 'db-1',
            createdAt: new Date(),
            updatedAt: new Date(),




            deletedAt: null,
            updatedBy: null
          } as DatavaultTable);
        }
        if (id === refTableId) {
          // Referenced table belongs to different tenant
          // @ts-expect-error - TODO: fix type
          return Promise.resolve({
            id: refTableId,
            tenantId: 'tenant-2',
            name: 'Ref Table',
            slug: 'ref-table',
            description: null,
            databaseId: 'db-1',
            createdAt: new Date(),
            updatedAt: new Date(),




            deletedAt: null,
            updatedBy: null
          } as DatavaultTable);
        }
        return Promise.resolve(null);
      });

      await expect(
        columnsService.createColumn(
          {
            tableId,
            name: 'Reference Column',
            type: 'reference',
            referenceTableId: refTableId,
            required: false,
          },
          tenantId,
          mockTx
        )
      ).rejects.toThrow('Referenced table must belong to the same tenant');
    });

    it('should validate that displayColumnSlug exists in referenced table', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refTableId = 'ref-table-1';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockImplementation((id: string) => {
        if (id === tableId) {
          // @ts-expect-error - TODO: fix type
          return Promise.resolve({
            id: tableId,
            tenantId,
            name: 'Test Table',
            slug: 'test-table',
            description: null,
            databaseId: 'db-1',
            createdAt: new Date(),
            updatedAt: new Date(),




            deletedAt: null,
            updatedBy: null
          } as DatavaultTable);
        }
        if (id === refTableId) {
          // @ts-expect-error - TODO: fix type
          return Promise.resolve({
            id: refTableId,
            tenantId,
            name: 'Ref Table',
            slug: 'ref-table',
            description: null,
            databaseId: 'db-1',
            createdAt: new Date(),
            updatedAt: new Date(),




            deletedAt: null,
            updatedBy: null
          } as DatavaultTable);
        }
        return Promise.resolve(null);
      });

      // Display column doesn't exist
      // @ts-expect-error - TODO: fix type
      mockColumnsRepo.findByTableAndSlug.mockResolvedValue(null);

      await expect(
        columnsService.createColumn(
          {
            tableId,
            name: 'Reference Column',
            type: 'reference',
            referenceTableId: refTableId,
            referenceDisplayColumnSlug: 'nonexistent',
            required: false,
          },
          tenantId,
          mockTx
        )
      ).rejects.toThrow("Display column 'nonexistent' not found in referenced table");
    });

    it('should clear reference fields when type is not reference', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),




        deletedAt: null,
        updatedBy: null
      } as DatavaultTable);

      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockImplementation((data: Partial<DatavaultColumn>) => Promise.resolve(data as DatavaultColumn));

      await columnsService.createColumn(
        {
          tableId,
          name: 'Text Column',
          type: 'text',
          referenceTableId: 'should-be-cleared',
          referenceDisplayColumnSlug: 'should-be-cleared',
          required: false,
        },
        tenantId,
        mockTx
      );

      // Verify create was called with cleared reference fields
      expect(mockColumnsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceTableId: null,
          referenceDisplayColumnSlug: null,
        }),
        mockTx
      );
    });
  });

  describe('DatavaultRowsService - Reference Value Validation', () => {
    let rowsService: DatavaultRowsService;
    let mockRowsRepo: Mocked<DatavaultRowsRepository>;
    let mockTablesRepo: Mocked<DatavaultTablesRepository>;
    let mockColumnsRepo: Mocked<DatavaultColumnsRepository>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockRowsRepo = repositories.datavaultRowsRepository as Mocked<DatavaultRowsRepository>;
      mockTablesRepo = repositories.datavaultTablesRepository as Mocked<DatavaultTablesRepository>;
      mockColumnsRepo = repositories.datavaultColumnsRepository as Mocked<DatavaultColumnsRepository>;

      rowsService = new DatavaultRowsService(
        mockRowsRepo,
        mockTablesRepo,
        mockColumnsRepo
      );
    });

    it('should validate that reference value is a valid UUID', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),




        deletedAt: null,
        updatedBy: null
      } as DatavaultTable);

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        } as unknown as DatavaultColumn,
      ]);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {
            'col-1': 'not-a-valid-uuid',
          },
          undefined,
          mockTx
        )
      ).rejects.toThrow('must be a valid UUID reference');
    });

    it('should validate that referenced row exists', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refRowId = '550e8400-e29b-41d4-a716-446655440000';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),




        deletedAt: null,
        updatedBy: null
      } as DatavaultTable);

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        } as unknown as DatavaultColumn,
      ]);

      // Referenced row doesn't exist
      // @ts-expect-error - TODO: fix type
      mockRowsRepo.findById.mockResolvedValue(null);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {
            'col-1': refRowId,
          },
          undefined,
          mockTx
        )
      ).rejects.toThrow('references a non-existent row');
    });

    it('should validate that referenced row belongs to correct table', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refRowId = '550e8400-e29b-41d4-a716-446655440000';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),




        deletedAt: null,
        updatedBy: null
      } as DatavaultTable);

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        } as unknown as DatavaultColumn,
      ]);

      // Referenced row exists but belongs to wrong table
      mockRowsRepo.findById.mockResolvedValue({
        id: refRowId,
        tableId: 'wrong-table-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: null,
        updatedBy: null
      } as DatavaultRow);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {
            'col-1': refRowId,
          },
          undefined,
          mockTx
        )
      ).rejects.toThrow('references a row from the wrong table');
    });

    it('should allow null reference value when not required', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),




        deletedAt: null,
        updatedBy: null
      } as DatavaultTable);

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: false,
          referenceTableId: 'ref-table-1',
        } as unknown as DatavaultColumn,
      ]);

      mockRowsRepo.createRowWithValues.mockResolvedValue({
        row: { id: 'row-1', tableId, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null } as DatavaultRow,
        // @ts-expect-error - TODO: fix type
        values: [{ columnId: 'col-1', value: null }] as unknown as Record<string, unknown>[],
      });

      const result = await rowsService.createRow(
        tableId,
        tenantId,
        {
          'col-1': null,
        },
        undefined,
        mockTx
      );

      expect(result.values['col-1']).toBeNull();
    });

    it('should reject null reference value when required', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      // @ts-expect-error - TODO: fix type
      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'db-1',
        createdAt: new Date(),
        updatedAt: new Date(),




        deletedAt: null,
        updatedBy: null
      } as DatavaultTable);

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        } as unknown as DatavaultColumn,
      ]);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {},
          undefined,
          mockTx
        )
      ).rejects.toThrow("Required column 'Reference Column' is missing");
    });
  });
});
