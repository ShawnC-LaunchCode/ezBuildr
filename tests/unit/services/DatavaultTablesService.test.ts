import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DatavaultTablesService } from '../../../server/services/DatavaultTablesService';

/**
 * DataVault Phase 1 PR 9: DatavaultTablesService Tests
 *
 * Unit tests for DatavaultTablesService
 */

describe('DatavaultTablesService', () => {
  let service: DatavaultTablesService;
  let mockTablesRepo: any;
  let mockColumnsRepo: any;
  let mockRowsRepo: any;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = '770e8400-e29b-41d4-a716-446655440002';
  const mockTableId = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();

    mockTablesRepo = {
      findByTenant: vi.fn(),
      findByTenantAndUser: vi.fn(),
      findById: vi.fn(),
      slugExists: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      countByTenantId: vi.fn(),

    };

    mockColumnsRepo = {
      findByTableId: vi.fn(),
      create: vi.fn(),
      countByTableId: vi.fn(),
    };

    mockRowsRepo = {
      countByTableId: vi.fn(),
    };

    service = new DatavaultTablesService(mockTablesRepo, mockColumnsRepo, mockRowsRepo);
  });

  describe('listTables', () => {
    it('should get all tables for a tenant', async () => {
      const mockTables = [
        {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: mockUserId,
          name: 'Test Table',
          slug: 'test-table',
          description: 'Test',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTablesRepo.findByTenantAndUser.mockResolvedValue(mockTables);

      const result = await service.listTables(mockTenantId, mockUserId);

      expect(result).toEqual(mockTables);
      expect(mockTablesRepo.findByTenantAndUser).toHaveBeenCalledWith(mockTenantId, mockUserId, undefined);
    });
  });

  describe('listTablesWithStats', () => {
    it('should get tables with stats', async () => {
      const mockTables = [
        {
          id: mockTableId,
          tenantId: mockTenantId,
          ownerUserId: mockUserId,
          name: 'Test Table',
          slug: 'test-table',
          description: 'Test',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTablesRepo.findByTenantAndUser.mockResolvedValue(mockTables);
      mockColumnsRepo.countByTableId.mockResolvedValue(2);
      mockRowsRepo.countByTableId.mockResolvedValue(42);

      const result = await service.listTablesWithStats(mockTenantId, mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('columnCount', 2);
      expect(result[0]).toHaveProperty('rowCount', 42);
    });
  });

  describe('getTable', () => {
    it('should get a table by ID', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'Test Table',
        slug: 'test-table',
        description: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);

      const result = await service.getTable(mockTableId, mockTenantId);

      expect(result).toEqual(mockTable);
    });

    it('should throw 404 if table not found', async () => {
      mockTablesRepo.findById.mockResolvedValue(undefined);

      await expect(service.getTable('non-existent', mockTenantId))
        .rejects
        .toThrow('Table not found');
    });

    it('should throw 403 if table belongs to different tenant', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: 'different-tenant-id',
        ownerUserId: mockUserId,
        name: 'Test Table',
        slug: 'test-table',
        description: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);

      await expect(service.getTable(mockTableId, mockTenantId))
        .rejects
        .toThrow('Access denied - table belongs to different tenant');
    });
  });

  describe('createTable', () => {
    it('should create table with generated slug', async () => {
      const insertData = {
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'New Table',
        description: 'Test',
      };

      const createdTable = {
        id: mockTableId,
        ...insertData,
        slug: 'new-table',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.slugExists.mockResolvedValue(false);
      mockTablesRepo.create.mockResolvedValue(createdTable);

      const result = await service.createTable(insertData);

      expect(result).toEqual(createdTable);
      expect(mockTablesRepo.slugExists).toHaveBeenCalledWith(
        mockTenantId,
        'new-table',
        undefined,
        undefined
      );
    });

    it('should ensure unique slug by appending counter', async () => {
      const insertData = {
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'New Table',
        description: 'Test',
      };

      const createdTable = {
        id: mockTableId,
        ...insertData,
        slug: 'new-table-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.slugExists
        .mockResolvedValueOnce(true)  // 'new-table' exists
        .mockResolvedValueOnce(false); // 'new-table-1' available

      mockTablesRepo.create.mockResolvedValue(createdTable);

      const result = await service.createTable(insertData);

      expect(result.slug).toBe('new-table-1');
      expect(mockTablesRepo.slugExists).toHaveBeenCalledTimes(2);
    });

    it('should use provided slug if given', async () => {
      const insertData = {
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'New Table',
        slug: 'custom-slug',
        description: 'Test',
      };

      const createdTable = {
        id: mockTableId,
        ...insertData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.slugExists.mockResolvedValue(false);
      mockTablesRepo.create.mockResolvedValue(createdTable);

      const result = await service.createTable(insertData);

      expect(result.slug).toBe('custom-slug');
    });
  });

  describe('updateTable', () => {
    it('should update table', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'Old Name',
        slug: 'old-name',
        description: 'Old',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updateData = {
        name: 'New Name',
        description: 'New',
      };

      const updatedTable = {
        ...mockTable,
        ...updateData,
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockTablesRepo.update.mockResolvedValue(updatedTable);

      const result = await service.updateTable(mockTableId, mockTenantId, updateData);

      expect(result).toEqual(updatedTable);
    });

    it('should throw 404 if table not found', async () => {
      mockTablesRepo.findById.mockResolvedValue(undefined);

      await expect(service.updateTable('non-existent', mockTenantId, { name: 'New' }))
        .rejects
        .toThrow('Table not found');
    });
  });

  describe('deleteTable', () => {
    it('should delete table', async () => {
      const mockTable = {
        id: mockTableId,
        tenantId: mockTenantId,
        ownerUserId: mockUserId,
        name: 'Test Table',
        slug: 'test-table',
        description: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTablesRepo.findById.mockResolvedValue(mockTable);
      mockTablesRepo.delete.mockResolvedValue(undefined);

      await service.deleteTable(mockTableId, mockTenantId);

      expect(mockTablesRepo.delete).toHaveBeenCalledWith(mockTableId, undefined);
    });

    it('should throw 404 if table not found', async () => {
      mockTablesRepo.findById.mockResolvedValue(undefined);

      await expect(service.deleteTable('non-existent', mockTenantId))
        .rejects
        .toThrow('Table not found');
    });
  });
});
