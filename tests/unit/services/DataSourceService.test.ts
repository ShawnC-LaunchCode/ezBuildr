import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import type { DatavaultDatabase } from '@shared/schema';
import type { DatavaultDatabasesRepository } from '../../../server/repositories';
import { DataSourceService } from '../../../server/services/DataSourceService';
import * as repositories from '../../../server/repositories';

// Every method now opens one tenant-scoped transaction at the service boundary
// (RLS-2e). With no tenant in the async context and RLS unenforced,
// `withCurrentTenant` falls through to a plain `db.transaction`; the stub tx is
// ignored by the mocked repository, so the assertions below are unchanged apart
// from the trailing argument.
vi.mock('../../../server/db', () => ({
    db: {
        transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ execute: vi.fn() })),
    },
}));

// Mock the repositories module
vi.mock('../../../server/repositories', () => ({
    datavaultDatabasesRepository: {
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
    },
}));

describe('DataSourceService', () => {
    let service: DataSourceService;
    let mockRepo: Mocked<DatavaultDatabasesRepository>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo = repositories.datavaultDatabasesRepository as Mocked<DatavaultDatabasesRepository>;
        service = new DataSourceService(mockRepo);
    });

    describe('listDataSources', () => {
        it('should return data sources for tenant', async () => {
            const mockSources: DatavaultDatabase[] = [
                {
                    id: '1',
                    name: 'Test',
                    tenantId: 'tenant-1',
                    description: 'desc',
                    type: 'postgres',
                    config: {},
                    scopeType: 'account',
                    scopeId: null,
                    ownerType: null,
                    ownerUuid: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ];
            mockRepo.findByTenantId.mockResolvedValue(mockSources);

            const result = await service.listDataSources('tenant-1');
            expect(result).toEqual(mockSources);
            expect(mockRepo.findByTenantId).toHaveBeenCalledWith('tenant-1', expect.anything());
        });
    });

    describe('getDataSource', () => {
        it('should return null if not found', async () => {
            mockRepo.findById.mockResolvedValue(null);
            const result = await service.getDataSource('ds-1', 'tenant-1');
            expect(result).toBeNull();
        });

        it('should return null if tenant mismatch', async () => {
            mockRepo.findById.mockResolvedValue({
                id: 'ds-1',
                tenantId: 'tenant-2',
                name: 'Test',
                description: 'desc',
                type: 'postgres',
                config: {},
                scopeType: 'account',
                scopeId: null,
                ownerType: null,
                ownerUuid: null,
                createdAt: new Date(),
                updatedAt: new Date()
            } as DatavaultDatabase);

            const result = await service.getDataSource('ds-1', 'tenant-1');
            expect(result).toBeNull();
        });

        it('should return source if valid', async () => {
            const mockSource: DatavaultDatabase = {
                id: 'ds-1',
                tenantId: 'tenant-1',
                name: 'Test',
                description: 'desc',
                type: 'postgres',
                config: {},
                scopeType: 'account',
                scopeId: null,
                ownerType: null,
                ownerUuid: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            mockRepo.findById.mockResolvedValue(mockSource);
            const result = await service.getDataSource('ds-1', 'tenant-1');
            expect(result).toEqual(mockSource);
        });
    });

    describe('createDataSource', () => {
        it('should create data source', async () => {
            const input = {
                name: 'New DB',
                tenantId: 'tenant-1',
                description: 'desc',
                type: 'postgres',
                config: {}
            } as unknown as DatavaultDatabase;
            const created: DatavaultDatabase = {
                ...input,
                id: 'ds-1',
                scopeType: 'account',
                scopeId: null,
                ownerType: null,
                ownerUuid: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            mockRepo.create.mockResolvedValue(created);

            const result = await service.createDataSource(input as Parameters<typeof service.createDataSource>[0]);
            expect(result).toEqual(created);
            expect(mockRepo.create).toHaveBeenCalledWith(input as Parameters<typeof service.createDataSource>[0], expect.anything());
        });
    });

    describe('updateDataSource', () => {
        it('should throw if not exists', async () => {
            mockRepo.existsForTenant.mockResolvedValue(false);
            await expect(service.updateDataSource('ds-1', 'tenant-1', {})).rejects.toThrow(/not found|access denied/);
        });

        it('should update if exists', async () => {
            mockRepo.existsForTenant.mockResolvedValue(true);
            const updated: DatavaultDatabase = {
                id: 'ds-1',
                tenantId: 'tenant-1',
                name: 'Updated',
                description: 'desc',
                type: 'postgres',
                config: {},
                scopeType: 'account',
                scopeId: null,
                ownerType: null,
                ownerUuid: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            mockRepo.update.mockResolvedValue(updated);

            const result = await service.updateDataSource('ds-1', 'tenant-1', { name: 'Updated' });
            expect(result.name).toBe('Updated');
        });
    });

    describe('linkDataSourceToWorkflow', () => {
        it('should throw if source not found', async () => {
            mockRepo.existsForTenant.mockResolvedValue(false);
            await expect(service.linkDataSourceToWorkflow('wf-1', 'ds-1', 'tenant-1')).rejects.toThrow(/not found|access denied/);
        });

        it('should link if source exists', async () => {
            mockRepo.existsForTenant.mockResolvedValue(true);
            await service.linkDataSourceToWorkflow('wf-1', 'ds-1', 'tenant-1');
            expect(mockRepo.linkToWorkflow).toHaveBeenCalledWith('wf-1', 'ds-1', expect.anything());
        });
    });
});
