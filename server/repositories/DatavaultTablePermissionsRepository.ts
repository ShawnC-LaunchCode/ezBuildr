import { eq, and } from "drizzle-orm";

import {
  datavaultTablePermissions,
  type DatavaultTablePermission,
  type InsertDatavaultTablePermission,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for DataVault table permissions data access
 * Handles CRUD operations for per-table RBAC
 */
export class DatavaultTablePermissionsRepository extends BaseRepository<
  typeof datavaultTablePermissions,
  DatavaultTablePermission,
  InsertDatavaultTablePermission
> {
  constructor(dbInstance?: typeof db) {
    super(datavaultTablePermissions, dbInstance);
  }

  /**
   * Find all permissions for a table
   */
  async findByTableId(tableId: string, tx?: DbTransaction): Promise<DatavaultTablePermission[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultTablePermissions)
      .where(eq(datavaultTablePermissions.tableId, tableId));
  }

  /**
   * Find a specific user's permission for a table
   */
  async findByTableAndUser(
    tableId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<DatavaultTablePermission | undefined> {
    const database = this.getDb(tx);
    const [permission] = await database
      .select()
      .from(datavaultTablePermissions)
      .where(
        and(
          eq(datavaultTablePermissions.tableId, tableId),
          eq(datavaultTablePermissions.userId, userId)
        )
      );

    return permission;
  }

  /**
   * Find all tables a user has permissions for
   */
  async findByUserId(userId: string, tx?: DbTransaction): Promise<DatavaultTablePermission[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(datavaultTablePermissions)
      .where(eq(datavaultTablePermissions.userId, userId));
  }

  /**
   * Upsert a permission (create or update)
   * PostgreSQL ON CONFLICT for unique constraint (tableId, userId)
   */
  async upsert(
    data: InsertDatavaultTablePermission,
    tx?: DbTransaction
  ): Promise<DatavaultTablePermission> {
    const database = this.getDb(tx);
    const [permission] = await database
      .insert(datavaultTablePermissions)
      .values(data)
      .onConflictDoUpdate({
        target: [datavaultTablePermissions.tableId, datavaultTablePermissions.userId],
        set: {
          role: data.role,
        },
      })
      .returning();

    return permission;
  }

  /**
   * Delete a permission by ID
   */
  async deleteById(id: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(datavaultTablePermissions).where(eq(datavaultTablePermissions.id, id));
  }

  /**
   * Delete a specific user's permission for a table
   */
  async deleteByTableAndUser(tableId: string, userId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(datavaultTablePermissions)
      .where(
        and(
          eq(datavaultTablePermissions.tableId, tableId),
          eq(datavaultTablePermissions.userId, userId)
        )
      );
  }

  /**
   * Count permissions for a table
   */
  async countByTableId(tableId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .select()
      .from(datavaultTablePermissions)
      .where(eq(datavaultTablePermissions.tableId, tableId));

    return result.length;
  }
}

// Singleton instance
export const datavaultTablePermissionsRepository = new DatavaultTablePermissionsRepository();
