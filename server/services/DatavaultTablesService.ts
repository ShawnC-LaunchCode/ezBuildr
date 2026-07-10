import type {
  AccessRole,
  DatavaultTable,
  DatavaultTableAccess,
  InsertDatavaultTable,
  PrincipalType,
} from "@shared/schema";

import {
  datavaultTableAccessRepository,
  datavaultTablesRepository,
  datavaultColumnsRepository,
  datavaultRowsRepository,
  datavaultTablePermissionsRepository,
  type DbTransaction,
} from "../repositories";
import { canManageOrg } from "../utils/ownershipAccess";

import { datavaultAclService } from "./DatavaultAclService";

import type { TablePermissionFlags } from "./DatavaultTablePermissionsService";

/**
 * Service layer for DataVault table business logic
 * Handles table CRUD operations with tenant isolation
 */
export class DatavaultTablesService {
  private tablesRepo: typeof datavaultTablesRepository;
  private columnsRepo: typeof datavaultColumnsRepository;
  private rowsRepo: typeof datavaultRowsRepository;
  private accessRepo: typeof datavaultTableAccessRepository;

  constructor(
    tablesRepo?: typeof datavaultTablesRepository,
    columnsRepo?: typeof datavaultColumnsRepository,
    rowsRepo?: typeof datavaultRowsRepository,
    _permissionsRepo?: typeof datavaultTablePermissionsRepository,
    accessRepo?: typeof datavaultTableAccessRepository
  ) {
    this.tablesRepo = tablesRepo ?? datavaultTablesRepository;
    this.columnsRepo = columnsRepo ?? datavaultColumnsRepository;
    this.rowsRepo = rowsRepo ?? datavaultRowsRepository;
    this.accessRepo = accessRepo ?? datavaultTableAccessRepository;
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
    const table = await this.tablesRepo.findById(tableId, tx);

    if (!table) {
      return { read: false, write: false, owner: false };
    }

    // Verify table belongs to tenant
    if (table.tenantId !== tenantId) {
      return { read: false, write: false, owner: false };
    }

    const role = await datavaultAclService.resolveRoleForTable(userId, tableId, tx);
    return this.accessRoleToPermissionFlags(role);
  }

  private accessRoleToPermissionFlags(role: AccessRole): TablePermissionFlags {
    switch (role) {
      case "owner":
        return { read: true, write: true, owner: true };
      case "edit":
        return { read: true, write: true, owner: false };
      case "view":
        return { read: true, write: false, owner: false };
      case "none":
        return { read: false, write: false, owner: false };
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
    const baseSlug = data.slug ?? this.generateSlug(data.name);
    const uniqueSlug = await this.ensureUniqueSlug(data.tenantId, baseSlug, undefined, tx);

    let ownerType = data.ownerType ?? (data.ownerUserId ? 'user' : undefined);
    let ownerUuid = data.ownerUuid ?? data.ownerUserId ?? undefined;

    if (data.databaseId) {
      const { datavaultDatabasesRepository } = await import('../repositories/DatavaultDatabasesRepository');
      const database = await datavaultDatabasesRepository.findById(data.databaseId, tx);
      if (database) {
        ownerType = database.ownerType ?? ownerType;
        ownerUuid = database.ownerUuid ?? ownerUuid;
      }
    } else if (ownerType === 'org' && ownerUuid && data.ownerUserId) {
      const canManage = await canManageOrg(data.ownerUserId, ownerUuid);
      if (!canManage) {
        throw new Error('Access denied: Organization admin role required to create organization tables');
      }
    }

    // Create the table
    const table = await this.tablesRepo.create(
      {
        ...data,
        slug: uniqueSlug,
        ownerType,
        ownerUuid,
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- return type inferred from composed query
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- return type inferred from repository
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- return type inferred from composed query
  async listTablesWithStats(tenantId: string, userId: string, tx?: DbTransaction) {
    const tables = await this.tablesRepo.findByTenantAndUser(tenantId, userId, tx);

    if (tables.length === 0) {return [];}
    const tableIds = tables.map(t => t.id);
    const [columnCounts, rowCounts] = await Promise.all([
      this.columnsRepo.countByTableIds(tableIds, tx),
      this.rowsRepo.countByTableIds(tableIds, tx),
    ]);
    return tables.map(table => ({
      ...table,
      columnCount: columnCounts.get(table.id) ?? 0,
      rowCount: rowCounts.get(table.id) ?? 0,
    }));
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

    const updateData = { ...data };

    // If name changed, regenerate slug
    if (updateData.name && !updateData.slug) {
      const baseSlug = this.generateSlug(updateData.name);
      updateData.slug = await this.ensureUniqueSlug(tenantId, baseSlug, tableId, tx);
    }

    // If slug provided, ensure it's unique
    if (updateData.slug) {
      updateData.slug = await this.ensureUniqueSlug(tenantId, updateData.slug, tableId, tx);
    }

    return this.tablesRepo.update(tableId, updateData, tx);
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
    userId?: string,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    // Verify table ownership
    await this.verifyTenantOwnership(tableId, tenantId, tx);

    if (userId) {
      await this.requirePermission(userId, tableId, tenantId, 'owner', tx);
    }

    let ownerUpdate: Pick<InsertDatavaultTable, 'ownerType' | 'ownerUuid'> = {};

    // If moving to a database, verify it exists and belongs to the same tenant
    if (databaseId) {
      const { datavaultDatabasesRepository } = await import('../repositories/DatavaultDatabasesRepository');
      const database = await datavaultDatabasesRepository.findById(databaseId, tx);

      if (!database || database.tenantId !== tenantId) {
        throw new Error('Database not found or access denied');
      }
      if (userId) {
        const hasDatabaseAccess = await datavaultAclService.hasDatabaseRole(userId, databaseId, 'edit', tx);
        if (!hasDatabaseAccess) {
          throw new Error('Access denied - insufficient permissions for target database');
        }
      }
      ownerUpdate = {
        ownerType: database.ownerType ?? undefined,
        ownerUuid: database.ownerUuid ?? undefined,
      };
    }

    // Update the table's databaseId
    return this.tablesRepo.update(tableId, { databaseId, ...ownerUpdate }, tx);
  }

  async getTableAccess(tableId: string, tenantId: string, userId: string): Promise<{
    entries: DatavaultTableAccess[];
    currentUserRole: AccessRole;
  }> {
    await this.requirePermission(userId, tableId, tenantId, 'read');
    const [entries, currentUserRole] = await Promise.all([
      this.accessRepo.findByTableId(tableId),
      datavaultAclService.resolveRoleForTable(userId, tableId),
    ]);
    return { entries, currentUserRole };
  }

  async grantTableAccess(
    tableId: string,
    tenantId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: AccessRole }>
  ): Promise<DatavaultTableAccess[]> {
    await this.requirePermission(requestorId, tableId, tenantId, 'owner');
    const results: DatavaultTableAccess[] = [];
    for (const entry of entries) {
      const acl = await this.accessRepo.upsert(tableId, entry.principalType, entry.principalId, entry.role);
      results.push(acl);
    }
    return results;
  }

  async revokeTableAccess(
    tableId: string,
    tenantId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>
  ): Promise<void> {
    await this.requirePermission(requestorId, tableId, tenantId, 'owner');
    await this.accessRepo.deleteManyByPrincipals(tableId, entries);
  }

  async transferOwnership(
    tableId: string,
    tenantId: string,
    userId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ): Promise<DatavaultTable> {
    const { transferService } = await import('./TransferService');
    const table = await this.verifyTenantOwnership(tableId, tenantId);
    await this.requirePermission(userId, tableId, tenantId, 'owner');
    if (targetOwnerType === 'org' && !(await canManageOrg(userId, targetOwnerUuid))) {
      throw new Error('Access denied: Organization admin role required to transfer tables to this organization');
    }
    await transferService.validateTransfer(
      userId,
      table.ownerType ?? 'user',
      table.ownerUuid ?? table.ownerUserId ?? userId,
      targetOwnerType,
      targetOwnerUuid
    );
    return this.tablesRepo.update(tableId, {
      databaseId: null,
      ownerType: targetOwnerType,
      ownerUuid: targetOwnerUuid,
    });
  }
}

// Singleton instance
export const datavaultTablesService = new DatavaultTablesService();
