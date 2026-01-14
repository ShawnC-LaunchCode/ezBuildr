import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';

/**
 * DataVault Phase 1 PR 9: DatavaultColumnsService Tests
 *
 * Unit tests for DatavaultColumnsService
 */

describe('DatavaultColumnsService', () => {
  let service: DatavaultColumnsService;
  let mockTablesRepo: any;
  let mockColumnsRepo: any;

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
      cleanupAutoNumberSequence: vi.fn(),
    },
  }));

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';
  const mockColumnId = '770e8400-e29b-41d4-a716-446655440002';

  beforeEach(async () => {
    mockTablesRepo = (await import('../../../server/repositories')).datavaultTablesRepository;
    mockColumnsRepo = (await import('../../../server/repositories')).datavaultColumnsRepository;
    vi.clearAllMocks();

    service = new DatavaultColumnsService(mockColumnsRepo, mockTablesRepo);
  });

  describe('getColumns', () => {
    it('should get all columns for a table', async () => {
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
          name: 'First Name',
          slug: 'first_name',
          type: 'text' as const,
          required: true,
          orderIndex: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(mockColumns);

      const result = await service.listColumns(mockTableId, mockTenantId);

      expect(result).toEqual(mockColumns);
    });

    it('should throw 404 if table not found', async () => {
      mockTablesRepo.findById.mockResolvedValue(undefined);

      await expect(service.listColumns(mockTableId, mockTenantId))
        .rejects
        .toThrow('Table not found');
    });
  });

  describe('createColumn', () => {
    it('should create column with generated slug', async () => {
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

      const insertData = {
        tableId: mockTableId,
        name: 'Email Address',
        type: 'email' as const,
        required: false,
      };

      const createdColumn = {
        id: mockColumnId,
        ...insertData,
        slug: 'email_address',
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue(createdColumn);

      const result = await service.createColumn(insertData, mockTenantId);

      expect(result).toEqual(createdColumn);
      expect(result.slug).toBe('email_address');
    });

    it('should ensure unique slug by appending counter', async () => {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createColumn(insertData, mockTenantId);

      expect(result.slug).toBe('email_1');
      expect(mockColumnsRepo.slugExists).toHaveBeenCalledTimes(2);
    });

    it('should use provided slug if given', async () => {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createColumn(insertData, mockTenantId);

      expect(result.slug).toBe('custom_email');
    });
  });

  describe('updateColumn', () => {
    it('should update column', async () => {
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

      const mockColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Old Name',
        slug: 'old_name',
        type: 'text' as const,
        required: false,
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updateData = {
        name: 'New Name',
        required: true,
      };

      const updatedColumn = {
        ...mockColumn,
        ...updateData,
      };

      mockColumnsRepo.findById.mockResolvedValue(mockColumn);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.update.mockResolvedValue(updatedColumn);

      const result = await service.updateColumn(mockColumnId, mockTenantId, updateData);

      expect(result).toEqual(updatedColumn);
    });

    it('should throw error if trying to change column type', async () => {
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

      const mockColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Email',
        slug: 'email',
        type: 'text' as const,
        required: false,
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockColumnsRepo.findById.mockResolvedValue(mockColumn);
      mockTablesRepo.findById.mockResolvedValue(mockTable);

      await expect(service.updateColumn(mockColumnId, mockTenantId, { type: 'email' as any }))
        .rejects
        .toThrow('Cannot change column type');
    });
  });

  describe('deleteColumn', () => {
    it('should delete column', async () => {
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

      const mockColumn = {
        id: mockColumnId,
        tableId: mockTableId,
        name: 'Email',
        slug: 'email',
        type: 'email' as const,
        required: false,
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockColumnsRepo.findById.mockResolvedValue(mockColumn);
      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.delete.mockResolvedValue(undefined);

      await service.deleteColumn(mockColumnId, mockTenantId);

      expect(mockColumnsRepo.delete).toHaveBeenCalledWith(mockColumnId, undefined);
    });
  });

  describe('reorderColumns', () => {
    it('should reorder columns', async () => {
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

      const columnIds = ['col-1', 'col-2', 'col-3'];

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.findByTableId.mockResolvedValue(columnIds.map(id => ({ id })));
      mockColumnsRepo.reorderColumns.mockResolvedValue(undefined);

      await service.reorderColumns(mockTableId, mockTenantId, columnIds);

      expect(mockColumnsRepo.reorderColumns).toHaveBeenCalledWith(mockTableId, columnIds, undefined);
    });
  });

  describe('select/multiselect columns', () => {
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

      const createdColumn = {
        id: mockColumnId,
        ...insertData,
        slug: 'status',
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue(createdColumn);

      const result = await service.createColumn(insertData, mockTenantId);

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

      const createdColumn = {
        id: mockColumnId,
        ...insertData,
        slug: 'tags',
        orderIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockColumnsRepo.slugExists.mockResolvedValue(false);
      mockColumnsRepo.getMaxOrderIndex.mockResolvedValue(0);
      mockColumnsRepo.create.mockResolvedValue(createdColumn);

      const result = await service.createColumn(insertData, mockTenantId);

      expect(result).toEqual(createdColumn);
      expect(result.options).toEqual(insertData.options);
    });

    it('should reject select column without options', async () => {
      const explicitTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const explicitTable = {
        id: mockTableId,
        tenantId: explicitTenantId,
        ownerUserId: 'user-1',
        name: 'Test Table',
        slug: 'test-table',
        description: null,
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

      await expect(service.createColumn(insertData, explicitTenantId))
        .rejects
        .toThrow('Select and multiselect columns require at least one option');
    });

    it('should reject options with duplicate values', async () => {
      const explicitTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const explicitTable = {
        id: mockTableId,
        tenantId: explicitTenantId,
        ownerUserId: 'user-1',
        name: 'Test Table',
        slug: 'test-table',
        description: null,
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

      await expect(service.createColumn(insertData, explicitTenantId))
        .rejects
        .toThrow('Duplicate option value: active');
    });

    it('should reject options without label or value', async () => {
      const explicitTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const explicitTable = {
        id: mockTableId,
        tenantId: explicitTenantId,
        ownerUserId: 'user-1',
        name: 'Test Table',
        slug: 'test-table',
        description: null,
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
          { label: 'Inactive' } as any,
        ],
      };

      mockTablesRepo.findById.mockResolvedValue(explicitTable);

      await expect(service.createColumn(insertData, explicitTenantId))
        .rejects
        .toThrow('Each option must have both label and value');
    });
  });
});
