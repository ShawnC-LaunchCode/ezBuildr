import { and, eq, exists, sql, desc, asc, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { datavaultRows, datavaultTables, datavaultValues } from '@shared/schema';
import type { WorkflowQuery, QueryFilter, QueryListVariable } from '@shared/types/query';

import { db } from '../../db';
import { datavaultRowsRepository } from '../../repositories/DatavaultRowsRepository';
import { withTenant } from '../../utils/rlsContext';

import type { DbTransaction } from '../../repositories';

export class QueryRunner {
    private db: typeof db;
    constructor(dbInstance?: typeof db) {
        this.db = dbInstance ?? db;
    }
    /**
     * Execute a defined query against the native data store
     * @param query The workflow query definition
     * @param contextVariables Runtime variables { "data.foo": "value" } for filter substitution
     * @param tenantId The tenant ID for security scoping
     */
    async executeQuery(
        query: WorkflowQuery,
        contextVariables: Record<string, unknown>,
        tenantId: string
    ): Promise<QueryListVariable> {
        // 1. Basic Validation
        if (!query.tableId) { throw new Error('Query missing tableId'); }
        // RLS-5: `datavault_rows`, `datavault_values` and `datavault_tables`
        // are all covered (migration 0011). Query blocks run inside a workflow
        // run, which can be reached with no ambient tenant (a run token, or the
        // background completion worker), so the tenant the caller resolved is
        // pinned explicitly. The `eq(datavaultTables.tenantId, tenantId)`
        // predicate below stays — RLS is the backstop, not the replacement.
        return withTenant(tenantId, (tx) => this.executeQueryInTx(query, contextVariables, tenantId, tx));
    }

    // eslint-disable-next-line complexity
    private async executeQueryInTx(
        query: WorkflowQuery,
        contextVariables: Record<string, unknown>,
        tenantId: string,
        tx: DbTransaction
    ): Promise<QueryListVariable> {
        // 2. Resolve Filter Values
        const resolvedFilters = this.resolveFilters(query.filters, contextVariables);
        // 3. Build the complete condition set before applying a single WHERE clause.
        const conditions: SQL[] = [
            eq(datavaultRows.tableId, query.tableId),
            eq(datavaultTables.tenantId, tenantId),
            isNull(datavaultRows.deletedAt),
        ];
        // 4. Apply Filters using EXISTS subqueries
        // For each filter, we ensure a value exists for that column matching the criteria
        for (const filter of resolvedFilters) {
            const v = alias(datavaultValues, `v_${filter.columnId.replace(/-/g, '_')}`);
            let condition;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const value = filter.value;
            const jsonValue = JSON.stringify(value);
            switch (filter.operator) {
                case '=':
                    condition = sql`${v.value} = ${jsonValue}::jsonb`;
                    break;
                case '!=':
                    condition = sql`${v.value} != ${jsonValue}::jsonb`;
                    break;
                case '>':
                    condition = sql`${v.value} > ${jsonValue}::jsonb`;
                    break;
                case '>=':
                    condition = sql`${v.value} >= ${jsonValue}::jsonb`;
                    break;
                case '<':
                    condition = sql`${v.value} < ${jsonValue}::jsonb`;
                    break;
                case '<=':
                    condition = sql`${v.value} <= ${jsonValue}::jsonb`;
                    break;
                case 'contains':
                    // JSONB string containment or array containment
                    // eslint-disable-next-line sonarjs/no-nested-template-literals
                    condition = sql`${v.value}::text LIKE ${`%${value}%`}`;
                    break;
                case 'startsWith':
                    // eslint-disable-next-line sonarjs/no-nested-template-literals
                    condition = sql`${v.value}::text LIKE ${`${value}%`}`;
                    break;
                case 'endsWith':
                    // eslint-disable-next-line sonarjs/no-nested-template-literals
                    condition = sql`${v.value}::text LIKE ${`%${value}`}`;
                    break;
                case 'in':
                    if (Array.isArray(value)) {
                        const jsonVal = JSON.stringify(value);
                        condition = sql`${jsonVal}::jsonb @> ${v.value}`;
                    }
                    break;
                case 'is_empty':
                    condition = sql`${v.value} IS NULL OR ${v.value}::text = '""' OR ${v.value}::text = 'null'`;
                    break;
                case 'is_not_empty':
                    condition = sql`${v.value} IS NOT NULL AND ${v.value}::text != '""' AND ${v.value}::text != 'null'`;
                    break;
            }
            if (condition) {
                conditions.push(exists(
                    tx.select({ one: sql`1` })
                        .from(v)
                        .where(and(
                            eq(v.rowId, datavaultRows.id),
                            eq(v.columnId, filter.columnId),
                            condition
                        ))
                ));
            }
        }
        // 5. Apply Sorting
        // Complex part: Sorting by EAV values requires joining or subqueries in ORDER BY
        // For MVP, if we have a sort, we can join onto that specific column
        // Or simpler: We fetch IDs, then fetch full data and sort in memory if the dataset is smallish (limit < 1000)
        // The prompt says "Apply sorting... Return ListVariable".
        // DB sorting is better for pagination.
        // Let's implement primary sort column logic
        let sqlQuery = tx.select({ id: datavaultRows.id })
            .from(datavaultRows)
            .innerJoin(datavaultTables, eq(datavaultRows.tableId, datavaultTables.id))
            .$dynamic();
        const primarySort = query.sort?.at(0); // Multi-sort later
        const sortAlias = alias(datavaultValues, 'sort_val');
        if (primarySort) {
            sqlQuery = sqlQuery.leftJoin(sortAlias, and(
                eq(sortAlias.rowId, datavaultRows.id),
                eq(sortAlias.columnId, primarySort.columnId)
            ));
        }

        sqlQuery = sqlQuery.where(and(...conditions));
        sqlQuery = primarySort
            ? sqlQuery.orderBy(primarySort.direction === 'desc'
                ? desc(sortAlias.value)
                : asc(sortAlias.value))
            : sqlQuery.orderBy(desc(datavaultRows.createdAt));

        // 6. Limit

        if (query.limit) {
            sqlQuery = sqlQuery.limit(query.limit);
        }
        // Execute ID fetch
        const results = await sqlQuery;
        const rowIds = results.map((r: { id: string }) => r.id);
        // 7. Fetch Full Data (Hydrate)
        // We need the data in the ListVariable format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic EAV data
        let rows: Record<string, any>[] = [];
        let columnIds: string[] = [];
        if (rowIds.length > 0) {
            // Filter to match the exact IDs we found (since repository method might do its own thing or we re-use batch find)
            // Actually getRowsWithValues might not take specific IDs. 
            // Better to use batchFindByIds which we implemented in Prompt 1 (or I saw in the file).
            const request = [{ tableId: query.tableId, rowIds }];
            const batchMap = await datavaultRowsRepository.batchFindByIds(request, tx);
            rows = rowIds.map((id: string) => {
                const entry = batchMap.get(id);
                if (!entry) { return null; }
                // Merge row metadata + values
                return {
                    _id: entry.row.id,
                    _createdAt: entry.row.createdAt,
                    _updatedAt: entry.row.updatedAt,
                    ...entry.values
                };
            }).filter(Boolean) as Record<string, unknown>[];
            // Extract all unique column IDs encountered
            const colSet = new Set<string>();
            rows.forEach((r: Record<string, unknown>) => Object.keys(r).forEach(k => {
                if (!k.startsWith('_')) { colSet.add(k); }
            }));
            columnIds = Array.from(colSet);
        }
        return {
            id: query.id,
            name: query.name,
            tableId: query.tableId,
            rows,
            rowCount: rows.length, // Valid for this page. Total count would require separate query.
            columnIds
        };
    }
    /**
     * Resolve variables in filters (e.g. {{data.foo}}) to actual values
     */
    private resolveFilters(filters: QueryFilter[], context: Record<string, unknown>): QueryFilter[] {
        return filters.map(f => {
            // Deep copy to avoid mutating original
            const newFilter = { ...f };
            // If value is a string starting with {{ and ending with }}, try to resolve
            if (typeof newFilter.value === 'string' && newFilter.value.startsWith('{{') && newFilter.value.endsWith('}}')) {
                const path = newFilter.value.slice(2, -2).trim();
                // Simple resolution for now
                // In real app, traverse object path. 
                // For now assume flat or rely on context having the key
                if (context[path] !== undefined) {
                    newFilter.value = context[path];
                } else {
                    // If variable missing, what strictly? 
                    // Prompt says "Detect error... missing workflow variables".
                    // For now, let's leave as undefined or throw?
                    // Throwing is safer for "Detect error" req.
                    throw new Error(`Missing workflow variable: ${path}`);
                }
            }
            return newFilter;
        });
    }
}
export const queryRunner = new QueryRunner();
