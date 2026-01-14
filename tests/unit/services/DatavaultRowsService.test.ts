import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DatavaultRowsService } from '../../../server/services/DatavaultRowsService';

// Mock the db module
vi.mock('../../../server/db', () => ({
  db: {
    transaction: vi.fn((callback) => callback('mock-tx')),
  },
}));

/**
 * DataVault Phase 1 PR 9: DatavaultRowsService Tests
 *
 * Unit tests for DatavaultRowsService
 */

describe('DatavaultRowsService', () => {
  let service: DatavaultRowsService;
  let mockTablesRepo: any;
  let mockColumnsRepo: any;
  let mockRowsRepo: any;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';
  const mockColumnId = '770e8400-e29b-41d4-a716-446655440002';
  const mockRowId = '880e8400-e29b-41d4-a716-446655440003';

  beforeEach(() => {
    vi.clearAllMocks();

    mockTablesRepo = {
      findById: vi.fn(),
    };

    mockColumnsRepo = {
      findByTableId: vi.fn(),
    };

    mockRowsRepo = {
      findById: vi.fn(),
      findByTableId: vi.fn(),
      create: vi.fn(),
      deleteRow: vi.fn(),
      countByTableId: vi.fn(),
      createRowWithValues: vi.fn(),
      getRowsWithValues: vi.fn(),
      getRowWithValues: vi.fn(),
      updateRowValues: vi.fn(),
    };

    service = new DatavaultRowsService(mockRowsRepo, mockTablesRepo, mockColumnsRepo);
  });

  describe('getRows', () => {
    it('should get rows with values and pagination', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1',
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns = [
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          slug: 'name',
          type: 'text' as const,
          required: true,
          orderIndex: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockRowsData = [
        {
          row: {
            id: mockRowId,
            tableId: mockTableId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          values: {
            [mockColumnId]: { data: 'John Doe' },
          },
        },
      ];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
      mockRowsRepo.getRowsWithValues.mockResolvedValue(mockRowsData);
      mockRowsRepo.countByTableId.mockResolvedValue(1);

      const result = await service.listRows(mockTableId, mockTenantId, { limit: 25, offset: 0 });

      expect(result).toHaveLength(1);
      expect(result[0].values[mockColumnId]).toEqual({ data: 'John Doe' });
    });
  });

  describe('getRow', () => {
    it('should get a single row by ID', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1',
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRow = {
        id: mockRowId,
        tableId: mockTableId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns = [
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          slug: 'name',
          type: 'text' as const,
          required: true,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
        },
      ];
    });

    describe('createRow', () => {
      it('should create row with validated values', async () => {
        const mockTable = {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: 'user-1',
          name: 'Test Table',
          slug: 'test-table',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockColumns = [
          {
            id: mockColumnId,
            tableId: mockTableId,
            name: 'Name',
            slug: 'name',
            type: 'text' as const,
            required: true,
            orderIndex: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const values = {
          [mockColumnId]: 'John Doe',
        };

        const createdRow = {
          row: {
            id: mockRowId,
            tableId: mockTableId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          values: [
            {
              id: 'val-1',
              rowId: mockRowId,
              columnId: mockColumnId,
              value: { data: 'John Doe' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        };

        mockTablesRepo.findById.mockResolvedValue(mockTable);
        mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
        mockRowsRepo.createRowWithValues.mockResolvedValue(createdRow);

        const result = await service.createRow(mockTableId, mockTenantId, values);

        expect(result.row).toEqual(createdRow.row);
        expect(Object.keys(result.values)).toHaveLength(1);
        expect(result.values[mockColumnId]).toEqual({ data: 'John Doe' });
      });

      it('should throw error if required field is missing', async () => {
        const mockTable = {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: 'user-1',
          name: 'Test Table',
          slug: 'test-table',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockColumns = [
          {
            id: mockColumnId,
            tableId: mockTableId,
            name: 'Name',
            slug: 'name',
            type: 'text' as const,
            required: true,
            orderIndex: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockTablesRepo.findById.mockResolvedValue(mockTable);
        mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);

        await expect(service.createRow(mockTableId, mockTenantId, {}))
          .rejects
          .toThrow('Required column');
      });
    });

    describe('updateRow', () => {
      it('should update row values', async () => {
        const mockTable = {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: 'user-1',
          name: 'Test Table',
          slug: 'test-table',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockRow = {
          id: mockRowId,
          tableId: mockTableId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockColumns = [
          {
            id: mockColumnId,
            tableId: mockTableId,
            name: 'Name',
            slug: 'name',
            type: 'text' as const,
            required: false,
            orderIndex: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const values = {
          [mockColumnId]: 'Jane Doe',
        };

        mockRowsRepo.findById.mockResolvedValue(mockRow);
        mockTablesRepo.findById.mockResolvedValue(mockTable);
        mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
        mockRowsRepo.updateRowValues.mockResolvedValue(undefined);

        await service.updateRow(mockRowId, mockTenantId, values);

        expect(mockRowsRepo.updateRowValues).toHaveBeenCalled();
      });
    });

    describe('deleteRow', () => {
      it('should delete row', async () => {
        const mockTable = {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: 'user-1',
          name: 'Test Table',
          slug: 'test-table',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockRow = {
          id: mockRowId,
          tableId: mockTableId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRowsRepo.findById.mockResolvedValue(mockRow);
        mockTablesRepo.findById.mockResolvedValue(mockTable);
        mockRowsRepo.deleteRow.mockResolvedValue(undefined);

        await service.deleteRow(mockRowId, mockTenantId);

        expect(mockRowsRepo.deleteRow).toHaveBeenCalledWith(mockRowId, undefined);
      });
    });

    describe('value type coercion', () => {
      it('should coerce number values', async () => {
        const mockTable = {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: 'user-1',
          name: 'Test Table',
          slug: 'test-table',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockColumns = [
          {
            id: mockColumnId,
            tableId: mockTableId,
            name: 'Age',
            slug: 'age',
            type: 'number' as const,
            required: false,
            orderIndex: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const values = {
          [mockColumnId]: '25', // String input
        };

        mockTablesRepo.findById.mockResolvedValue(mockTable);
        mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
        mockRowsRepo.createRowWithValues.mockImplementation((rowData: any, valueArr: any[]) => {
          // Check that the value was coerced to a number
          expect(valueArr[0].value).toBe(25);
          return Promise.resolve({
            row: {
              id: mockRowId,
              tableId: mockTableId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            values: [],
          });
        });

        await service.createRow(mockTableId, mockTenantId, values);
      });

      it('should coerce boolean values', async () => {
        const mockTable = {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: 'user-1',
          name: 'Test Table',
          slug: 'test-table',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockColumns = [
          {
            id: mockColumnId,
            tableId: mockTableId,
            name: 'Active',
            slug: 'active',
            type: 'boolean' as const,
            required: false,
            orderIndex: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const testCases = [
          { input: 'yes', expected: true },
          { input: 'no', expected: false },
          { input: '1', expected: true },
          { input: '0', expected: false },
          { input: true, expected: true },
          { input: false, expected: false },
        ];

        for (const testCase of testCases) {
          const values = {
            [mockColumnId]: testCase.input,
          };

          mockTablesRepo.findById.mockResolvedValue(mockTable);
          mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
          mockRowsRepo.createRowWithValues.mockImplementation((rowData: any, valueArr: any[]) => {
            expect(valueArr[0].value).toBe(testCase.expected);
            return Promise.resolve({
              row: {
                id: mockRowId,
                tableId: mockTableId,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              values: [],
            });
          });

          await service.createRow(mockTableId, mockTenantId, values);
        }
      });
    });
  });
});
