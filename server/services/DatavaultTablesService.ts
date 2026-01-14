import type { DatavaultTable, InsertDatavaultTable, DatavaultTableRole } from "@shared/schema";

import {
  datavaultTablesRepository,
  datavaultColumnsRepository,
  datavaultRowsRepository,
  datavaultTablePermissionsRepository,
  type DbTransaction,
} from "../repositories";

import type { TablePermissionFlags } from "./DatavaultTablePermissionsService";

/**
 * Service layer for DataVault table business logic
 * Handles table CRUD operations with tenant isolation
 */
export class DatavaultTablesService {
  private tablesRepo: typeof datavaultTablesRepository;
  private columnsRepo: typeof datavaultColumnsRepository;
  private rowsRepo: typeof datavaultRowsRepository;
  private permissionsRepo: typeof datavaultTablePermissionsRepository;

  constructor(
    tablesRepo?: typeof datavaultTablesRepository,
    columnsRepo?: typeof datavaultColumnsRepository,
    rowsRepo?: typeof datavaultRowsRepository,
    permissionsRepo?: typeof datavaultTablePermissionsRepository
  ) {
    this.tablesRepo = tablesRepo || datavaultTablesRepository;
    this.columnsRepo = columnsRepo || datavaultColumnsRepository;
    this.rowsRepo = rowsRepo || datavaultRowsRepository;
    this.permissionsRepo = permissionsRepo || datavaultTablePermissionsRepository;
  }

  /**
   * Check what permissions a user has for a table
   * Returns flags for read, write, and owner permissions
   *
   * Permission hierarchy:
   * - owner: full control (includes write + read)
   * - write: can modify data (includes read)
   * - read: read-only access
   */
  async checkTablePermission(
    userId: string,
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<TablePermissionFlags> {
    // Get the table to check if user is the owner
    const table = await this.tablesRepo.findById(tableId, tx);

    if (!table) {
      return { read: false, write: false, owner: false };
    }

    // Verify table belongs to tenant
    if (table.tenantId !== tenantId) {
      return { read: false, write: false, owner: false };
    }

    // Check if user is the table creator/owner (ownerUserId)
    if (table.ownerUserId === userId) {
      return { read: true, write: true, owner: true };
    }

    // Check explicit permission in datavault_table_permissions
    const permission = await this.permissionsRepo.findByTableAndUser(tableId, userId, tx);

    if (!permission) {
      // No permission row = deny access (fallback to table owner only)
      return { read: false, write: false, owner: false };
    }

    // Map role to permission flags
    return this.roleToPermissionFlags(permission.role);
  }

  /**
   * Convert role to permission flags
   */
  private roleToPermissionFlags(role: DatavaultTableRole): TablePermissionFlags {
    switch (role) {
      case "owner":
        return { read: true, write: true, owner: true };
      case "write":
        return { read: true, write: true, owner: false };
      case "read":
        return { read: true, write: false, owner: false };
    }
  }

  /**
   * Require specific permission level (throws if denied)
   */
  async requirePermission(
    userId: string,
    tableId: string,
    tenantId: string,
    level: "read" | "write" | "owner",
    tx?: DbTransaction
  ): Promise<void> {
    const permissions = await this.checkTablePermission(userId, tableId, tenantId, tx);

    if (!permissions[level]) {
      throw new Error(`Access denied - ${level} permission required`);
    }
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Ensure slug is unique for the tenant
   */
  private async ensureUniqueSlug(
    tenantId: string,
    baseSlug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.tablesRepo.slugExists(tenantId, slug, excludeId, tx)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Verify table belongs to tenant
   */
  async verifyTenantOwnership(
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    const table = await this.tablesRepo.findById(tableId, tx);

    if (!table) {
      throw new Error("Table not found");
    }

    if (table.tenantId !== tenantId) {
      throw new Error("Access denied - table belongs to different tenant");
    }

    return table;
  }

  /**
   * Create a new table with automatic primary key column
   */
  async createTable(data: InsertDatavaultTable, tx?: DbTransaction): Promise<DatavaultTable> {
    // Generate slug if not provided
    const baseSlug = data.slug || this.generateSlug(data.name);
    const uniqueSlug = await this.ensureUniqueSlug(data.tenantId, baseSlug, undefined, tx);

    // Create the table
    const table = await this.tablesRepo.create(
      {
        ...data,
        slug: uniqueSlug,
      },
      tx
    );

    // Auto-create a primary key column (ID) for the new table
    // Every table must have at least one primary key
    await this.columnsRepo.create(
      {
        tableId: table.id,
        name: 'ID',
        slug: 'id',
        type: 'auto_number',
        required: true,
        isPrimaryKey: true,
        isUnique: true,
        orderIndex: 0,
        autoNumberStart: 1,
      },
      tx
    );

    return table;
  }

  /**
   * Get table by ID with tenant verification
   */
  async getTable(tableId: string, tenantId: string, tx?: DbTransaction): Promise<DatavaultTable> {
    return this.verifyTenantOwnership(tableId, tenantId, tx);
  }

  /**
   * Get table with columns
   */
  async getTableWithColumns(tableId: string, tenantId: string, tx?: DbTransaction) {
    const table = await this.verifyTenantOwnership(tableId, tenantId, tx);
    const columns = await this.columnsRepo.findByTableId(tableId, tx);

    return {
      ...table,
      columns,
    };
  }

  /**
   * Get table schema (for workflow builder integration)
   * Returns minimal table metadata + ordered columns
   */
  async getTableSchema(tableId: string, tenantId: string, tx?: DbTransaction) {
    await this.verifyTenantOwnership(tableId, tenantId, tx);
    const schema = await this.tablesRepo.getSchema(tableId, tx);

    if (!schema) {
      throw new Error("Table not found");
    }

    return schema;
  }

  /**
   * List all tables for a tenant (filtered by user access)
   */
  async listTables(tenantId: string, userId: string, tx?: DbTransaction): Promise<DatavaultTable[]> {
    return this.tablesRepo.findByTenantAndUser(tenantId, userId, tx);
  }

  /**
   * List tables with stats (column count, row count)
   */
  async listTablesWithStats(tenantId: string, userId: string, tx?: DbTransaction) {
    const tables = await this.tablesRepo.findByTenantAndUser(tenantId, userId, tx);

    return Promise.all(
      tables.map(async (table) => {
        const columnCount = await this.columnsRepo.countByTableId(table.id, tx);
        const rowCount = await this.rowsRepo.countByTableId(table.id, tx);

        return {
          ...table,
          columnCount,
          rowCount,
        };
      })
    );
  }

  /**
   * Update table
   */
  async updateTable(
    tableId: string,
    tenantId: string,
    data: Partial<InsertDatavaultTable>,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    await this.verifyTenantOwnership(tableId, tenantId, tx);

    // If name changed, regenerate slug
    if (data.name && !data.slug) {
      const baseSlug = this.generateSlug(data.name);
      data.slug = await this.ensureUniqueSlug(tenantId, baseSlug, tableId, tx);
    }

    // If slug provided, ensure it's unique
    if (data.slug) {
      data.slug = await this.ensureUniqueSlug(tenantId, data.slug, tableId, tx);
    }

    return this.tablesRepo.update(tableId, data, tx);
  }

  /**
   * Delete table (cascades to columns, rows, and values)
   */
  async deleteTable(tableId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyTenantOwnership(tableId, tenantId, tx);
    await this.tablesRepo.delete(tableId, tx);
  }

  /**
   * Get table by slug
   */
  async getTableBySlug(
    tenantId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<DatavaultTable | undefined> {
    return this.tablesRepo.findByTenantAndSlug(tenantId, slug, tx);
  }

  /**
   * Check if table slug is available
   */
  async isSlugAvailable(
    tenantId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    return !(await this.tablesRepo.slugExists(tenantId, slug, excludeId, tx));
  }

  /**
   * Move table to a different database (or to main folder if databaseId is null)
   */
  async moveTable(
    tableId: string,
    tenantId: string,
    databaseId: string | null,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    // Verify table ownership
    await this.verifyTenantOwnership(tableId, tenantId, tx);

    // If moving to a database, verify it exists and belongs to the same tenant
    if (databaseId) {
      const { datavaultDatabasesRepository } = await import('../repositories/DatavaultDatabasesRepository');
      const databaseExists = await datavaultDatabasesRepository.existsForTenant(databaseId, tenantId);

      if (!databaseExists) {
        throw new Error('Database not found or access denied');
      }
    }

    // Update the table's databaseId
    return this.tablesRepo.update(tableId, { databaseId }, tx);
  }
}

// Singleton instance
export const datavaultTablesService = new DatavaultTablesService();
