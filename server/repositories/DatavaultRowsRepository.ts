import { BaseRepository, type DbTransaction } from "./BaseRepository";
import {
  datavaultRows,
  datavaultValues,
  datavaultColumns,
  type DatavaultRow,
  type InsertDatavaultRow,
  type DatavaultValue,
  type InsertDatavaultValue,
} from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
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
   * Find rows by table ID with pagination
   */
  async findByTableId(
    tableId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
    tx?: DbTransaction
  ): Promise<DatavaultRow[]> {
    const database = this.getDb(tx);
    let query = database
      .select()
      .from(datavaultRows)
      .where(eq(datavaultRows.tableId, tableId))
      .orderBy(desc(datavaultRows.createdAt));

    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }

    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

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
    },
    tx?: DbTransaction
  ): Promise<Array<{
    row: DatavaultRow;
    values: Record<string, any>; // columnId -> value
  }>> {
    const database = this.getDb(tx);

    // Get rows
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
    const row = await this.create(rowData, tx);

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
   * Delete row and all its values (cascade)
   */
  async deleteRow(rowId: string, tx?: DbTransaction): Promise<void> {
    // Cascade delete is handled by database constraints
    await this.delete(rowId, tx);
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
   * Get next auto-number for a column
   * Returns the count of existing rows, which will be used to calculate the next number
   */
  async getNextAutoNumber(
    tableId: string,
    columnId: string,
    tx?: DbTransaction
  ): Promise<number> {
    const database = this.getDb(tx);

    // Get the maximum value for this auto_number column
    const [result] = await database
      .select({
        max: sql<number>`COALESCE(
          (SELECT MAX((value->>'value')::int)
           FROM ${datavaultValues}
           WHERE ${datavaultValues.columnId} = ${columnId}),
          -1
        )::int`
      })
      .from(datavaultRows)
      .where(eq(datavaultRows.tableId, tableId))
      .limit(1);

    return (result?.max ?? -1) + 1;
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
}

// Singleton instance
export const datavaultRowsRepository = new DatavaultRowsRepository();
