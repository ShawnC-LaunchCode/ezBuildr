import { eq, and, or, ne, desc, sql, inArray, asc, isNull, exists, not, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  datavaultRows,
  datavaultValues,
  datavaultColumns,
  datavaultTables,
  datavaultNumberSequences,
  type DatavaultRow,
  type InsertDatavaultRow,
  type DatavaultValue,
  type DatavaultRowFilter,
} from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

type AutoNumberSequenceOptions = {
  startValue?: number;
  prefix?: string | null;
  padding?: number;
};

export type DatavaultRowsFindOptions = {
  limit?: number;
  offset?: number;
  showArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: DatavaultRowFilter[];
};

const logger = createLogger({ module: "datavault-rows-repository" });

function scalarText(valueColumn: SQLWrapper): SQL {
  return sql`${valueColumn} #>> '{}'`;
}

function nonEmptyValue(valueColumn: SQLWrapper): SQL {
  return sql`${valueColumn} IS NOT NULL AND ${valueColumn} != 'null'::jsonb AND ${valueColumn} != '""'::jsonb`;
}

function buildStringCondition(
  valueColumn: SQLWrapper,
  operator: 'contains' | 'not_contains' | 'starts_with' | 'ends_with',
  value: unknown
): SQL | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const stringValue = String(value);
  const pattern = (operator === 'contains' || operator === 'not_contains')
    ? `%${stringValue}%`
    : operator === 'starts_with'
      ? `${stringValue}%`
      : `%${stringValue}`;
  return operator === 'not_contains'
    ? sql`${scalarText(valueColumn)} NOT LIKE ${pattern}`
    : sql`${scalarText(valueColumn)} LIKE ${pattern}`;
}

function buildComparisonCondition(
  valueColumn: SQLWrapper,
  columnType: string | undefined,
  operator: 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal',
  value: unknown
): SQL | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const textValue = scalarText(valueColumn);
  const opSql = operator === 'greater_than'
    ? sql`>`
    : operator === 'less_than'
      ? sql`<`
      : operator === 'greater_than_or_equal'
        ? sql`>=`
        : sql`<=`;

  if (columnType === 'number' || columnType === 'auto_number' || columnType === 'autonumber') {
    return sql`(${textValue})::numeric ${opSql} ${value}`;
  }
  if (columnType === 'date') {
    return sql`(${textValue})::date ${opSql} ${value}`;
  }
  if (columnType === 'datetime') {
    return sql`(${textValue})::timestamptz ${opSql} ${value}`;
  }
  return sql`${textValue} ${opSql} ${String(value)}`;
}

function buildInCondition(
  valueColumn: SQLWrapper,
  operator: 'in' | 'not_in',
  value: unknown
): SQL | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const comparisons = value
    .filter(item => item !== undefined)
    .map(item => sql`${valueColumn} = ${JSON.stringify(item)}::jsonb`);
  if (comparisons.length === 0) {
    return undefined;
  }
  const joinedComparisons = sql.join(comparisons, sql` OR `);
  return operator === 'not_in'
    ? sql`NOT (${joinedComparisons})`
    : sql`(${joinedComparisons})`;
}

function buildValueCondition(
  valueColumn: SQLWrapper,
  columnType: string | undefined,
  filter: DatavaultRowFilter
): SQL | undefined {
  switch (filter.operator) {
    case 'equals':
      return filter.value === undefined
        ? undefined
        : sql`${valueColumn} = ${JSON.stringify(filter.value)}::jsonb`;
    case 'not_equals':
      return filter.value === undefined
        ? undefined
        : sql`${valueColumn} != ${JSON.stringify(filter.value)}::jsonb`;
    case 'contains':
    case 'not_contains':
    case 'starts_with':
    case 'ends_with':
      return buildStringCondition(valueColumn, filter.operator, filter.value);
    case 'greater_than':
    case 'less_than':
    case 'greater_than_or_equal':
    case 'less_than_or_equal':
      return buildComparisonCondition(valueColumn, columnType, filter.operator, filter.value);
    case 'in':
    case 'not_in':
      return buildInCondition(valueColumn, filter.operator, filter.value);
    default:
      return undefined;
  }
}

function sortExpression(
  valueColumn: SQLWrapper,
  column: { type: string; autonumberPrefix?: string | null }
): SQL {
  const textValue = scalarText(valueColumn);
  switch (column.type) {
    case 'number':
      return sql`CASE WHEN (${textValue}) ~ '^-?[0-9]*\\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN (${textValue})::numeric ELSE NULL END`;
    case 'auto_number':
    case 'autonumber':
      return column.autonumberPrefix
        ? textValue
        : sql`CASE WHEN (${textValue}) ~ '^-?[0-9]*\\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN (${textValue})::numeric ELSE NULL END`;
    case 'boolean':
      return sql`(${textValue})::boolean`;
    case 'date':
      return sql`(${textValue})::date`;
    case 'datetime':
      return sql`(${textValue})::timestamptz`;
    default:
      return textValue;
  }
}

/**
 * Repository for DataVault row data access
 * Handles CRUD operations for table rows and their associated values
 */
export class DatavaultRowsRepository extends BaseRepository<
  typeof datavaultRows,
  DatavaultRow,
  InsertDatavaultRow
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultRows, dbInstance);
  }

  private async buildWhereConditions(
    database: typeof db | DbTransaction,
    tableId: string,
    options?: {
      showArchived?: boolean;
      filters?: DatavaultRowFilter[];
    }
  ): Promise<SQL[]> {
    const whereConditions: SQL[] = [eq(datavaultRows.tableId, tableId)];

    if (!options?.showArchived) {
      whereConditions.push(isNull(datavaultRows.deletedAt));
    }

    if (options?.filters && options.filters.length > 0) {
      const columns = await database
        .select({
          id: datavaultColumns.id,
          type: datavaultColumns.type,
          slug: datavaultColumns.slug,
          autonumberPrefix: datavaultColumns.autonumberPrefix,
        })
        .from(datavaultColumns)
        .where(eq(datavaultColumns.tableId, tableId));

      const columnsById = new Map(columns.map((c) => [c.id, c]));

      for (let i = 0; i < options.filters.length; i++) {
        const filter = options.filters[i];
        if (!filter?.columnId) {
          continue;
        }

        const column = columnsById.get(filter.columnId);
        if (!column) {
          logger.warn({ tableId, columnId: filter.columnId }, "Filter column does not belong to table");
          whereConditions.push(sql`1 = 0`);
          continue;
        }

        const valueAlias = alias(datavaultValues, `dv_filter_${i}`);
        const correlation = and(
          eq(valueAlias.rowId, datavaultRows.id),
          eq(valueAlias.columnId, filter.columnId)
        );

        if (filter.operator === "is_empty") {
          whereConditions.push(
            not(
              exists(
                database
                  .select({ one: sql`1` })
                  .from(valueAlias)
                  .where(and(correlation, nonEmptyValue(valueAlias.value)))
              )
            )
          );
          continue;
        }

        if (filter.operator === "is_not_empty") {
          whereConditions.push(
            exists(
              database
                .select({ one: sql`1` })
                .from(valueAlias)
                .where(and(correlation, nonEmptyValue(valueAlias.value)))
            )
          );
          continue;
        }

        const valueCondition = buildValueCondition(valueAlias.value, column.type, filter);
        if (valueCondition) {
          whereConditions.push(
            exists(
              database
                .select({ one: sql`1` })
                .from(valueAlias)
                .where(and(correlation, valueCondition))
            )
          );
        }
      }
    }

    return whereConditions;
  }

  /**
   * Find rows by table ID with pagination, filtering, sorting, and archive support
   * Supports sorting by row fields (createdAt, updatedAt) or column values (by slug)
   */
  async findByTableId(
    tableId: string,
    options?: DatavaultRowsFindOptions,
    tx?: DbTransaction
  ): Promise<DatavaultRow[]> {
    const database = this.getDb(tx);
    const whereConditions = await this.buildWhereConditions(database, tableId, options);
    const sortDir = options?.sortOrder === 'desc' ? desc : asc;

    // Check if sorting by a column value (not a row field)
    if (options?.sortBy && options.sortBy !== 'createdAt' && options.sortBy !== 'updatedAt') {
      // Look up the column by slug to get its ID and type
      const [column] = await database
        .select({
          id: datavaultColumns.id,
          type: datavaultColumns.type,
          autonumberPrefix: datavaultColumns.autonumberPrefix,
        })
        .from(datavaultColumns)
        .where(
          and(
            eq(datavaultColumns.tableId, tableId),
            eq(datavaultColumns.slug, options.sortBy)
          )
        )
        .limit(1);

      if (column !== undefined) {
        // Sort by column value using a subquery join
        // Use left join so rows without values for this column still appear
        const limit = options?.limit ?? 100;
        const offset = options?.offset ?? 0;
        const sortValue = alias(datavaultValues, 'dv_sort_value');
        const rows = await database
          .select({
            id: datavaultRows.id,
            tableId: datavaultRows.tableId,
            createdBy: datavaultRows.createdBy,
            updatedBy: datavaultRows.updatedBy,
            createdAt: datavaultRows.createdAt,
            updatedAt: datavaultRows.updatedAt,
            deletedAt: datavaultRows.deletedAt,
          })
          .from(datavaultRows)
          .leftJoin(
            sortValue,
            and(
              eq(sortValue.rowId, datavaultRows.id),
              eq(sortValue.columnId, column.id)
            )
          )
          .where(and(...whereConditions))
          .orderBy(sortDir(sortExpression(sortValue.value, column)))
          .limit(limit)
          .offset(offset);
        return rows as DatavaultRow[];
      }
      // If column not found, fall through to default sorting
    }

    // Sorting by row fields (createdAt, updatedAt) or default
    const baseQuery = database
      .select()
      .from(datavaultRows)
      .where(and(...whereConditions));
    let sortedQuery;
    if (options?.sortBy === 'createdAt') {
      sortedQuery = baseQuery.orderBy(sortDir(datavaultRows.createdAt));
    } else if (options?.sortBy === 'updatedAt') {
      sortedQuery = baseQuery.orderBy(sortDir(datavaultRows.updatedAt));
    } else {
      sortedQuery = baseQuery.orderBy(asc(datavaultRows.createdAt)); // Default ascending order
    }
    // Offset-based pagination
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    return sortedQuery.limit(limit).offset(offset);
  }
  /**
   * Count rows for a table
   */
  async countByTableId(
    tableId: string,
    options: boolean | { showArchived?: boolean } = false,
    tx?: DbTransaction
  ): Promise<number> {
    const showArchived = typeof options === 'boolean' ? options : Boolean(options.showArchived);
    const database = this.getDb(tx);
    const whereConditions = [eq(datavaultRows.tableId, tableId)];
    if (!showArchived) {
      whereConditions.push(isNull(datavaultRows.deletedAt));
    }
    const [result] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultRows)
      .where(and(...whereConditions));
    return result?.count ?? 0;
  }

  /**
   * Count rows for multiple tables in a single query
   */
  async countByTableIds(
    tableIds: string[],
    options: boolean | { showArchived?: boolean } = false,
    tx?: DbTransaction
  ): Promise<Map<string, number>> {
    if (tableIds.length === 0) { return new Map(); }
    const showArchived = typeof options === 'boolean' ? options : Boolean(options.showArchived);
    const database = this.getDb(tx);
    const whereConditions = [inArray(datavaultRows.tableId, tableIds)];
    if (!showArchived) {
      whereConditions.push(isNull(datavaultRows.deletedAt));
    }
    const results = await database
      .select({ tableId: datavaultRows.tableId, count: sql<number>`count(*)::int` })
      .from(datavaultRows)
      .where(and(...whereConditions))
      .groupBy(datavaultRows.tableId);
    const map = new Map<string, number>(tableIds.map(id => [id, 0]));
    for (const r of results) {
      map.set(r.tableId, r.count);
    }
    return map;
  }
  /**
   * Get row with all its values
   */
  async getRowWithValues(rowId: string, tx?: DbTransaction): Promise<{
    row: DatavaultRow;
    values: DatavaultValue[];
  } | null> {
    const database = this.getDb(tx);
    const row = await this.findById(rowId, tx);
    if (!row || row.deletedAt !== null) { return null; }
    const values = await database
      .select()
      .from(datavaultValues)
      .where(eq(datavaultValues.rowId, rowId));
    return { row, values };
  }
  /**
   * Get multiple rows with their values
   */
  async getRowsWithValues(
    tableId: string,
    options?: DatavaultRowsFindOptions & { page?: number },
    tx?: DbTransaction
  ): Promise<Array<{
    row: DatavaultRow;
    values: Record<string, unknown>; // columnId -> value
  }>> {
    const database = this.getDb(tx);
    // Get rows (with sorting and archive filtering)
    const rows = await this.findByTableId(tableId, options, tx);
    if (rows.length === 0) { return []; }
    const rowIds = rows.map((r) => r.id);
    // Get all values for these rows
    const allValues = await database
      .select()
      .from(datavaultValues)
      .where(inArray(datavaultValues.rowId, rowIds));
    // Group values by row
    const valuesByRow = allValues.reduce<Record<string, Record<string, unknown>>>((acc, value: DatavaultValue) => {
      const rowValues = acc[value.rowId] ?? {};
      rowValues[value.columnId] = value.value;
      acc[value.rowId] = rowValues;
      return acc;
    }, {});
    // Combine rows with their values
    return rows.map((row) => ({
      row,
      values: valuesByRow[row.id] ?? {},
    }));
  }
  /**
   * Create row with values
   */
  async createRowWithValues(
    rowData: InsertDatavaultRow,
    values: Array<{ columnId: string; value: unknown }>,
    tx?: DbTransaction
  ): Promise<{ row: DatavaultRow; values: DatavaultValue[] }> {
    const database = this.getDb(tx);
    // Create the row
    let row;
    try {
      row = await this.create(rowData, tx);
    } catch (error) {
      // CODE QUALITY FIX: Use structured logger instead of console.log
      logger.error({ error, tableId: rowData.tableId }, 'Error creating row in repository');
      throw error;
    }
    // Create values if provided
    const createdValues: DatavaultValue[] = [];
    if (values.length > 0) {
      const valueInserts = values.map((v) => ({
        rowId: row.id,
        columnId: v.columnId,
        value: v.value,
      }));
      createdValues.push(
        ...(await database.insert(datavaultValues).values(valueInserts).returning())
      );
    }
    return { row, values: createdValues };
  }
  /**
   * Update row values (upsert)
   */
  async updateRowValues(
    rowId: string,
    values: Array<{ columnId: string; value: unknown }>,
    updatedBy?: string,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    // Update row timestamp and updatedBy
    await database
      .update(datavaultRows)
      .set({ updatedAt: new Date(), updatedBy })
      .where(eq(datavaultRows.id, rowId));
    // Upsert values
    for (const { columnId, value } of values) {
      await database
        .insert(datavaultValues)
        .values({
          rowId,
          columnId,
          value,
        })
        .onConflictDoUpdate({
          target: [datavaultValues.rowId, datavaultValues.columnId],
          set: {
            value,
            updatedAt: new Date(),
          },
        });
    }
  }
  /**
   * Get list of tables/columns that reference this row
   * Used to check for dangling references before deletion or to show warnings
   */
  async getRowReferences(
    rowId: string,
    tx?: DbTransaction
  ): Promise<Array<{ referencingTableId: string; referencingColumnId: string; referenceCount: number }>> {
    const database = this.getDb(tx);
    const results = await database.execute(
      sql`SELECT * FROM datavault_is_row_referenced(${rowId}::UUID)`
    ) as unknown as Array<{
      // eslint-disable-next-line @typescript-eslint/naming-convention -- DB function returns snake_case
      referencing_table_id: string;
      // eslint-disable-next-line @typescript-eslint/naming-convention -- DB function returns snake_case
      referencing_column_id: string;
      // eslint-disable-next-line @typescript-eslint/naming-convention -- DB function returns snake_case
      reference_count: string;
    }>;
    return results.map(r => ({
      referencingTableId: r.referencing_table_id,
      referencingColumnId: r.referencing_column_id,
      referenceCount: parseInt(r.reference_count, 10)
    }));
  }
  /**
   * Delete row and all its values (cascade)
   * Note: Database trigger automatically sets referencing values to NULL
   */
  async deleteRow(rowId: string, tx?: DbTransaction): Promise<void> {
    // Cascade delete is handled by database constraints
    // Reference cleanup is handled by trigger (sets references to NULL)
    await this.delete(rowId, tx);
  }
  /**
   * Batch verify row ownership
   * Returns map of rowId -> tableId for authorized rows
   * Throws error if any rows are not found or unauthorized
   */
  async batchVerifyOwnership(
    rowIds: string[],
    tenantId: string,
    tx?: DbTransaction
  ): Promise<Map<string, string>> {
    const database = this.getDb(tx);
    const rows = await database
      .select({ id: datavaultRows.id, tableId: datavaultRows.tableId })
      .from(datavaultRows)
      .innerJoin(datavaultTables, eq(datavaultRows.tableId, datavaultTables.id))
      .where(
        and(
          inArray(datavaultRows.id, rowIds),
          eq(datavaultTables.tenantId, tenantId)
        )
      );
    const rowMap = new Map<string, string>();
    rows.forEach((row: { id: string; tableId: string }) => rowMap.set(row.id, row.tableId));
    // Check all rows were found
    const missingIds = rowIds.filter(id => !rowMap.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Rows not found or unauthorized: ${missingIds.join(', ')}`);
    }
    return rowMap;
  }
  /**
   * Batch delete rows
   * Much faster than individual deletes (1 query instead of N)
   */
  async batchDeleteRows(rowIds: string[], tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(datavaultRows)
      .where(inArray(datavaultRows.id, rowIds));
  }
  /**
   * Delete all rows for a table
   */
  async deleteByTableId(tableId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(datavaultRows).where(eq(datavaultRows.tableId, tableId));
  }
  /**
   * Delete values for a specific column (when column is deleted)
   */
  async deleteValuesByColumnId(columnId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(datavaultValues).where(eq(datavaultValues.columnId, columnId));
  }
  /**
   * Get next auto-number for a column from its `datavault_number_sequences`
   * counter row, transactionally.
   *
   * Locks the counter row with `FOR UPDATE` so concurrent inserts serialize on
   * it (same boundary pattern as `StepValueRepository.assertRunsMutable`) —
   * guaranteed distinct, increasing integers with no `MAX()` re-read and no
   * Postgres `SEQUENCE` objects involved.
   *
   * Self-heals when the counter row is missing (columns created before this
   * counter-row lifecycle existed, or via a path that skipped creating one):
   * seeds it from `startValue` via an idempotent upsert before locking.
   *
   * @param tenantId Tenant ID (counter rows are tenant-scoped)
   * @param tableId Table ID
   * @param columnId Column ID
   * @param options Counter seed and optional formatting configuration
   * @returns A bare integer when unprefixed, otherwise a formatted string
   */
  async getNextAutoNumber(
    tenantId: string,
    tableId: string,
    columnId: string,
    options: AutoNumberSequenceOptions = {},
    tx?: DbTransaction
  ): Promise<number | string> {
    const database = this.getDb(tx);
    const { startValue = 1, prefix = null, padding = 4 } = options;

    // Self-heal: seed the counter row if one doesn't exist yet.
    await database
      .insert(datavaultNumberSequences)
      .values({ tenantId, tableId, columnId, nextValue: startValue, prefix, padding })
      .onConflictDoUpdate({
        target: [
          datavaultNumberSequences.tenantId,
          datavaultNumberSequences.tableId,
          datavaultNumberSequences.columnId,
        ],
        set: { prefix, padding, updatedAt: new Date() },
      });

    // Lock the counter row so concurrent generators serialize on it.
    const [sequence] = await database
      .select({
        nextValue: datavaultNumberSequences.nextValue,
        prefix: datavaultNumberSequences.prefix,
        padding: datavaultNumberSequences.padding,
      })
      .from(datavaultNumberSequences)
      .where(
        and(
          eq(datavaultNumberSequences.tenantId, tenantId),
          eq(datavaultNumberSequences.tableId, tableId),
          eq(datavaultNumberSequences.columnId, columnId)
        )
      )
      .for('update');

    const nextValue = sequence?.nextValue ?? startValue;

    await database
      .update(datavaultNumberSequences)
      .set({ nextValue: nextValue + 1, updatedAt: new Date() })
      .where(
        and(
          eq(datavaultNumberSequences.tenantId, tenantId),
          eq(datavaultNumberSequences.tableId, tableId),
          eq(datavaultNumberSequences.columnId, columnId)
        )
      );

    if (!sequence?.prefix) {
      return nextValue;
    }

    return `${sequence.prefix}${String(nextValue).padStart(sequence.padding, '0')}`;
  }
  /**
   * Create the counter row backing an `auto_number` column's generation,
   * seeded from the column's configured start value. Idempotent — a no-op if
   * a row already exists for this column (normal create path only calls this
   * once, but generation also self-heals via `getNextAutoNumber` regardless).
   */
  async createNumberSequence(
    tenantId: string,
    tableId: string,
    columnId: string,
    options: AutoNumberSequenceOptions = {},
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    const { startValue = 1, prefix = null, padding = 4 } = options;
    await database
      .insert(datavaultNumberSequences)
      .values({ tenantId, tableId, columnId, nextValue: startValue, prefix, padding })
      .onConflictDoNothing({
        target: [
          datavaultNumberSequences.tenantId,
          datavaultNumberSequences.tableId,
          datavaultNumberSequences.columnId,
        ],
      });
  }
  /**
   * Update row with automatic timestamp update
   */
  async update(
    id: string,
    updates: Partial<InsertDatavaultRow>,
    tx?: DbTransaction
  ): Promise<DatavaultRow> {
    return super.update(id, { ...updates, updatedAt: new Date() } as Partial<InsertDatavaultRow>, tx);
  }
  /**
   * Check if a column has duplicate values
   * Used for validating unique constraints
   */
  async checkColumnHasDuplicates(
    columnId: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);
    const [duplicate] = await database
      .select({ value: datavaultValues.value })
      .from(datavaultValues)
      .innerJoin(datavaultRows, eq(datavaultValues.rowId, datavaultRows.id))
      .where(
        and(
          eq(datavaultValues.columnId, columnId),
          isNull(datavaultRows.deletedAt),
          sql`${datavaultValues.value} IS NOT NULL`,
          sql`${datavaultValues.value} <> 'null'::jsonb`
        )
      )
      .groupBy(datavaultValues.value)
      .having(sql`COUNT(*) > 1`)
      .limit(1);
    return duplicate !== undefined;
  }
  /**
   * Find live rows that conflict with one or more unique column values.
   * All requested column/value pairs are checked in a single query.
   */
  async findUniqueValueConflicts(
    tableId: string,
    uniqueValues: Array<{ columnId: string; value: unknown }>,
    excludeRowId?: string,
    tx?: DbTransaction
  ): Promise<Array<{ rowId: string; columnId: string }>> {
    if (uniqueValues.length === 0) { return []; }

    const database = this.getDb(tx);
    const valuePredicate = or(...uniqueValues.map(({ columnId, value }) =>
      and(
        eq(datavaultValues.columnId, columnId),
        eq(datavaultValues.value, value)
      )
    ));
    if (!valuePredicate) { return []; }

    const conditions = [
      eq(datavaultRows.tableId, tableId),
      isNull(datavaultRows.deletedAt),
      valuePredicate,
    ];
    if (excludeRowId) {
      conditions.push(ne(datavaultRows.id, excludeRowId));
    }

    return database
      .select({
        rowId: datavaultRows.id,
        columnId: datavaultValues.columnId,
      })
      .from(datavaultRows)
      .innerJoin(datavaultValues, eq(datavaultValues.rowId, datavaultRows.id))
      .where(and(...conditions));
  }
  /**
   * Batch fetch multiple rows by IDs from multiple tables
   * Used for resolving reference columns efficiently (fixes N+1 query problem)
   *
   * @param requests Array of {tableId, rowIds[]} objects
   * @returns Map of rowId -> {row, values}
   */
  async batchFindByIds(
    requests: Array<{ tableId: string; rowIds: string[] }>,
    tx?: DbTransaction
  ): Promise<Map<string, { row: DatavaultRow; values: Record<string, unknown> }>> {
    const database = this.getDb(tx);
    const resultMap = new Map<string, { row: DatavaultRow; values: Record<string, unknown> }>();
    if (requests.length === 0) { return resultMap; }
    // Flatten all rowIds across all requests
    const allRowIds = requests.flatMap(req => req.rowIds);
    if (allRowIds.length === 0) { return resultMap; }
    // Fetch all rows in a single query
    const rows = await database
      .select()
      .from(datavaultRows)
      .where(
        and(
          inArray(datavaultRows.id, allRowIds),
          isNull(datavaultRows.deletedAt)
        )
      );
    if (rows.length === 0) { return resultMap; }
    // Fetch all values for these rows in a single query
    const values = await database
      .select()
      .from(datavaultValues)
      .where(inArray(datavaultValues.rowId, allRowIds));
    // Group values by rowId
    const valuesByRow = values.reduce<Record<string, Record<string, unknown>>>((acc, value: DatavaultValue) => {
      const rowValues = acc[value.rowId] ?? {};
      rowValues[value.columnId] = value.value;
      acc[value.rowId] = rowValues;
      return acc;
    }, {});
    // Build result map
    rows.forEach((row: DatavaultRow) => {
      resultMap.set(row.id, {
        row,
        values: valuesByRow[row.id] ?? {}
      });
    });
    return resultMap;
  }
  /**
   * Archive (soft delete) a single row
   */
  async archiveRow(rowId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(datavaultRows)
      .set({ deletedAt: new Date() })
      .where(eq(datavaultRows.id, rowId));
  }
  /**
   * Unarchive (restore) a single row
   */
  async unarchiveRow(rowId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(datavaultRows)
      .set({ deletedAt: null })
      .where(eq(datavaultRows.id, rowId));
  }
  /**
   * Bulk archive rows
   */
  async bulkArchiveRows(rowIds: string[], tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(datavaultRows)
      .set({ deletedAt: new Date() })
      .where(inArray(datavaultRows.id, rowIds));
  }
  /**
   * Bulk unarchive rows
   */
  async bulkUnarchiveRows(rowIds: string[], tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(datavaultRows)
      .set({ deletedAt: null })
      .where(inArray(datavaultRows.id, rowIds));
  }
  /**
   * Count rows with filter support (active/archived, and column value filters)
   */
  async countByTableIdWithFilter(
    tableId: string,
    options: boolean | {
      showArchived?: boolean;
      filters?: DatavaultRowFilter[];
    } = false,
    tx?: DbTransaction
  ): Promise<number> {
    const database = this.getDb(tx);
    const filterOptions = typeof options === 'boolean' ? { showArchived: options } : options;
    const whereConditions = await this.buildWhereConditions(database, tableId, filterOptions);
    const [result] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultRows)
      .where(and(...whereConditions));
    return result?.count ?? 0;
  }
  /**
   * Find a single row ID by a specific column value
   * Used for "Primary Key" lookups in Write Blocks
   */
  async findRowByColumnValue(
    tableId: string,
    columnId: string,
    value: unknown,
    options: {
      tenantId: string;
      tx?: DbTransaction;
      forUpdate?: boolean;
    }
  ): Promise<string | null> {
    const { tenantId, tx, forUpdate = false } = options;
    const database = this.getDb(tx);

    if (forUpdate) {
      const lockKey = `${tableId}:${columnId}:${String(value)}`;
      await database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
      );
    }

    const baseQuery = database
      .select({ id: datavaultRows.id })
      .from(datavaultRows)
      .innerJoin(datavaultTables, eq(datavaultRows.tableId, datavaultTables.id))
      .innerJoin(
        datavaultValues,
        and(
          eq(datavaultValues.rowId, datavaultRows.id),
          eq(datavaultValues.columnId, columnId)
        )
      )
      .where(
        and(
          eq(datavaultRows.tableId, tableId),
          eq(datavaultTables.tenantId, tenantId),
          isNull(datavaultRows.deletedAt),
          eq(datavaultValues.value, value as string)
        )
      )
      .limit(1);
    // Lock a matching live row while the caller performs its validated update.
    const query = forUpdate ? baseQuery.for('update') : baseQuery;
    const [result] = await query;
    return result?.id ?? null;
  }
}
// Singleton instance
export const datavaultRowsRepository = new DatavaultRowsRepository();
