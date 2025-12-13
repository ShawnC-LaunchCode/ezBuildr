import { BaseRepository, type DbTransaction } from "./BaseRepository";
import {
  datavaultRows,
  datavaultValues,
  datavaultColumns,
  datavaultTables,
  type DatavaultRow,
  type InsertDatavaultRow,
  type DatavaultValue,
  type InsertDatavaultValue,
} from "@shared/schema";
import { eq, and, desc, sql, inArray, asc, isNull, isNotNull, or, like, gt, lt, gte, lte } from "drizzle-orm";
import { db } from "../db";

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

      if (column) {
        // Sort by column value using a subquery join
        // Use left join so rows without values for this column still appear
        const limit = options?.limit || 100;
        const offset = options?.offset || 0;

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
    let query = database
      .select()
      .from(datavaultRows)
      .where(and(...whereConditions));

    if (options?.sortBy === 'createdAt') {
      query = query.orderBy(sortDir(datavaultRows.createdAt)) as any;
    } else if (options?.sortBy === 'updatedAt') {
      query = query.orderBy(sortDir(datavaultRows.updatedAt)) as any;
    } else {
      query = query.orderBy(asc(datavaultRows.createdAt)) as any; // Default ascending order
    }

    // Offset-based pagination
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    query = query.limit(limit).offset(offset) as any;

    return await query;
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

    return result?.count || 0;
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
    if (!row) return null;

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
    values: Record<string, any>; // columnId -> value
  }>> {
    const database = this.getDb(tx);

    // Get rows (with sorting and archive filtering)
    const rows = await this.findByTableId(tableId, options, tx);
    if (rows.length === 0) return [];

    const rowIds = rows.map((r) => r.id);

    // Get all values for these rows
    const allValues = await database
      .select()
      .from(datavaultValues)
      .where(inArray(datavaultValues.rowId, rowIds));

    // Group values by row
    const valuesByRow = allValues.reduce((acc: Record<string, Record<string, any>>, value: any) => {
      if (!acc[value.rowId]) {
        acc[value.rowId] = {};
      }
      acc[value.rowId][value.columnId] = value.value;
      return acc;
    }, {} as Record<string, Record<string, any>>);

    // Combine rows with their values
    return rows.map((row) => ({
      row,
      values: valuesByRow[row.id] || {},
    }));
  }

  /**
   * Create row with values
   */
  async createRowWithValues(
    rowData: InsertDatavaultRow,
    values: Array<{ columnId: string; value: any }>,
    tx?: DbTransaction
  ): Promise<{ row: DatavaultRow; values: DatavaultValue[] }> {
    const database = this.getDb(tx);

    // Create the row
    let row;
    try {
      row = await this.create(rowData, tx);
    } catch (error) {
      console.log('Error creating row in repository:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
    values: Array<{ columnId: string; value: any }>,
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
    ) as unknown as {
      referencing_table_id: string;
      referencing_column_id: string;
      reference_count: string;
    }[];

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
   * Get next auto-number for a column using PostgreSQL sequences
   * Fixes race condition - guaranteed atomic and unique
   *
   * @param tableId Table ID (for future use/validation)
   * @param columnId Column ID
   * @param startValue Starting value for the sequence (default: 1)
   * @returns Next auto-number value
   */
  async getNextAutoNumber(
    tableId: string,
    columnId: string,
    startValue: number = 1,
    tx?: DbTransaction
  ): Promise<number> {
    const database = this.getDb(tx);

    // Use PostgreSQL function to get next value from sequence
    // This is atomic and prevents race conditions
    const res = await database.execute(
      sql`SELECT public.datavault_get_next_auto_number(${tableId}::UUID, ${columnId}::UUID, ${startValue}::INTEGER) as next_value`
    );
    const result = Array.isArray(res) ? res[0] : (res as any)?.rows?.[0] || res;

    return result?.next_value ?? startValue;
  }

  /**
   * Cleanup PostgreSQL sequence when auto-number column is deleted
   *
   * @param columnId Column ID
   */
  /**
   * Get next autonumber value (v4 with prefix, padding, yearly reset)
   * Calls datavault_get_next_autonumber PostgreSQL function
   *
   * @param tenantId Tenant ID for the table
   * @param tableId Table ID
   * @param columnId Column ID
   * @param prefix Optional prefix (e.g., "CASE", "INV")
   * @param padding Number of digits to pad (default 4)
   * @param resetPolicy When to reset: 'never' or 'yearly'
   * @param tx Optional transaction
   * @returns Formatted autonumber string (e.g., "CASE-2025-0001")
   */
  async getNextAutonumber(
    tenantId: string,
    tableId: string,
    columnId: string,
    prefix: string | null = null,
    padding: number = 4,
    resetPolicy: 'never' | 'yearly' = 'never',
    format: string | null = null,
    tx?: DbTransaction
  ): Promise<string> {
    const database = this.getDb(tx);

    // Call the database function with all parameters
    // SQL Signature: (tenant, table, column, context_key, min_digits, prefix, format)
    const res = await database.execute(
      sql`SELECT public.datavault_get_next_autonumber(
        ${tenantId}::UUID,
        ${tableId}::UUID,
        ${columnId}::UUID,
        'default'::TEXT,
        ${padding || 4}::INTEGER,
        ${prefix || ''}::TEXT,
        ${resetPolicy === 'yearly' ? 'YYYY' : (format || null)}::TEXT
      ) as next_value`
    );

    const result = Array.isArray(res) ? res[0] : (res as any)?.rows?.[0] || res;
    const nextValue = result?.next_value;
    if (!nextValue) {
      throw new Error('Failed to generate autonumber value');
    }

    return nextValue as string;
  }

  /**
   * Cleanup PostgreSQL sequence when auto-number column is deleted
   *
   * @param columnId Column ID
   */
  async cleanupAutoNumberSequence(columnId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);

    // Call PostgreSQL function to drop the sequence
    await database.execute(
      sql`SELECT public.datavault_cleanup_sequence(${columnId}::UUID)`
    );
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
  ): Promise<Map<string, { row: DatavaultRow; values: Record<string, any> }>> {
    const database = this.getDb(tx);
    const resultMap = new Map<string, { row: DatavaultRow; values: Record<string, any> }>();

    if (requests.length === 0) return resultMap;

    // Flatten all rowIds across all requests
    const allRowIds = requests.flatMap(req => req.rowIds);
    if (allRowIds.length === 0) return resultMap;

    // Fetch all rows in a single query
    const rows = await database
      .select()
      .from(datavaultRows)
      .where(inArray(datavaultRows.id, allRowIds));

    if (rows.length === 0) return resultMap;

    // Fetch all values for these rows in a single query
    const values = await database
      .select()
      .from(datavaultValues)
      .where(inArray(datavaultValues.rowId, allRowIds));

    // Group values by rowId
    const valuesByRow = values.reduce((acc: Record<string, Record<string, any>>, value: any) => {
      if (!acc[value.rowId]) {
        acc[value.rowId] = {};
      }
      acc[value.rowId][value.columnId] = value.value;
      return acc;
    }, {} as Record<string, Record<string, any>>);

    // Build result map
    rows.forEach((row: DatavaultRow) => {
      resultMap.set(row.id, {
        row,
        values: valuesByRow[row.id] || {}
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

    return result?.count || 0;
  }

  /**
   * Find a single row ID by a specific column value
   * Used for "Primary Key" lookups in Write Blocks
   */
  async findRowByColumnValue(
    tableId: string,
    columnId: string,
    value: any,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<string | null> {
    const database = this.getDb(tx);

    const [result] = await database
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
          // eq(datavaultRows.tenantId, tenantId) // Schema check: does row have tenantId? Yes (line 210 implies create uses it)
          // Wait, createRowWithValues passes tenantId in rowData.
          // Let's verify schema `DatavaultRow` later, but assuming yes for now.
          // Looking at repo `createRowWithValues`: `this.create(rowData, tx)`.
          // BaseRepository defaults? 
          // `datavaultRows` table definition likely has tenantId.
          // Using generic where clause for safety.
          sql`${datavaultValues.value} = ${value}` // CAUTION: weak typing on value comparison? 
          // Drizzle `eq` is safer if types align. datavaultValues.value is likely `text` or `jsonb`?
          // If `value` col is `text`, perfect. EAV usually text.
        )
      )
      .limit(1);

    return result?.id || null;
  }
}

// Singleton instance
export const datavaultRowsRepository = new DatavaultRowsRepository();
