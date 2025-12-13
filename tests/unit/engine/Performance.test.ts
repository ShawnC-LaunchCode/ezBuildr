import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeQueryNode, executeWriteNode, type QueryNodeInput, type WriteNodeInput } from '../../../server/engine/nodes/data';
import { datavaultRowsRepository } from '../../../server/repositories/DatavaultRowsRepository';
import { EvalContext } from '../../../server/engine/expr';

// Mock repository
vi.mock('../../../server/repositories/DatavaultRowsRepository', () => ({
    datavaultRowsRepository: {
        getRowsWithValues: vi.fn(),
        createRowWithValues: vi.fn(),
        updateRowValues: vi.fn(),
        deleteRow: vi.fn(),
    }
}));

describe('Performance & Caching', () => {
    let context: EvalContext;

    beforeEach(() => {
        vi.clearAllMocks();
        context = {
            vars: {},
            executionMode: 'live',
            cache: {
                queries: new Map(),
                scripts: new Map()
            },
            metrics: {
                dbTimeMs: 0,
                jsTimeMs: 0,
                queryCount: 0
            },
            executedSideEffects: new Set()
        };
    });

    describe('QueryNode Caching', () => {
        const tableId = 'table-123';
        const config = {
            tableId,
            outputKey: 'results',
            limit: 10
        };

        it('should cache query results based on inputs', async () => {
            const nodeInput: QueryNodeInput = {
                nodeId: 'query-node-1',
                config: config as any,
                context,
                tenantId: 'tenant-1'
            };

            // Setup mock
            const mockRows = [{ row: { id: 'row1' }, values: { col1: 'val1' } }];
            (datavaultRowsRepository.getRowsWithValues as any).mockResolvedValue(mockRows);

            // First execution
            const result1 = await executeQueryNode(nodeInput);
            expect(result1.error).toBeUndefined();
            expect(result1.status).toBe('executed');
            expect(datavaultRowsRepository.getRowsWithValues).toHaveBeenCalledTimes(1);

            // Second execution (same inputs)
            const result2 = await executeQueryNode(nodeInput);
            expect(result2.error).toBeUndefined();
            expect(result2.status).toBe('executed');
            expect(result2.skipReason).toBe('cached');
            // Should NOT call repo again
            expect(datavaultRowsRepository.getRowsWithValues).toHaveBeenCalledTimes(1);
        });

        it('should invalidate cache when filters change', async () => {
            const nodeInput: QueryNodeInput = {
                nodeId: 'query-node-1',
                config: config as any,
                context,
                tenantId: 'tenant-1'
            };

            const mockRows = [{ row: { id: 'row1' }, values: { col1: 'val1' } }];
            (datavaultRowsRepository.getRowsWithValues as any).mockResolvedValue(mockRows);

            // Run 1: Filter A
            context.vars['status'] = 'active';
            const input1 = {
                ...nodeInput,
                config: { ...config, filters: [{ columnId: 'status', operator: 'eq', value: 'status' }] } // value is expression 'status' -> vars.status
            };
            await executeQueryNode(input1 as any);

            // Run 2: Filter B (change variable)
            context.vars['status'] = 'archived';
            // Same node config, but variable value changed
            await executeQueryNode(input1 as any);

            // Expect 2 calls because resolved filter value changed
            expect(datavaultRowsRepository.getRowsWithValues).toHaveBeenCalledTimes(2);
        });
    });

    describe('WriteNode Idempotency', () => {
        const tableId = 'table-123';
        const config = {
            tableId,
            operation: 'create',
            data: { col1: '"test"' } // Expression
        };

        it('should prevent double execution in same run', async () => {
            const nodeInput: WriteNodeInput = {
                nodeId: 'write-node-1',
                config: config as any,
                context,
                tenantId: 'tenant-1'
            };

            (datavaultRowsRepository.createRowWithValues as any).mockResolvedValue({ row: { id: 'new-row' } });

            // First execution
            const result1 = await executeWriteNode(nodeInput);
            expect(result1.error).toBeUndefined();
            expect(result1.status).toBe('executed');
            expect(datavaultRowsRepository.createRowWithValues).toHaveBeenCalledTimes(1);

            // Second execution
            const result2 = await executeWriteNode(nodeInput);
            expect(result2.status).toBe('skipped');
            expect(result2.skipReason).toContain('idempotency');
            expect(datavaultRowsRepository.createRowWithValues).toHaveBeenCalledTimes(1);
        });
    });
});
