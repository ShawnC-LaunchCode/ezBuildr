import { eq, and, desc, sql, inArray, asc, isNull } from "drizzle-orm";

import {
  datavaultRows,
  datavaultValues,
  datavaultColumns,
  datavaultTables,
  datavaultNumberSequences,
  type DatavaultRow,
  type InsertDatavaultRow,
  type DatavaultValue,
} from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";

import { BaseRepository, type DbTransaction } from "./BaseRepository";
const logger = createLogger({ module: "datavault-rows-repository" });
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
  /**
   * Find rows by table ID with pagination, filtering, sorting, and archive support
   * Supports sorting by row fields (createdAt, updatedAt) or column values (by slug)
   */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- accesses DB via this.getDb indirectly
  async findByTableId(
    tableId: string,
    options?: {
      limit?: number;
      offset?: number;
      showArchived?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    tx?: DbTransaction
  ): Promise<DatavaultRow[]> {
    const database = this.getDb(tx);
    // Build base where clause
    const whereConditions = [eq(datavaultRows.tableId, tableId)];
    // Filter archived rows unless explicitly requested
    if (!options?.showArchived) {
      whereConditions.push(isNull(datavaultRows.deletedAt));
    }
    const sortDir = options?.sortOrder === 'desc' ? desc : asc;
    // Check if sorting by a column value (not a row field)
    if (options?.sortBy && options.sortBy !== 'createdAt' && options.sortBy !== 'updatedAt') {
      // Look up the column by slug to get its ID
      const [column] = await database
        .select({ id: datavaultColumns.id })
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
            datavaultValues,
            and(
              eq(datavaultValues.rowId, datavaultRows.id),
              eq(datavaultValues.columnId, column.id)
            )
          )
          .where(and(...whereConditions))
          .orderBy(sortDir(datavaultValues.value))
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
  async countByTableId(tableId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [result] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultRows)
      .where(eq(datavaultRows.tableId, tableId));
    return result?.count ?? 0;
  }
  /**
   * Count rows for multiple tables in a single query
   */
  async countByTableIds(tableIds: string[], tx?: DbTransaction): Promise<Map<string, number>> {
    if (tableIds.length === 0) {return new Map();}
    const database = this.getDb(tx);
    const results = await database
      .select({ tableId: datavaultRows.tableId, count: sql<number>`count(*)::int` })
      .from(datavaultRows)
      .where(inArray(datavaultRows.tableId, tableIds))
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
    options?: {
      limit?: number;
      offset?: number;
      page?: number;
      showArchived?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
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
   * @param startValue Seed value when the counter row doesn't exist yet (default: 1)
   * @returns Next auto-number value (integer)
   */
  async getNextAutoNumber(
    tenantId: string,
    tableId: string,
    columnId: string,
    startValue: number = 1,
    tx?: DbTransaction
  ): Promise<number> {
    const database = this.getDb(tx);

    // Self-heal: seed the counter row if one doesn't exist yet.
    await database
      .insert(datavaultNumberSequences)
      .values({ tenantId, tableId, columnId, nextValue: startValue })
      .onConflictDoNothing({
        target: [
          datavaultNumberSequences.tenantId,
          datavaultNumberSequences.tableId,
          datavaultNumberSequences.columnId,
        ],
      });

    // Lock the counter row so concurrent generators serialize on it.
    const [sequence] = await database
      .select({ nextValue: datavaultNumberSequences.nextValue })
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

    return nextValue;
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
    startValue: number = 1,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    await database
      .insert(datavaultNumberSequences)
      .values({ tenantId, tableId, columnId, nextValue: startValue })
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
    const [result] = await database
      .select({
        hasDuplicates: sql<boolean>`
          EXISTS (
            SELECT value
            FROM ${datavaultValues}
            WHERE ${datavaultValues.columnId} = ${columnId}
            GROUP BY value
            HAVING COUNT(*) > 1
          )
        `
      })
      .from(datavaultValues)
      .limit(1);
    return result?.hasDuplicates ?? false;
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
   * Count rows with filter support (active/archived)
   */
  async countByTableIdWithFilter(
    tableId: string,
    showArchived: boolean = false,
    tx?: DbTransaction
  ): Promise<number> {
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
   * Find a single row ID by a specific column value
   * Used for "Primary Key" lookups in Write Blocks
   *
   * RACE CONDITION FIX: Added optional forUpdate parameter for row-level locking
   */
  async findRowByColumnValue(
    tableId: string,
    columnId: string,
    value: unknown,
    options?: {
      tenantId: string;
      tx?: DbTransaction;
      forUpdate?: boolean;
    }
  ): Promise<string | null> {
    const tenantId = options?.tenantId;
    const tx = options?.tx;
    const forUpdate = options?.forUpdate ?? false;
    const database = this.getDb(tx);
    void tenantId; // Tenant check implicit via tableId ownership verification (tables are tenant scoped)
    const baseQuery = database
      .select({ id: datavaultRows.id })
      .from(datavaultRows)
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
          eq(datavaultValues.value, value as string)
        )
      )
      .limit(1);
    // Apply row-level locking if requested (prevents race conditions in upsert)
    const query = forUpdate ? baseQuery.for('update') : baseQuery;
    const [result] = await query;
    return result?.id ?? null;
  }
}
// Singleton instance
export const datavaultRowsRepository = new DatavaultRowsRepository();
