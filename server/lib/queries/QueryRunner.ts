import { and, eq, exists, sql, desc, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { datavaultRows, datavaultValues } from '@shared/schema';
import type { WorkflowQuery, QueryFilter, QuerySort, ListVariable } from '@shared/types/query';

import { db } from '../../db';
import { datavaultRowsRepository } from '../../repositories/DatavaultRowsRepository';
export class QueryRunner {
    private db: typeof db;
    constructor(dbInstance?: typeof db) {
        this.db = dbInstance || db;
    }
    /**
     * Execute a defined query against the native data store
     * @param query The workflow query definition
     * @param contextVariables Runtime variables { "data.foo": "value" } for filter substitution
     * @param tenantId The tenant ID for security scoping
     */
    async executeQuery(
        query: WorkflowQuery,
        contextVariables: Record<string, any>,
        tenantId: string
    ): Promise<ListVariable> {
        // 1. Basic Validation
        if (!query.tableId) {throw new Error('Query missing tableId');}
        // 2. Resolve Filter Values
        const resolvedFilters = this.resolveFilters(query.filters, contextVariables);
        // 3. Build Query
        // We select rows from datavaultRows where...
        const sqlQuery = this.db.select({ id: datavaultRows.id })
            .from(datavaultRows)
            .where(and(
                eq(datavaultRows.tableId, query.tableId),
                // Filter out archived rows (unless specific requirement says otherwise, usually queries are live data)
                sql`${datavaultRows.deletedAt} IS NULL`
            ));
        // 4. Apply Filters using EXISTS subqueries
        // For each filter, we ensure a value exists for that column matching the criteria
        for (const filter of resolvedFilters) {
            const v = alias(datavaultValues, `v_${filter.columnId.replace(/-/g, '_')}`);
            let condition;
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
                    condition = sql`${v.value}::text LIKE ${`%${value}%`}`;
                    break;
                case 'startsWith':
                    condition = sql`${v.value}::text LIKE ${`${value}%`}`;
                    break;
                case 'endsWith':
                    condition = sql`${v.value}::text LIKE ${`%${value}`}`;
                    break;
                case 'in':
                    if (Array.isArray(value)) {
                        // For JSONB 'in', we might need to be careful. 
                        // Ideally: value is an array, we check if v.value is in that array.
                        // Simplest is to assume value is a JSON array
                        const jsonVal = JSON.stringify(value);
                        condition = sql`${v.value} <@ ${jsonVal}::jsonb`; // This checks if v.value is contained in the right side array? No, <@ is "is contained by".
                        // Correct way for "value IN list":
                        // If we cast both to native, drizzle inArray might work if we select the value? 
                        // But we are in a subquery. 
                        // Let's rely on JSONB containment or just multiple checks if small list.
                        // Actually, Drizzle sql operator for jsonb containment is @> (contains) and <@ (contained in).
                        condition = sql`${jsonVal}::jsonb @> ${v.value}`; // Right side contains left side (row value)
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
                (sqlQuery as any).where(exists(
                    this.db.select({ one: sql`1` })
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
        if (query.sort && query.sort.length > 0) {
            const primarySort = query.sort[0]; // Multi-sort later
            const sortAlias = alias(datavaultValues, 'sort_val');
            sqlQuery
                .leftJoin(sortAlias, and(
                    eq(sortAlias.rowId, datavaultRows.id),
                    eq(sortAlias.columnId, primarySort.columnId)
                ))
                .orderBy(primarySort.direction === 'desc' ? desc(sortAlias.value) : asc(sortAlias.value));
        } else {
            // Default sort by createdAt desc
            sqlQuery.orderBy(desc(datavaultRows.createdAt));
        }
        // 6. Limit
        if (query.limit) {
            sqlQuery.limit(query.limit);
        }
        // Execute ID fetch
        const results = await sqlQuery;
        const rowIds = results.map((r: { id: string }) => r.id);
        // 7. Fetch Full Data (Hydrate)
        // We need the data in the ListVariable format
        let rows: Record<string, any>[] = [];
        let columnIds: string[] = [];
        if (rowIds.length > 0) {
            // Filter to match the exact IDs we found (since repository method might do its own thing or we re-use batch find)
            // Actually getRowsWithValues might not take specific IDs. 
            // Better to use batchFindByIds which we implemented in Prompt 1 (or I saw in the file).
            const request = [{ tableId: query.tableId, rowIds }];
            const batchMap = await datavaultRowsRepository.batchFindByIds(request);
            rows = rowIds.map((id: string) => {
                const entry = batchMap.get(id);
                if (!entry) {return null;}
                // Merge row metadata + values
                return {
                    _id: entry.row.id,
                    _createdAt: entry.row.createdAt,
                    _updatedAt: entry.row.updatedAt,
                    ...entry.values
                };
            }).filter((r: any) => r !== null) as Record<string, any>[];
            // Extract all unique column IDs encountered
            const colSet = new Set<string>();
            rows.forEach((r: Record<string, any>) => Object.keys(r).forEach(k => {
                if (!k.startsWith('_')) {colSet.add(k);}
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
    private resolveFilters(filters: QueryFilter[], context: Record<string, any>): QueryFilter[] {
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