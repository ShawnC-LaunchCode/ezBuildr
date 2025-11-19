import { BaseRepository, type DbTransaction } from "./BaseRepository";
import {
  datavaultColumns,
  type DatavaultColumn,
  type InsertDatavaultColumn,
} from "@shared/schema";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for DataVault column data access
 * Handles CRUD operations for table column definitions
 */
export class DatavaultColumnsRepository extends BaseRepository<
  typeof datavaultColumns,
  DatavaultColumn,
  InsertDatavaultColumn
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultColumns, dbInstance);
  }

  /**
   * Find columns by table ID (ordered by orderIndex)
   */
  async findByTableId(tableId: string, tx?: DbTransaction): Promise<DatavaultColumn[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(datavaultColumns)
      .where(eq(datavaultColumns.tableId, tableId))
      .orderBy(asc(datavaultColumns.orderIndex));
  }

  /**
   * Find column by table ID and slug
   */
  async findByTableAndSlug(
    tableId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn | undefined> {
    const database = this.getDb(tx);
    const [column] = await database
      .select()
      .from(datavaultColumns)
      .where(and(eq(datavaultColumns.tableId, tableId), eq(datavaultColumns.slug, slug)));

    return column;
  }

  /**
   * Check if slug exists for table (excluding specific ID if provided)
   */
  async slugExists(
    tableId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);

    const conditions = [
      eq(datavaultColumns.tableId, tableId),
      eq(datavaultColumns.slug, slug)
    ];

    if (excludeId) {
      conditions.push(sql`${datavaultColumns.id} != ${excludeId}`);
    }

    const [result] = await database
      .select({ id: datavaultColumns.id })
      .from(datavaultColumns)
      .where(and(...conditions))
      .limit(1);

    return !!result;
  }

  /**
   * Count columns for a table
   */
  async countByTableId(tableId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [result] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultColumns)
      .where(eq(datavaultColumns.tableId, tableId));

    return result?.count || 0;
  }

  /**
   * Get max order index for a table
   */
  async getMaxOrderIndex(tableId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [result] = await database
      .select({ max: sql<number>`COALESCE(MAX(${datavaultColumns.orderIndex}), -1)::int` })
      .from(datavaultColumns)
      .where(eq(datavaultColumns.tableId, tableId));

    return result?.max ?? -1;
  }

  /**
   * Reorder columns for a table
   */
  async reorderColumns(
    tableId: string,
    columnIds: string[],
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);

    // Update each column with its new order index
    for (let i = 0; i < columnIds.length; i++) {
      await database
        .update(datavaultColumns)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(and(eq(datavaultColumns.id, columnIds[i]), eq(datavaultColumns.tableId, tableId)));
    }
  }

  /**
   * Delete all columns for a table
   */
  async deleteByTableId(tableId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(datavaultColumns).where(eq(datavaultColumns.tableId, tableId));
  }

  /**
   * Update column with automatic timestamp update
   */
  async update(
    id: string,
    updates: Partial<InsertDatavaultColumn>,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    return super.update(id, { ...updates, updatedAt: new Date() } as Partial<InsertDatavaultColumn>, tx);
  }
}

// Singleton instance
export const datavaultColumnsRepository = new DatavaultColumnsRepository();
