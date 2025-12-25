import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';
import { DatavaultRowsService } from '../../../server/services/DatavaultRowsService';
import type { DatavaultColumn, DatavaultTable } from '@shared/schema';

// Mock db module
vi.mock('../../../server/db', () => ({
  db: {
    transaction: vi.fn((callback) => callback({})),
  },
}));

describe('DataVault Reference Columns', () => {
  describe('DatavaultColumnsService - Reference Column Validation', () => {
    let columnsService: DatavaultColumnsService;
    let mockTablesRepo: any;
    let mockColumnsRepo: any;

    beforeEach(() => {
      mockTablesRepo = {
        findById: vi.fn(),
      };
      mockColumnsRepo = {
        findByTableId: vi.fn(),
        getMaxOrderIndex: vi.fn(),
        findByTableAndSlug: vi.fn(),
        create: vi.fn(),
        slugExists: vi.fn().mockResolvedValue(false),
      };
      columnsService = new DatavaultColumnsService(mockColumnsRepo, mockTablesRepo);
    });

    it('should throw error if referenceTableId is missing for reference column', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      mockTablesRepo.findById.mockResolvedValue({ id: tableId, tenantId });

      await expect(
        columnsService.createColumn(
          {
            tableId,
            name: 'Reference Column',
            type: 'reference',
            required: false,
            isPrimaryKey: false,
            isUnique: false,
            orderIndex: 0,
          },
          tenantId
        )
      ).rejects.toThrow('Reference columns require referenceTableId');
    });

    it('should validate that referenced table exists and belongs to same tenant', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refTableId = 'ref-table-1';

      // Main table exists
      mockTablesRepo.findById.mockImplementation((id: string) => {
        if (id === tableId) {
          return Promise.resolve({
            id: tableId,
            tenantId,
            name: 'Test Table',
          });
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
            isPrimaryKey: false,
            isUnique: false,
            orderIndex: 0,
          },
          tenantId
        )
      ).rejects.toThrow('Referenced table not found');
    });

    it('should validate that referenced table belongs to same tenant', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refTableId = 'ref-table-1';

      mockTablesRepo.findById.mockImplementation((id: string) => {
        if (id === tableId) {
          return Promise.resolve({
            id: tableId,
            tenantId,
            name: 'Test Table',
          });
        }
        if (id === refTableId) {
          // Referenced table belongs to different tenant
          return Promise.resolve({
            id: refTableId,
            tenantId: 'tenant-2',
            name: 'Ref Table',
          });
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
            isPrimaryKey: false,
            isUnique: false,
            orderIndex: 0,
          },
          tenantId
        )
      ).rejects.toThrow('Referenced table must belong to the same tenant');
    });

    it('should validate that displayColumnSlug exists in referenced table', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refTableId = 'ref-table-1';

      mockTablesRepo.findById.mockImplementation((id: string) => {
        if (id === tableId) {
          return Promise.resolve({
            id: tableId,
            tenantId,
            name: 'Test Table',
          });
        }
        if (id === refTableId) {
          return Promise.resolve({
            id: refTableId,
            tenantId,
            name: 'Ref Table',
          });
        }
        return Promise.resolve(null);
      });

      // Display column doesn't exist
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
            isPrimaryKey: false,
            isUnique: false,
            orderIndex: 0,
          },
          tenantId
        )
      ).rejects.toThrow("Display column 'nonexistent' not found in referenced table");
    });

    it('should clear reference fields when type is not reference', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
      });

      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockImplementation((data: any) => Promise.resolve(data));

      const result = await columnsService.createColumn(
        {
          tableId,
          name: 'Text Column',
          type: 'text',
          referenceTableId: 'should-be-cleared',
          referenceDisplayColumnSlug: 'should-be-cleared',
          required: false,
          isPrimaryKey: false,
          isUnique: false,
          orderIndex: 0,
        },
        tenantId
      );

      // Verify create was called with cleared reference fields
      expect(mockColumnsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceTableId: null,
          referenceDisplayColumnSlug: null,
        }),
        undefined
      );
    });
  });

  describe('DatavaultRowsService - Reference Value Validation', () => {
    let rowsService: DatavaultRowsService;
    let mockRowsRepo: any;
    let mockTablesRepo: any;
    let mockColumnsRepo: any;

    beforeEach(() => {
      mockRowsRepo = {
        findById: vi.fn(),
        createRowWithValues: vi.fn(),
      };
      mockTablesRepo = {
        findById: vi.fn(),
      };
      mockColumnsRepo = {
        findByTableId: vi.fn(),
      };
      rowsService = new DatavaultRowsService(
        mockRowsRepo,
        mockTablesRepo,
        mockColumnsRepo
      );
    });

    it('should validate that reference value is a valid UUID', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
      });

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        },
      ]);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {
            'col-1': 'not-a-valid-uuid',
          }
        )
      ).rejects.toThrow('must be a valid UUID reference');
    });

    it('should validate that referenced row exists', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refRowId = '550e8400-e29b-41d4-a716-446655440000';

      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
      });

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        },
      ]);

      // Referenced row doesn't exist
      mockRowsRepo.findById.mockResolvedValue(null);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {
            'col-1': refRowId,
          }
        )
      ).rejects.toThrow('references a non-existent row');
    });

    it('should validate that referenced row belongs to correct table', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';
      const refRowId = '550e8400-e29b-41d4-a716-446655440000';

      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
      });

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        },
      ]);

      // Referenced row exists but belongs to wrong table
      mockRowsRepo.findById.mockResolvedValue({
        id: refRowId,
        tableId: 'wrong-table-id',
      });

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {
            'col-1': refRowId,
          }
        )
      ).rejects.toThrow('references a row from the wrong table');
    });

    it('should allow null reference value when not required', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
      });

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: false,
          referenceTableId: 'ref-table-1',
        },
      ]);

      mockRowsRepo.createRowWithValues.mockResolvedValue({
        row: { id: 'row-1', tableId },
        values: [{ columnId: 'col-1', value: null }],
      });

      const result = await rowsService.createRow(
        tableId,
        tenantId,
        {
          'col-1': null,
        }
      );

      expect(result.values['col-1']).toBeNull();
    });

    it('should reject null reference value when required', async () => {
      const tenantId = 'tenant-1';
      const tableId = 'table-1';

      mockTablesRepo.findById.mockResolvedValue({
        id: tableId,
        tenantId,
        name: 'Test Table',
      });

      mockColumnsRepo.findByTableId.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Reference Column',
          type: 'reference',
          required: true,
          referenceTableId: 'ref-table-1',
        },
      ]);

      await expect(
        rowsService.createRow(
          tableId,
          tenantId,
          {}
        )
      ).rejects.toThrow("Required column 'Reference Column' is missing");
    });
  });
});
