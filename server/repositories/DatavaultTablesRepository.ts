import { eq, and, desc, sql, asc, or, inArray } from "drizzle-orm";

import { datavaultTables, datavaultColumns, datavaultTablePermissions, type DatavaultTable, type InsertDatavaultTable } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for DataVault table data access
 * Handles CRUD operations for tenant-scoped custom tables
 */
export class DatavaultTablesRepository extends BaseRepository<
  typeof datavaultTables,
  DatavaultTable,
  InsertDatavaultTable
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultTables, dbInstance);
  }

  /**
   * Find tables by tenant ID
   * @deprecated logic should use user-scoped findByTenantAndUser
   */
  async findByTenantId(tenantId: string, tx?: DbTransaction): Promise<DatavaultTable[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultTables)
      .where(eq(datavaultTables.tenantId, tenantId))
      .orderBy(desc(datavaultTables.createdAt));
  }

  /**
   * Find tables by tenant ID and User Access (Owner OR Shared)
   */
  async findByTenantAndUser(tenantId: string, userId: string, tx?: DbTransaction): Promise<DatavaultTable[]> {
    const database = this.getDb(tx);

    // Subquery for shared tables
    const sharedTableIds = database
      .select({ tableId: datavaultTablePermissions.tableId })
      .from(datavaultTablePermissions)
      .where(eq(datavaultTablePermissions.userId, userId));

    return database
      .select()
      .from(datavaultTables)
      .where(
        and(
          eq(datavaultTables.tenantId, tenantId),
          or(
            eq(datavaultTables.ownerUserId, userId),
            inArray(datavaultTables.id, sharedTableIds)
          )
        )
      )
      .orderBy(desc(datavaultTables.createdAt));
  }

  /**
   * Find table by tenant ID and slug
   */
  async findByTenantAndSlug(
    tenantId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<DatavaultTable | undefined> {
    const database = this.getDb(tx);
    const [table] = await database
      .select()
      .from(datavaultTables)
      .where(and(eq(datavaultTables.tenantId, tenantId), eq(datavaultTables.slug, slug)));

    return table;
  }

  /**
   * Check if slug exists for tenant (excluding specific ID if provided)
   */
  async slugExists(
    tenantId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);

    let query = database
      .select({ id: datavaultTables.id })
      .from(datavaultTables)
      .where(and(eq(datavaultTables.tenantId, tenantId), eq(datavaultTables.slug, slug)));

    if (excludeId) {
      query = (query as any).where(sql`${datavaultTables.id} != ${excludeId}`);
    }

    const [result] = await query.limit(1);
    return !!result;
  }

  /**
   * Find tables by owner user ID
   */
  async findByOwnerId(ownerUserId: string, tx?: DbTransaction): Promise<DatavaultTable[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultTables)
      .where(eq(datavaultTables.ownerUserId, ownerUserId))
      .orderBy(desc(datavaultTables.createdAt));
  }

  /**
   * Count tables for a tenant
   */
  async countByTenantId(tenantId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [result] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(datavaultTables)
      .where(eq(datavaultTables.tenantId, tenantId));

    return result?.count || 0;
  }

  /**
   * Get table schema with columns
   * Returns table metadata and ordered list of columns
   */
  async getSchema(tableId: string, tx?: DbTransaction) {
    const database = this.getDb(tx);

    // Get table
    const table = await this.findById(tableId, tx);
    if (!table) {
      return null;
    }

    // Get columns ordered by orderIndex
    const rawColumns = await database
      .select({
        id: datavaultColumns.id,
        name: datavaultColumns.name,
        type: datavaultColumns.type,
        required: datavaultColumns.required,
        orderIndex: datavaultColumns.orderIndex,
        isPrimaryKey: datavaultColumns.isPrimaryKey,
        isUnique: datavaultColumns.isUnique,
        slug: datavaultColumns.slug,
        referenceTableId: datavaultColumns.referenceTableId,
        referenceDisplayColumnSlug: datavaultColumns.referenceDisplayColumnSlug,
      })
      .from(datavaultColumns)
      .where(eq(datavaultColumns.tableId, tableId))
      .orderBy(asc(datavaultColumns.orderIndex));

    // Map columns to include reference object for reference type columns
    const columns = rawColumns.map((col: typeof rawColumns[number]) => ({
      id: col.id,
      name: col.name,
      slug: col.slug,
      type: col.type,
      required: col.required,
      orderIndex: col.orderIndex,
      isPrimaryKey: col.isPrimaryKey,
      isUnique: col.isUnique,
      reference: col.type === 'reference'
        ? {
          tableId: col.referenceTableId,
          displayColumnSlug: col.referenceDisplayColumnSlug,
        }
        : null,
    }));

    return {
      id: table.id,
      name: table.name,
      slug: table.slug,
      description: table.description,
      databaseId: table.databaseId,
      columns,
    };
  }

  /**
   * Update table with automatic timestamp update
   */
  async update(
    id: string,
    updates: Partial<InsertDatavaultTable>,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    return super.update(id, { ...updates, updatedAt: new Date() } as Partial<InsertDatavaultTable>, tx);
  }
}

// Singleton instance
export const datavaultTablesRepository = new DatavaultTablesRepository();
