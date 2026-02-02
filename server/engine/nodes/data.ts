import { v4 as uuidv4 } from 'uuid';

import type { DatavaultRow } from '@shared/schema';

import { datavaultRowsRepository } from '../../repositories/DatavaultRowsRepository';
import { evaluateExpression } from '../expr';

import type { EvalContext } from '../expr';

// ==========================================
// QUERY NODE
// ==========================================

/** Reusable status literals */
const STATUS_EXECUTED = 'executed';
const STATUS_SKIPPED = 'skipped';
const STATUS_ERROR = 'error';

/** Reusable error message string */
const UNKNOWN_ERROR_MSG = 'Unknown error';

/** Row ID required error messages */
const ROW_ID_REQUIRED_DELETE = 'Row ID required for delete';
const ROW_ID_REQUIRED_UPDATE = 'Row ID required for update';

/** Type for a flat row produced by query operations */
type FlatRow = {
    id: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    [key: string]: unknown;
};

/** Type for preview write entries */
interface PreviewWrite {
    deleted?: boolean;
    data?: Record<string, unknown>;
}

/** Type for preview writes map: tableId -> rowId -> PreviewWrite */
type PreviewWritesMap = Record<string, Record<string, PreviewWrite>>;

export interface QueryNodeConfig {
    tableId: string;
    filters?: Array<{
        columnId: string; // or 'createdAt', 'updatedAt'
        operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in';
        value: string; // Expression
    }>;
    limit?: number;
    outputKey: string; // Variable to store result
    condition?: string;
    singleRow?: boolean; // If true, returns object instead of array
}

export interface QueryNodeInput {
    nodeId: string;
    config: QueryNodeConfig;
    context: EvalContext;
    tenantId: string;
}

export interface QueryNodeOutput {
    status: 'executed' | 'skipped' | 'error';
    varName?: string;
    varValue?: unknown;
    skipReason?: string;
    error?: string;
    sideEffects?: Record<string, unknown>;
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Data query with filtering, caching, and preview overlay is inherently complex
export async function executeQueryNode(input: QueryNodeInput): Promise<QueryNodeOutput> {
    const { config, context } = input;

    try {
        if (config.condition !== undefined && config.condition !== null && config.condition !== '' && !evaluateExpression(config.condition, context)) {
            return { status: STATUS_SKIPPED, skipReason: 'condition false' };
        }

        // Optimization: Resolve filter values ONCE before iterating rows
        // This also allows us to build a stable cache key
        const resolvedFilters = config.filters ? config.filters.map(f => ({
            ...f,
            resolvedValue: evaluateExpression(f.value, context)
        })) : [];

        // CACHING LOGIC
        // Generate cache key based on tableId, resolved filters, and limit
        // We include context.executionMode to prevent preview cache leaking to live (though cache is ephemeral per run)
        const cacheKey = JSON.stringify({
            type: 'query',
            tableId: config.tableId,
            filters: resolvedFilters, // contains resolved values
            limit: config.limit,
            singleRow: config.singleRow,
            mode: context.executionMode
        });

        if (context.cache?.queries.has(cacheKey) === true) {
            const cachedResult: unknown = context.cache.queries.get(cacheKey);
            // Store outcome in vars (side effect of execution)
            context.vars[config.outputKey] = cachedResult;
            return {
                status: STATUS_EXECUTED,
                varName: config.outputKey,
                varValue: cachedResult,
                skipReason: 'cached' // Informational
            };
        }

        // 1. Fetch Live Data
        // We use a simplified fetch here. Real impl might need complex filtering repository method.
        // For MVP, we fetch 100 rows and filter in memory if filters are complex, 
        // or rely on repo for basic sorting/pagination.

        // Note: datavaultRowsRepository.getRowsWithValues returns { row, values }
        const rows = await datavaultRowsRepository.getRowsWithValues(config.tableId, {
            limit: 1000,
            showArchived: false,
        });

        // 2. Format as simple objects (combining row metadata + values)
        let flatRows: FlatRow[] = rows.map(r => ({
            id: r.row.id,
            createdAt: r.row.createdAt,
            updatedAt: r.row.updatedAt,
            ...r.values, // columnId -> value
        }));

        // 3. Overlay Preview Writes
        if (context.executionMode === 'preview' && context.writes !== undefined && context.writes !== null) {
            const writes = context.writes as PreviewWritesMap;
            const tableWrites: Record<string, PreviewWrite> = writes[config.tableId] ?? {};

            // Apply updates/creates/deletes
            // tableWrites is Record<rowId, { deleted?: boolean, data?: object }>

            // First, map existing rows by ID for easy access
            const rowMap = new Map<string, FlatRow>(flatRows.map(r => [r.id, r]));

            for (const [rowId, write] of Object.entries(tableWrites)) {
                if (write.deleted === true) {
                    rowMap.delete(rowId);
                } else {
                    // Update or Create
                    const existing: FlatRow = rowMap.get(rowId) ?? { id: rowId, createdAt: new Date(), updatedAt: null };
                    rowMap.set(rowId, { ...existing, ...write.data, updatedAt: new Date() });
                }
            }

            flatRows = Array.from(rowMap.values());
        }

        // 4. Client-side Filtering (Safe for MVP, mirrors DB logic)
        // Uses pre-resolved values for performance (PART 3)
        if (resolvedFilters.length > 0) {
            flatRows = flatRows.filter(row => {
                return resolvedFilters.every(filter => {
                    const rowValue = (row as any)[filter.columnId];
                    const filterValue = filter.resolvedValue;

                    switch (filter.operator) {
                        case 'eq': return rowValue == filterValue;
                        case 'neq': return rowValue != filterValue;
                        case 'gt': return rowValue > filterValue;
                        case 'lt': return rowValue < filterValue;
                        case 'contains': return String(rowValue).includes(String(filterValue));
                        case 'in': return Array.isArray(filterValue) && filterValue.includes(rowValue);
                        default: return true;
                    }
                });
            });
        }

        // 5. Limit and Select
        if (config.limit) {
            flatRows = flatRows.slice(0, config.limit);
        }

        const result = config.singleRow ? (flatRows[0] ?? null) : flatRows;

        // Store outcome
        context.vars[config.outputKey] = result;

        // Populate Cache
        if (context.cache) {
            context.cache.queries.set(cacheKey, result);
        }

        return {
            status: 'executed',
            varName: config.outputKey,
            varValue: result,
        };

    } catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// ==========================================
// WRITE NODE
// ==========================================

export interface WriteNodeConfig {
    tableId: string;
    operation: 'create' | 'update' | 'delete';
    rowId?: string; // Expression, required for update/delete
    data?: Record<string, string>; // columnId -> Expression
    outputKey?: string; // Stores resulting Row ID or Object
    condition?: string;
}

export interface WriteNodeInput {
    nodeId: string;
    config: WriteNodeConfig;
    context: EvalContext;
    tenantId: string;
    userInputs?: Record<string, any>; // Added userInputs to interface
}

export type WriteNodeOutput = QueryNodeOutput; // Same structure

export async function executeWriteNode(input: WriteNodeInput): Promise<WriteNodeOutput> {
    const { nodeId, config, context, tenantId, userInputs } = input;

    try {
        // IDEMPOTENCY GUARD (PART 4)
        if (context.executedSideEffects?.has(nodeId)) {
            // Already executed in this run
            // We treat this as a skip to prevent accidental loops or double-execution
            return {
                status: 'skipped',
                skipReason: 'already executed (idempotency guard)'
            };
        }

        if (config.condition) {
            if (!evaluateExpression(config.condition, context)) {
                return { status: 'skipped', skipReason: 'condition false' };
            }
        }

        // Prepare data
        const dataToWrite: Record<string, any> = {};
        if (config.data) {
            for (const [colId, expr] of Object.entries(config.data)) {
                dataToWrite[colId] = evaluateExpression(expr, context);
            }
        }

        // Identify Row ID
        let rowId = config.rowId ? evaluateExpression(config.rowId, context) : undefined;
        if (config.operation === 'create' && !rowId) {
            // Auto-generate ID if needed, though DB usually handles it. 
            // For Preview, we MUST generate it.
            rowId = uuidv4();
        }

        // PREVIEW MODE
        if (context.executionMode === 'preview') {
            context.writes = context.writes || {};
            if (!context.writes[config.tableId]) {
                context.writes[config.tableId] = {};
            }

            const tableWrites = context.writes[config.tableId];

            if (config.operation === 'delete') {
                if (!rowId) { throw new Error('Row ID required for delete'); }
                tableWrites[rowId] = { deleted: true };
            } else if (config.operation === 'update') {
                if (!rowId) { throw new Error('Row ID required for update'); }
                // We merge with existing "live" data logically, but here we just store the delta
                const currentWrite = tableWrites[rowId] || {};
                tableWrites[rowId] = {
                    ...currentWrite,
                    data: { ...(currentWrite.data || {}), ...dataToWrite }
                };
            } else if (config.operation === 'create') {
                // rowId is already generated above for create
                tableWrites[rowId] = {
                    data: { ...dataToWrite, id: rowId }
                };
            }

            // Store result
            if (config.outputKey) {
                context.vars[config.outputKey] = config.operation === 'create' ? { id: rowId, ...dataToWrite } : rowId;
            }

            // MARK EXECUTED
            if (context.executedSideEffects) {
                context.executedSideEffects.add(nodeId);
            }

            return {
                status: 'executed',
                varName: config.outputKey,
                varValue: config.outputKey ? context.vars[config.outputKey] : undefined, // Mirror live return
                sideEffects: {
                    tableId: config.tableId,
                    operation: config.operation,
                    rowId,
                    changes: config.operation === 'delete' ? { deleted: true } : dataToWrite
                }
            };
        }

        // LIVE MODE
        let result: any;

        if (config.operation === 'create') {
            const { row } = await datavaultRowsRepository.createRowWithValues(
                { tableId: config.tableId, tenantId: tenantId as any } as any, // Type cast for MVP
                Object.entries(dataToWrite).map(([k, v]) => ({ columnId: k, value: v }))
            );
            result = row;
            // Re-fetch to get full object with IDs if needed? Usually just ID is enough.
            if (config.outputKey) { context.vars[config.outputKey] = row; }

        } else if (config.operation === 'update') {
            if (!rowId) { throw new Error('Row ID required for update'); }
            await datavaultRowsRepository.updateRowValues(
                rowId,
                Object.entries(dataToWrite).map(([k, v]) => ({ columnId: k, value: v }))
            );
            result = { id: rowId, ...dataToWrite };
            const outKey = config.outputKey;
            if (outKey) { context.vars[outKey] = result; }

        } else if (config.operation === 'delete') {
            if (!rowId) { throw new Error('Row ID required for delete'); }
            await datavaultRowsRepository.deleteRow(rowId);
            result = { id: rowId, deleted: true };
        }

        // MARK EXECUTED
        if (context.executedSideEffects) {
            context.executedSideEffects.add(nodeId);
        }

        return {
            status: 'executed',
            varName: config.outputKey,
            varValue: config.outputKey ? context.vars[config.outputKey] : undefined
        };

    } catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
