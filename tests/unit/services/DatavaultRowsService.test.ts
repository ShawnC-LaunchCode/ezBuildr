import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import type { DatavaultRowsRepository, DatavaultTablesRepository, DatavaultColumnsRepository, DbTransaction } from '../../../server/repositories';
import { DatavaultRowsService } from '../../../server/services/DatavaultRowsService';
import type { DatavaultTable, DatavaultColumn, DatavaultRow, InsertDatavaultRow, DatavaultValue } from '@shared/schema';

// Mock the db module
vi.mock('../../../server/db', () => ({
  db: {
    transaction: vi.fn((callback: (tx: unknown) => unknown) => callback('mock-tx')),
  },
}));

/**
 * DataVault Phase 1 PR 9: DatavaultRowsService Tests
 *
 * Unit tests for DatavaultRowsService
 *
 * RLS-2b: every public method now opens a tenant-scoped transaction at the
 * service boundary (via `withTx` -> `withCurrentTenant`) when no `tx` is
 * supplied, which requires a tenant in the request's async context (RLS-1) —
 * unavailable to a plain unit test. These tests pass an explicit fake `tx` to
 * take the "caller already has a transaction" branch of `withTx`, matching
 * the pattern established in tests/unit/services/CollectionService.test.ts
 * (RLS-2a). This also replaces the file's earlier `db.transaction` mock
 * returning the string `'mock-tx'` — that path is `withCurrentTenant`'s,
 * which every call here now bypasses by supplying `mockTx` directly. The RLS
 * transaction itself is proven against a real database in
 * tests/integration/rls2b-datavault.test.ts.
 */
const mockTx = { __fakeTx: true } as unknown as DbTransaction;

describe('DatavaultRowsService', () => {
  let service: DatavaultRowsService;
  let mockTablesRepo: Mocked<DatavaultTablesRepository>;
  let mockColumnsRepo: Mocked<DatavaultColumnsRepository>;
  let mockRowsRepo: Mocked<DatavaultRowsRepository>;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';
  const mockColumnId = '770e8400-e29b-41d4-a716-446655440002';
  const mockRowId = '880e8400-e29b-41d4-a716-446655440003';

  beforeEach(() => {
    vi.clearAllMocks();

    mockTablesRepo = {
      findById: vi.fn(),
    } as unknown as Mocked<DatavaultTablesRepository>;

    mockColumnsRepo = {
      findByTableId: vi.fn(),
    } as unknown as Mocked<DatavaultColumnsRepository>;

    mockRowsRepo = {
      findById: vi.fn(),
      findByTableId: vi.fn(),
      create: vi.fn(),
      deleteRow: vi.fn(),
      countByTableId: vi.fn(),
      countByTableIdWithFilter: vi.fn(),
      createRowWithValues: vi.fn(),
      getRowsWithValues: vi.fn(),
      getRowWithValues: vi.fn(),
      updateRowValues: vi.fn(),
      getNextAutoNumber: vi.fn(),
      findUniqueValueConflicts: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<DatavaultRowsRepository>;

    service = new DatavaultRowsService(mockRowsRepo, mockTablesRepo, mockColumnsRepo);
  });

  describe('getRows', () => {
    it('should get rows with values and pagination', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns: DatavaultColumn[] = [
        // @ts-expect-error - mock omits non-essential fields
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          slug: 'name',
          type: 'text',
          required: true,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          referenceTableId: null,
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
            createdBy: null,
          } as DatavaultRow,
          values: {
            [mockColumnId]: { data: 'John Doe' },
          },
        },
      ];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
      mockRowsRepo.getRowsWithValues.mockResolvedValue(mockRowsData);
      mockRowsRepo.countByTableId.mockResolvedValue(1);

      const result = await service.listRows(mockTableId, mockTenantId, { limit: 25, offset: 0 }, mockTx);

      expect(result).toHaveLength(1);
      expect(result[0].values[mockColumnId]).toEqual({ data: 'John Doe' });
    });
  });

  describe('createRow', () => {
    it('should create row with validated values', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns: DatavaultColumn[] = [
        // @ts-expect-error - mock omits non-essential fields
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          slug: 'name',
          type: 'text',
          required: true,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          referenceTableId: null,
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
          createdBy: null,
        } as DatavaultRow,
        values: [
          {
            id: 'val-1',
            rowId: mockRowId,
            columnId: mockColumnId,
            value: { data: 'John Doe' },
            createdAt: new Date(),
            updatedAt: new Date(),
          } as DatavaultValue,
        ],
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);
      mockRowsRepo.createRowWithValues.mockResolvedValue(createdRow);

      const result = await service.createRow(mockTableId, mockTenantId, values, undefined, mockTx);

      expect(result.row).toEqual(createdRow.row);
      expect(Object.keys(result.values)).toHaveLength(1);
      expect(result.values[mockColumnId]).toEqual({ data: 'John Doe' });
    });

    it('should throw error if required field is missing', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns: DatavaultColumn[] = [
        // @ts-expect-error - mock omits non-essential fields
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          slug: 'name',
          type: 'text',
          required: true,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          referenceTableId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);

      await expect(service.createRow(mockTableId, mockTenantId, {}, undefined, mockTx))
        .rejects
        .toThrow("Required column 'Name' is missing");
    });

    it('does not mutate the caller values when generating auto-numbers', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
      } as DatavaultTable;
      const autoNumberColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'ID',
        slug: 'id',
        type: 'auto_number',
        required: true,
        autoNumberStart: 1,
        isPrimaryKey: true,
        isUnique: true,
      } as DatavaultColumn;
      const values: Record<string, unknown> = {};

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue([autoNumberColumn]);
      mockRowsRepo.getNextAutoNumber.mockResolvedValue(1);
      mockRowsRepo.createRowWithValues.mockResolvedValue({
        row: { id: mockRowId, tableId: mockTableId } as DatavaultRow,
        values: [],
      });

      await service.createRow(mockTableId, mockTenantId, values, undefined, mockTx);

      expect(values).toEqual({});
      expect(mockRowsRepo.createRowWithValues).toHaveBeenCalledWith(
        expect.any(Object),
        [{ columnId: mockColumnId, value: 1 }],
        mockTx
      );
    });
  });

  describe('updateRow', () => {
    it('should update row values', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // @ts-expect-error - mock omits non-essential fields
      const mockRow: DatavaultRow = {
        id: mockRowId,
        tableId: mockTableId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
      };

      const mockColumns: DatavaultColumn[] = [
        // @ts-expect-error - mock omits non-essential fields
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          slug: 'name',
          type: 'text',
          required: false,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          referenceTableId: null,
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

      await service.updateRow(mockRowId, mockTenantId, values, undefined, mockTx);

      expect(mockRowsRepo.updateRowValues).toHaveBeenCalled();
    });

    it('allows a partial update that omits a required column', async () => {
      const optionalColumnId = '990e8400-e29b-41d4-a716-446655440004';
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
      } as DatavaultTable;
      const mockRow = {
        id: mockRowId,
        tableId: mockTableId,
      } as DatavaultRow;
      const columns = [
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Name',
          type: 'text',
          required: true,
        },
        {
          id: optionalColumnId,
          tableId: mockTableId,
          name: 'Notes',
          type: 'text',
          required: false,
        },
      ] as DatavaultColumn[];

      mockRowsRepo.findById.mockResolvedValue(mockRow);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(columns);

      await expect(service.updateRow(mockRowId, mockTenantId, {
        [optionalColumnId]: 'Updated',
      }, undefined, mockTx)).resolves.toBeUndefined();

      expect(mockRowsRepo.updateRowValues).toHaveBeenCalledWith(
        mockRowId,
        [{ columnId: optionalColumnId, value: 'Updated' }],
        undefined,
        mockTx
      );
    });

    it('rejects a partial update that explicitly nulls a required column', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
      } as DatavaultTable;
      const mockRow = {
        id: mockRowId,
        tableId: mockTableId,
      } as DatavaultRow;
      const requiredColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Name',
        type: 'text',
        required: true,
      } as DatavaultColumn;

      mockRowsRepo.findById.mockResolvedValue(mockRow);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue([requiredColumn]);

      await expect(service.updateRow(mockRowId, mockTenantId, {
        [mockColumnId]: null,
      }, undefined, mockTx)).rejects.toThrow("Column 'Name' is required");

      expect(mockRowsRepo.updateRowValues).not.toHaveBeenCalled();
    });
  });

  describe('unique constraints', () => {
    const makeTable = (): DatavaultTable => ({
      id: mockTableId,
      tenantId: mockTenantId,
      ownerUserId: 'user-1',
      name: 'Unique Values',
      slug: 'unique-values',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DatavaultTable);

    const makeColumn = (
      overrides: Partial<DatavaultColumn> = {}
    ): DatavaultColumn => ({
      id: mockColumnId,
      tableId: mockTableId,
      name: 'Email',
      slug: 'email',
      type: 'text',
      required: false,
      isPrimaryKey: false,
      isUnique: false,
      orderIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as DatavaultColumn);

    const makeRow = (): DatavaultRow => ({
      id: mockRowId,
      tableId: mockTableId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DatavaultRow);

    const mockSuccessfulCreate = (): void => {
      mockRowsRepo.createRowWithValues.mockResolvedValue({
        row: makeRow(),
        values: [],
      });
    };

    it('rejects a duplicate value in a unique column and names the column', async () => {
      const column = makeColumn({ isUnique: true });
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockRowsRepo.findUniqueValueConflicts.mockResolvedValue([
        { rowId: 'conflicting-row', columnId: column.id },
      ]);

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: 'used@example.com',
      }, undefined, mockTx)).rejects.toThrow("column 'Email'");

      expect(mockRowsRepo.createRowWithValues).not.toHaveBeenCalled();
    });

    it('rejects a duplicate value in a primary key column', async () => {
      const column = makeColumn({ name: 'External ID', isPrimaryKey: true });
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockRowsRepo.findUniqueValueConflicts.mockResolvedValue([
        { rowId: 'conflicting-row', columnId: column.id },
      ]);

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: 'KEY-100',
      }, undefined, mockTx)).rejects.toThrow("column 'External ID'");
    });

    it('excludes the updated row so its own unique value succeeds', async () => {
      const column = makeColumn({ isUnique: true });
      mockRowsRepo.findById.mockResolvedValue(makeRow());
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);

      await service.updateRow(mockRowId, mockTenantId, {
        [column.id]: 'same@example.com',
      }, undefined, mockTx);

      expect(mockRowsRepo.findUniqueValueConflicts).toHaveBeenCalledWith(
        mockTableId,
        [{ columnId: column.id, value: 'same@example.com' }],
        mockRowId,
        mockTx
      );
      expect(mockRowsRepo.updateRowValues).toHaveBeenCalled();
    });

    it('allows duplicate values in columns without a unique constraint', async () => {
      const column = makeColumn();
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: 'duplicate allowed',
      }, undefined, mockTx)).resolves.toBeDefined();

      expect(mockRowsRepo.findUniqueValueConflicts).not.toHaveBeenCalled();
    });

    it('allows a value when the repository finds no live-row conflict', async () => {
      const column = makeColumn({ isUnique: true });
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: 'archived-only@example.com',
      }, undefined, mockTx)).resolves.toBeDefined();

      expect(mockRowsRepo.createRowWithValues).toHaveBeenCalled();
    });

    it('does not check null values in sparse unique columns', async () => {
      const column = makeColumn({ isUnique: true });
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await service.createRow(mockTableId, mockTenantId, { [column.id]: null }, undefined, mockTx);

      expect(mockRowsRepo.findUniqueValueConflicts).not.toHaveBeenCalled();
    });

    it('checks multiple unique columns with one repository call', async () => {
      const secondColumnId = '990e8400-e29b-41d4-a716-446655440004';
      const columns = [
        makeColumn({ isUnique: true }),
        makeColumn({ id: secondColumnId, name: 'Employee ID', isPrimaryKey: true }),
      ];
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue(columns);
      mockSuccessfulCreate();

      await service.createRow(mockTableId, mockTenantId, {
        [mockColumnId]: 'unique@example.com',
        [secondColumnId]: 'EMP-1',
      }, undefined, mockTx);

      expect(mockRowsRepo.findUniqueValueConflicts).toHaveBeenCalledTimes(1);
      expect(mockRowsRepo.findUniqueValueConflicts).toHaveBeenCalledWith(
        mockTableId,
        [
          { columnId: mockColumnId, value: 'unique@example.com' },
          { columnId: secondColumnId, value: 'EMP-1' },
        ],
        undefined,
        mockTx
      );
    });
  });

  describe('blank value coercion (DVH-1)', () => {
    const makeTable = (): DatavaultTable => ({
      id: mockTableId,
      tenantId: mockTenantId,
      ownerUserId: 'user-1',
      name: 'Blank Values',
      slug: 'blank-values',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DatavaultTable);

    const mockSuccessfulCreate = (): void => {
      mockRowsRepo.createRowWithValues.mockImplementation(
        (_rowData: InsertDatavaultRow, valueArr: Array<{ columnId: string; value: unknown }>) => Promise.resolve({
          row: { id: mockRowId, tableId: mockTableId } as DatavaultRow,
          values: valueArr.map((v, i) => ({
            id: `val-${i}`,
            rowId: mockRowId,
            columnId: v.columnId,
            value: v.value,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as DatavaultValue)),
        })
      );
    };

    it('AC1: rejects an empty string for a required text column', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Name',
        type: 'text',
        required: true,
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: '',
      }, undefined, mockTx)).rejects.toThrow("Column 'Name' is required");

      expect(mockRowsRepo.createRowWithValues).not.toHaveBeenCalled();
    });

    it('AC2: rejects a whitespace-only string for a required text column', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Name',
        type: 'text',
        required: true,
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: '   ',
      }, undefined, mockTx)).rejects.toThrow("Column 'Name' is required");

      expect(mockRowsRepo.createRowWithValues).not.toHaveBeenCalled();
    });

    it('AC3: a blank value in a unique column does not trigger a uniqueness check', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Email',
        type: 'text',
        required: false,
        isUnique: true,
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await service.createRow(mockTableId, mockTenantId, { [column.id]: '' }, undefined, mockTx);

      expect(mockRowsRepo.findUniqueValueConflicts).not.toHaveBeenCalled();
    });

    it('AC4: a blank string is coerced to null before it reaches the repository', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Notes',
        type: 'text',
        required: false,
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await service.createRow(mockTableId, mockTenantId, { [column.id]: '   ' }, undefined, mockTx);

      expect(mockRowsRepo.createRowWithValues).toHaveBeenCalledWith(
        expect.any(Object),
        [{ columnId: column.id, value: null }],
        mockTx
      );
    });

    it('AC6: a json column keeps an empty JSON-encoded string as "" rather than coercing it to null', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Metadata',
        type: 'json',
        required: false,
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await service.createRow(mockTableId, mockTenantId, { [column.id]: '""' }, undefined, mockTx);

      expect(mockRowsRepo.createRowWithValues).toHaveBeenCalledWith(
        expect.any(Object),
        [{ columnId: column.id, value: '' }],
        mockTx
      );
    });

    it('AC7: an empty string for a select column still fails option validation instead of becoming null', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Category',
        type: 'select',
        required: false,
        options: [{ value: 'a', label: 'A' }],
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);

      await expect(service.createRow(mockTableId, mockTenantId, {
        [column.id]: '',
      }, undefined, mockTx)).rejects.toThrow("Column 'Category' value must be one of");

      expect(mockRowsRepo.createRowWithValues).not.toHaveBeenCalled();
    });

    it('AC7: an empty array for a multiselect column is unaffected by blank coercion', async () => {
      const column = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Tags',
        type: 'multiselect',
        required: false,
        options: [{ value: 'a', label: 'A' }],
      } as DatavaultColumn;
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockColumnsRepo.findByTableId.mockResolvedValue([column]);
      mockSuccessfulCreate();

      await service.createRow(mockTableId, mockTenantId, { [column.id]: [] }, undefined, mockTx);

      expect(mockRowsRepo.createRowWithValues).toHaveBeenCalledWith(
        expect.any(Object),
        [{ columnId: column.id, value: [] }],
        mockTx
      );
    });
  });

  describe('deleteRow', () => {
    it('should delete row', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // @ts-expect-error - mock omits non-essential fields
      const mockRow: DatavaultRow = {
        id: mockRowId,
        tableId: mockTableId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
      };

      mockRowsRepo.findById.mockResolvedValue(mockRow);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockRowsRepo.deleteRow.mockResolvedValue(undefined);

      await service.deleteRow(mockRowId, mockTenantId, mockTx);

      expect(mockRowsRepo.deleteRow).toHaveBeenCalledWith(mockRowId, mockTx);
    });
  });

  describe('value type coercion', () => {
    it('should coerce number values', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns: DatavaultColumn[] = [
        // @ts-expect-error - mock omits non-essential fields
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Age',
          slug: 'age',
          type: 'number',
          required: false,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          referenceTableId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const values = {
        [mockColumnId]: '25', // String input
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);

      mockRowsRepo.createRowWithValues.mockImplementation((_rowData: InsertDatavaultRow, valueArr: Array<{ columnId: string; value: unknown }>) => {
        // Check that the value was coerced to a number
        expect(valueArr[0].value).toBe(25);
        return Promise.resolve({
          row: {
            id: mockRowId,
            tableId: mockTableId,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: null,
          } as DatavaultRow,
          values: [],
        });
      });

      await service.createRow(mockTableId, mockTenantId, values, undefined, mockTx);
    });

    it('should coerce boolean values', async () => {
      const mockTable: DatavaultTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: 'user-1', ownerType: null, ownerUuid: null,
        name: 'Test Table',
        slug: 'test-table',
        description: null,
        databaseId: 'mock-db-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockColumns: DatavaultColumn[] = [
        // @ts-expect-error - mock omits non-essential fields
        {
          id: mockColumnId,
          tableId: mockTableId,
          name: 'Active',
          slug: 'active',
          type: 'boolean',
          required: false,
          orderIndex: 0,
          isPrimaryKey: false,
          isUnique: false,
          description: null,
          options: null,
          referenceDisplayColumnSlug: null,
          referenceTableId: null,
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

        mockRowsRepo.createRowWithValues.mockImplementation((_rowData: InsertDatavaultRow, valueArr: Array<{ columnId: string; value: unknown }>) => {
          expect(valueArr[0].value).toBe(testCase.expected);
          return Promise.resolve({
            row: {
              id: mockRowId,
              tableId: mockTableId,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: null,
            } as DatavaultRow,
            values: [],
          });
        });

        await service.createRow(mockTableId, mockTenantId, values, undefined, mockTx);
      }
    });
  });

  describe('getRowsWithOptions & listRows', () => {
    const mockTable: DatavaultTable = {
      id: mockTableId,
      tenantId: mockTenantId,
      ownerUserId: 'user-1',
      ownerType: null,
      ownerUuid: null,
      name: 'Test Table',
      slug: 'test-table',
      description: null,
      databaseId: 'mock-db-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('forwards columnIds to getRowsWithValues in getRowsWithOptions', async () => {
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockRowsRepo.getRowsWithValues.mockResolvedValue([]);
      mockRowsRepo.countByTableIdWithFilter.mockResolvedValue(0);

      const options = {
        limit: 25,
        offset: 0,
        showArchived: false,
        columnIds: [mockColumnId],
      };

      await service.getRowsWithOptions(mockTenantId, mockTableId, options, mockTx);

      expect(mockRowsRepo.getRowsWithValues).toHaveBeenCalledWith(
        mockTableId,
        options,
        mockTx
      );
      expect(mockRowsRepo.countByTableIdWithFilter).toHaveBeenCalledWith(
        mockTableId,
        { showArchived: false, filters: undefined },
        mockTx
      );
    });

    it('forwards columnIds to getRowsWithValues in listRows', async () => {
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockRowsRepo.getRowsWithValues.mockResolvedValue([]);

      const options = {
        limit: 50,
        offset: 10,
        columnIds: [mockColumnId],
      };

      await service.listRows(mockTableId, mockTenantId, options, mockTx);

      expect(mockRowsRepo.getRowsWithValues).toHaveBeenCalledWith(
        mockTableId,
        options,
        mockTx
      );
    });
  });
});
