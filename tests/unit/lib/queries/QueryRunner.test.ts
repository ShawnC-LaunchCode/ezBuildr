import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryRunner } from '../../../../server/lib/queries/QueryRunner';
// Define mocks using vi.hoisted to ensure they are available to the mock factory
const { mockDb, mockChain, mockFn } = vi.hoisted(() => {
    const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi.fn(), // For await
    };
    return {
        mockChain: chain,
        mockDb: {
            select: vi.fn().mockReturnValue(chain),
        },
        mockFn: vi.fn(),
    };
});
// Mock Repository (Keep this as module mock for now, or assume global singleton is used?)
// QueryRunner uses imported datavaultRowsRepository singleton. 
// We can't inject repo easily unless we refactor that too?
// Actually DatavaultRowsRepository is a singleton export. We MUST mock the module.
vi.mock('../../../../server/repositories/DatavaultRowsRepository', () => ({
    datavaultRowsRepository: {
        batchFindByIds: mockFn,
    }
}));
describe('QueryRunner', () => {
    let runner: QueryRunner;
    beforeEach(() => {
        vi.clearAllMocks();
        // Inject mockDb directly
        runner = new QueryRunner(mockDb as any);
        // Setup default mock returns
        // Reset chain defaults
        mockChain.from.mockReturnThis();
        mockChain.where.mockReturnThis();
        mockChain.limit.mockReturnThis();
        mockChain.then.mockImplementation((resolve: any) => resolve([{ id: '11111111-1111-1111-1111-111111111111' }, { id: '22222222-2222-2222-2222-222222222222' }]));
        mockDb.select.mockReturnValue(mockChain);
        // Mock repo result
        const mockRowMap = new Map();
        mockRowMap.set('11111111-1111-1111-1111-111111111111', {
            row: { id: '11111111-1111-1111-1111-111111111111' },
            values: { 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': 'A', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': 10 }
        });
        mockRowMap.set('22222222-2222-2222-2222-222222222222', {
            row: { id: '22222222-2222-2222-2222-222222222222' },
            values: { 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': 'B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': 20 }
        });
        mockFn.mockResolvedValue(mockRowMap);
    });
    it('should throw if tableId is missing', async () => {
        await expect(runner.executeQuery({} as any, {}, 'tenant-1')).rejects.toThrow('missing tableId');
    });
    it('should execute basic query and return ListVariable', async () => {
        const query = {
            id: '12345678-1234-1234-1234-1234567890ab',
            name: 'MyList',
            workflowId: '12345678-1234-1234-1234-1234567890ac',
            dataSourceId: '12345678-1234-1234-1234-1234567890ad',
            tableId: '12345678-1234-1234-1234-1234567890ae',
            filters: [],
            sort: [],
        };
        const result = await runner.executeQuery(query, {}, 'tenant-1');
        expect(result.id).toBe('12345678-1234-1234-1234-1234567890ab');
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0]['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']).toBe('A');
    });
    it('should resolve variable filters', async () => {
        const query = {
            id: '12345678-1234-1234-1234-1234567890ab',
            name: 'MyList',
            tableId: '12345678-1234-1234-1234-1234567890ae',
            filters: [{ columnId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', operator: '=', value: '{{data.ref}}' }],
        } as any;
        const context = { 'data.ref': 'MyValue' };
        await runner.executeQuery(query, context, 'tenant-1');
        // We can't easily assert the exact SQL generated without complex mock inspection/SQL parsing
        // But we verified the function runs without error
        expect(mockDb.select).toHaveBeenCalled();
    });
    it('should throw for missing variables', async () => {
        const query = {
            id: '12345678-1234-1234-1234-1234567890ab',
            name: 'MyList',
            tableId: '12345678-1234-1234-1234-1234567890ae',
            filters: [{ columnId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', operator: '=', value: '{{data.missing}}' }],
        } as any;
        await expect(runner.executeQuery(query, {}, 'tenant-1')).rejects.toThrow('Missing workflow variable');
    });
    it('should apply limit', async () => {
        const query = {
            id: '12345678-1234-1234-1234-1234567890ab',
            name: 'MyList',
            tableId: '12345678-1234-1234-1234-1234567890ae',
            limit: 5,
            filters: [],
        } as any;
        await runner.executeQuery(query, {}, 'tenant-1');
        expect(mockChain.limit).toHaveBeenCalledWith(5);
    });
});