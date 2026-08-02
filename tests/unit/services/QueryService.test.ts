import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { QueryService } from '../../../server/services/QueryService';
import { classifyRouteError } from '../../../server/utils/routeErrors';

import type { WorkflowQuery } from '../../../shared/types/query';

describe('QueryService', () => {
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const otherTenantId = '10000000-0000-4000-8000-000000000002';
    const workflowId = '20000000-0000-4000-8000-000000000001';
    const projectId = '30000000-0000-4000-8000-000000000001';
    const creatorId = '40000000-0000-4000-8000-000000000001';
    const queryId = '50000000-0000-4000-8000-000000000001';
    const dataSourceId = '60000000-0000-4000-8000-000000000001';
    const tableId = '70000000-0000-4000-8000-000000000001';

    const query: WorkflowQuery = {
        id: queryId,
        workflowId,
        dataSourceId,
        tableId,
        name: 'Customers',
        filters: [],
        sort: [],
        limit: 100,
    };

    let queryRepo: {
        findById: Mock;
        findByWorkflowId: Mock;
        create: Mock;
        update: Mock;
        delete: Mock;
    };
    let workflowRepo: { findById: Mock };
    let projectRepo: { findById: Mock };
    let userRepo: { findById: Mock };
    let service: QueryService;

    beforeEach(() => {
        queryRepo = {
            findById: vi.fn().mockResolvedValue(query),
            findByWorkflowId: vi.fn().mockResolvedValue([query]),
            create: vi.fn().mockResolvedValue(query),
            update: vi.fn().mockResolvedValue(query),
            delete: vi.fn().mockResolvedValue(undefined),
        };
        workflowRepo = {
            findById: vi.fn().mockResolvedValue({ id: workflowId, projectId, creatorId }),
        };
        projectRepo = {
            findById: vi.fn().mockResolvedValue({ id: projectId, tenantId }),
        };
        userRepo = {
            findById: vi.fn(),
        };
        service = new QueryService(
            queryRepo as unknown as ConstructorParameters<typeof QueryService>[0],
            workflowRepo as unknown as ConstructorParameters<typeof QueryService>[1],
            projectRepo as unknown as ConstructorParameters<typeof QueryService>[2],
            userRepo as unknown as ConstructorParameters<typeof QueryService>[3],
        );
    });

    it('creates a query only when its workflow belongs to the tenant', async () => {
        const createData: Omit<WorkflowQuery, 'id'> = {
            workflowId,
            dataSourceId,
            tableId,
            name: 'Customers',
            filters: [],
            sort: [],
            limit: 100,
        };

        await expect(service.createQuery(createData, tenantId)).resolves.toEqual(query);
        expect(queryRepo.create).toHaveBeenCalledWith(createData);

        projectRepo.findById.mockResolvedValueOnce({ id: projectId, tenantId: otherTenantId });

        await expect(service.createQuery(createData, tenantId))
            .rejects.toThrow('Access denied - workflow belongs to different tenant');
        expect(queryRepo.create).toHaveBeenCalledTimes(1);
    });

    it('gets a query only for its owning tenant', async () => {
        await expect(service.getQuery(queryId, tenantId)).resolves.toEqual(query);

        projectRepo.findById.mockResolvedValueOnce({ id: projectId, tenantId: otherTenantId });
        const denied = await service.getQuery(queryId, tenantId).catch((error: unknown) => error);

        expect(denied).toEqual(expect.objectContaining({
            message: 'Access denied - workflow belongs to different tenant',
        }));
        expect(classifyRouteError(denied, 'Failed to get query').status).toBe(403);
    });

    it('lists queries only when the workflow belongs to the tenant', async () => {
        await expect(service.listQueriesForWorkflow(workflowId, tenantId)).resolves.toEqual([query]);
        expect(queryRepo.findByWorkflowId).toHaveBeenCalledWith(workflowId);

        projectRepo.findById.mockResolvedValueOnce({ id: projectId, tenantId: otherTenantId });

        await expect(service.listQueriesForWorkflow(workflowId, tenantId))
            .rejects.toThrow('Access denied - workflow belongs to different tenant');
        expect(queryRepo.findByWorkflowId).toHaveBeenCalledTimes(1);
    });

    it('blocks cross-tenant updates before reaching the repository', async () => {
        projectRepo.findById.mockResolvedValueOnce({ id: projectId, tenantId: otherTenantId });

        const denied = await service.updateQuery(queryId, { name: 'Blocked' }, tenantId)
            .catch((error: unknown) => error);

        expect(classifyRouteError(denied, 'Failed to update query').status).toBe(403);
        expect(queryRepo.update).not.toHaveBeenCalled();
    });

    it('blocks cross-tenant deletes before reaching the repository', async () => {
        projectRepo.findById.mockResolvedValueOnce({ id: projectId, tenantId: otherTenantId });

        const denied = await service.deleteQuery(queryId, tenantId)
            .catch((error: unknown) => error);

        expect(classifyRouteError(denied, 'Failed to delete query').status).toBe(403);
        expect(queryRepo.delete).not.toHaveBeenCalled();
    });

    it('updates only the explicitly allowed fields', async () => {
        const attemptedUpdates: Partial<WorkflowQuery> = {
            name: 'Active customers',
            filters: [{
                columnId: '80000000-0000-4000-8000-000000000001',
                operator: '=',
                value: 'active',
            }],
            sort: [{
                columnId: '80000000-0000-4000-8000-000000000002',
                direction: 'asc',
            }],
            limit: 25,
            workflowId: '20000000-0000-4000-8000-000000000099',
            dataSourceId: '60000000-0000-4000-8000-000000000099',
            tableId: '70000000-0000-4000-8000-000000000099',
        };

        await expect(service.updateQuery(queryId, attemptedUpdates, tenantId)).resolves.toEqual(query);
        expect(queryRepo.update).toHaveBeenCalledWith(queryId, {
            name: attemptedUpdates.name,
            filters: attemptedUpdates.filters,
            sort: attemptedUpdates.sort,
            limit: attemptedUpdates.limit,
        });
    });

    it('deletes an owned query through the repository', async () => {
        await service.deleteQuery(queryId, tenantId);

        expect(queryRepo.delete).toHaveBeenCalledWith(queryId);
    });

    it('falls back to the workflow creator tenant when no project resolves', async () => {
        projectRepo.findById.mockResolvedValueOnce(undefined);
        userRepo.findById.mockResolvedValueOnce({ id: creatorId, tenantId });

        await expect(service.getQuery(queryId, tenantId)).resolves.toEqual(query);
        expect(userRepo.findById).toHaveBeenCalledWith(creatorId);
    });

    it('returns a not-found error for an unknown query without checking ownership', async () => {
        queryRepo.findById.mockResolvedValueOnce(undefined);

        const missing = await service.getQuery(queryId, tenantId).catch((error: unknown) => error);

        expect(classifyRouteError(missing, 'Failed to get query').status).toBe(404);
        expect(workflowRepo.findById).not.toHaveBeenCalled();
    });
});
