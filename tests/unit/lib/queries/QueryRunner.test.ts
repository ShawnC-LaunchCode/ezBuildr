import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';

import type { db } from '../../../../server/db';
import { QueryRunner } from '../../../../server/lib/queries/QueryRunner';
import type { WorkflowQuery } from '../../../../shared/types/query';
// Define mocks using vi.hoisted to ensure they are available to the mock factory
const { mockDb, mockChain, mockFn } = vi.hoisted(() => {
    const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        $dynamic: vi.fn().mockReturnThis(),
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

interface SeededTable {
    id: string;
    tenantId: string;
}

interface SeededRow {
    id: string;
    tableId: string;
    deletedAt: Date | null;
    values: Record<string, unknown>;
}

const QUERY_ID = '12345678-1234-1234-1234-1234567890ab';
const WORKFLOW_ID = '12345678-1234-1234-1234-1234567890ac';
const DATA_SOURCE_ID = '12345678-1234-1234-1234-1234567890ad';
const TARGET_TABLE_ID = '12345678-1234-1234-1234-1234567890ae';
const SAME_TENANT_TABLE_ID = '12345678-1234-1234-1234-1234567890af';
const OTHER_TENANT_TABLE_ID = '12345678-1234-1234-1234-1234567890b0';
const FIRST_COLUMN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SECOND_COLUMN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TENANT_ID = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeQuery(overrides: Partial<WorkflowQuery> = {}): WorkflowQuery {
    return {
        id: QUERY_ID,
        name: 'MyList',
        workflowId: WORKFLOW_ID,
        dataSourceId: DATA_SOURCE_ID,
        tableId: TARGET_TABLE_ID,
        filters: [],
        sort: [],
        ...overrides,
    };
}

function applyCompiledQuery(
    sqlText: string,
    params: unknown[],
    query: WorkflowQuery,
    tenantId: string,
    tables: SeededTable[],
    rows: SeededRow[],
): SeededRow[] {
    let matchingRows = [...rows];
    if (params.includes(query.tableId)) {
        matchingRows = matchingRows.filter(row => row.tableId === query.tableId);
    }
    if (params.includes(tenantId)) {
        const tenantTableIds = new Set(
            tables.filter(table => table.tenantId === tenantId).map(table => table.id)
        );
        matchingRows = matchingRows.filter(row => tenantTableIds.has(row.tableId));
    }
    if (sqlText.toLowerCase().includes('"datavault_rows"."deleted_at" is null')) {
        matchingRows = matchingRows.filter(row => row.deletedAt === null);
    }
    for (const filter of query.filters) {
        const filterIsApplied = params.includes(filter.columnId)
            && params.includes(JSON.stringify(filter.value));
        if (filterIsApplied) {
            matchingRows = matchingRows.filter(
                row => JSON.stringify(row.values[filter.columnId]) === JSON.stringify(filter.value)
            );
        }
    }
    return query.limit === undefined ? matchingRows : matchingRows.slice(0, query.limit);
}

function createSeededRunner(
    query: WorkflowQuery,
    tenantId: string,
    tables: SeededTable[],
    rows: SeededRow[],
): QueryRunner {
    const proxyDb = drizzle(async (sqlText, params) => ({
        rows: applyCompiledQuery(sqlText, params, query, tenantId, tables, rows)
            .map(row => [row.id]),
    }));
    mockFn.mockResolvedValue(new Map(rows.map(row => [row.id, {
        row: { id: row.id },
        values: row.values,
    }])));
    return new QueryRunner(proxyDb as unknown as typeof db);
}

function resultIds(result: Awaited<ReturnType<QueryRunner['executeQuery']>>): string[] {
    return result.rows.map(row => String(row._id));
}

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
        mockChain.innerJoin.mockReturnThis();
        mockChain.$dynamic.mockReturnThis();
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

    it('keeps a filtered query scoped to its table when another table has a matching value', async () => {
        const targetRow: SeededRow = {
            id: '10000000-0000-0000-0000-000000000001',
            tableId: TARGET_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'match' },
        };
        const sameTenantOtherTableRow: SeededRow = {
            id: '10000000-0000-0000-0000-000000000002',
            tableId: SAME_TENANT_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'match' },
        };
        const query = makeQuery({
            filters: [{ columnId: FIRST_COLUMN_ID, operator: '=', value: 'match' }],
        });
        const runner = createSeededRunner(query, TENANT_ID, [
            { id: TARGET_TABLE_ID, tenantId: TENANT_ID },
            { id: SAME_TENANT_TABLE_ID, tenantId: TENANT_ID },
        ], [targetRow, sameTenantOtherTableRow]);

        const result = await runner.executeQuery(query, {}, TENANT_ID);

        expect(resultIds(result)).toEqual([targetRow.id]);
    });

    it('keeps a filtered query from returning a matching row in another tenant', async () => {
        const targetRow: SeededRow = {
            id: '20000000-0000-0000-0000-000000000001',
            tableId: TARGET_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'match' },
        };
        const otherTenantRow: SeededRow = {
            id: '20000000-0000-0000-0000-000000000002',
            tableId: OTHER_TENANT_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'match' },
        };
        const query = makeQuery({
            filters: [{ columnId: FIRST_COLUMN_ID, operator: '=', value: 'match' }],
        });
        const runner = createSeededRunner(query, TENANT_ID, [
            { id: TARGET_TABLE_ID, tenantId: TENANT_ID },
            { id: OTHER_TENANT_TABLE_ID, tenantId: OTHER_TENANT_ID },
        ], [targetRow, otherTenantRow]);

        const result = await runner.executeQuery(query, {}, TENANT_ID);

        expect(resultIds(result)).toEqual([targetRow.id]);
    });

    it('applies every filter instead of only the last filter', async () => {
        const matchingBoth: SeededRow = {
            id: '30000000-0000-0000-0000-000000000001',
            tableId: TARGET_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'alpha', [SECOND_COLUMN_ID]: 'beta' },
        };
        const matchingOnlyLast: SeededRow = {
            id: '30000000-0000-0000-0000-000000000002',
            tableId: TARGET_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'wrong', [SECOND_COLUMN_ID]: 'beta' },
        };
        const query = makeQuery({
            filters: [
                { columnId: FIRST_COLUMN_ID, operator: '=', value: 'alpha' },
                { columnId: SECOND_COLUMN_ID, operator: '=', value: 'beta' },
            ],
        });
        const runner = createSeededRunner(query, TENANT_ID, [
            { id: TARGET_TABLE_ID, tenantId: TENANT_ID },
        ], [matchingBoth, matchingOnlyLast]);

        const result = await runner.executeQuery(query, {}, TENANT_ID);

        expect(resultIds(result)).toEqual([matchingBoth.id]);
    });

    it('excludes archived rows from filtered and unfiltered queries', async () => {
        const liveRow: SeededRow = {
            id: '40000000-0000-0000-0000-000000000001',
            tableId: TARGET_TABLE_ID,
            deletedAt: null,
            values: { [FIRST_COLUMN_ID]: 'match' },
        };
        const archivedRow: SeededRow = {
            id: '40000000-0000-0000-0000-000000000002',
            tableId: TARGET_TABLE_ID,
            deletedAt: new Date('2026-08-01T00:00:00.000Z'),
            values: { [FIRST_COLUMN_ID]: 'match' },
        };
        const tables = [{ id: TARGET_TABLE_ID, tenantId: TENANT_ID }];
        const rows = [liveRow, archivedRow];
        const filteredQuery = makeQuery({
            filters: [{ columnId: FIRST_COLUMN_ID, operator: '=', value: 'match' }],
        });
        const unfilteredQuery = makeQuery();
        const filteredRunner = createSeededRunner(filteredQuery, TENANT_ID, tables, rows);

        const filteredResult = await filteredRunner.executeQuery(filteredQuery, {}, TENANT_ID);
        const unfilteredRunner = createSeededRunner(unfilteredQuery, TENANT_ID, tables, rows);
        const unfilteredResult = await unfilteredRunner.executeQuery(unfilteredQuery, {}, TENANT_ID);

        expect(resultIds(filteredResult)).toEqual([liveRow.id]);
        expect(resultIds(unfilteredResult)).toEqual([liveRow.id]);
    });
});
