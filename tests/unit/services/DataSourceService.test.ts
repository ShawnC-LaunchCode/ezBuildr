import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataSourceService } from '../../../server/services/DataSourceService';
import type { DatavaultDatabasesRepository } from '../../../server/repositories/DatavaultDatabasesRepository';

describe('DataSourceService', () => {
    let service: DataSourceService;
    let mockRepo: any;

    beforeEach(() => {
        mockRepo = {
            findByTenantId: vi.fn(),
            findById: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            existsForTenant: vi.fn(),
            findByWorkflowId: vi.fn(),
            linkToWorkflow: vi.fn(),
            unlinkFromWorkflow: vi.fn(),
            getTablesInDatabase: vi.fn(),
        };
        service = new DataSourceService(mockRepo as unknown as DatavaultDatabasesRepository);
    });

    describe('listDataSources', () => {
        it('should return data sources for tenant', async () => {
            const mockSources = [{ id: '1', name: 'Test' }];
            mockRepo.findByTenantId.mockResolvedValue(mockSources);

            const result = await service.listDataSources('tenant-1');
            expect(result).toEqual(mockSources);
            expect(mockRepo.findByTenantId).toHaveBeenCalledWith('tenant-1');
        });
    });

    describe('getDataSource', () => {
        it('should return null if not found', async () => {
            mockRepo.findById.mockResolvedValue(null);
            const result = await service.getDataSource('ds-1', 'tenant-1');
            expect(result).toBeNull();
        });

        it('should return null if tenant mismatch', async () => {
            mockRepo.findById.mockResolvedValue({ id: 'ds-1', tenantId: 'tenant-2' });
            const result = await service.getDataSource('ds-1', 'tenant-1');
            expect(result).toBeNull();
        });

        it('should return source if valid', async () => {
            const mockSource = { id: 'ds-1', tenantId: 'tenant-1' };
            mockRepo.findById.mockResolvedValue(mockSource);
            const result = await service.getDataSource('ds-1', 'tenant-1');
            expect(result).toEqual(mockSource);
        });
    });

    describe('createDataSource', () => {
        it('should create data source', async () => {
            const input = { name: 'New DB', tenantId: 'tenant-1' } as any;
            const created = { ...input, id: 'ds-1' };
            mockRepo.create.mockResolvedValue(created);

            const result = await service.createDataSource(input);
            expect(result).toEqual(created);
            expect(mockRepo.create).toHaveBeenCalledWith(input);
        });
    });

    describe('updateDataSource', () => {
        it('should throw if not exists', async () => {
            mockRepo.existsForTenant.mockResolvedValue(false);
            await expect(service.updateDataSource('ds-1', 'tenant-1', {})).rejects.toThrow('not found');
        });

        it('should update if exists', async () => {
            mockRepo.existsForTenant.mockResolvedValue(true);
            mockRepo.update.mockResolvedValue({ id: 'ds-1', name: 'Updated' });

            const result = await service.updateDataSource('ds-1', 'tenant-1', { name: 'Updated' });
            expect(result.name).toBe('Updated');
        });
    });

    describe('linkDataSourceToWorkflow', () => {
        it('should throw if source not found', async () => {
            mockRepo.existsForTenant.mockResolvedValue(false);
            await expect(service.linkDataSourceToWorkflow('wf-1', 'ds-1', 'tenant-1')).rejects.toThrow('not found');
        });

        it('should link if source exists', async () => {
            mockRepo.existsForTenant.mockResolvedValue(true);
            await service.linkDataSourceToWorkflow('wf-1', 'ds-1', 'tenant-1');
            expect(mockRepo.linkToWorkflow).toHaveBeenCalledWith('wf-1', 'ds-1');
        });
    });
});
