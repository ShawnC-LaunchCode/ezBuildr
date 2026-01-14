import type {
  DatavaultTablePermission,
  InsertDatavaultTablePermission,
  DatavaultTableRole,
} from "@shared/schema";

import {
  datavaultTablePermissionsRepository,
  datavaultTablesRepository,
  type DbTransaction,
} from "../repositories";

/**
 * Permission level flags for RBAC
 */
export interface TablePermissionFlags {
  read: boolean;
  write: boolean;
  owner: boolean;
}

/**
 * Service layer for DataVault table permissions
 * Handles permission CRUD and authorization checks
 */
export class DatavaultTablePermissionsService {
  private permissionsRepo: typeof datavaultTablePermissionsRepository;
  private tablesRepo: typeof datavaultTablesRepository;

  constructor(
    permissionsRepo?: typeof datavaultTablePermissionsRepository,
    tablesRepo?: typeof datavaultTablesRepository
  ) {
    this.permissionsRepo = permissionsRepo || datavaultTablePermissionsRepository;
    this.tablesRepo = tablesRepo || datavaultTablesRepository;
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
   * Get all permissions for a table (owner only)
   */
  async getTablePermissions(
    userId: string,
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultTablePermission[]> {
    // Only owners can view permissions
    await this.requirePermission(userId, tableId, tenantId, "owner", tx);
    return this.permissionsRepo.findByTableId(tableId, tx);
  }

  /**
   * Grant or update permission for a user on a table (owner only)
   * Upserts the permission (creates or updates)
   */
  async grantPermission(
    actorUserId: string,
    tableId: string,
    tenantId: string,
    data: InsertDatavaultTablePermission,
    tx?: DbTransaction
  ): Promise<DatavaultTablePermission> {
    // Only owners can grant permissions
    await this.requirePermission(actorUserId, tableId, tenantId, "owner", tx);

    // Ensure tableId matches
    if (data.tableId !== tableId) {
      throw new Error("Table ID mismatch");
    }

    // Prevent user from modifying their own permissions (if they're the table owner)
    const table = await this.tablesRepo.findById(tableId, tx);
    if (table?.ownerUserId === data.userId) {
      throw new Error("Cannot modify permissions for table owner");
    }

    return this.permissionsRepo.upsert(data, tx);
  }

  /**
   * Revoke permission by permission ID (owner only)
   */
  async revokePermission(
    actorUserId: string,
    permissionId: string,
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Only owners can revoke permissions
    await this.requirePermission(actorUserId, tableId, tenantId, "owner", tx);

    // Get the permission to verify it exists and belongs to the table
    const permission = await this.permissionsRepo.findById(permissionId, tx);

    if (!permission) {
      throw new Error("Permission not found");
    }

    if (permission.tableId !== tableId) {
      throw new Error("Permission does not belong to this table");
    }

    // Prevent revoking table owner's permission
    const table = await this.tablesRepo.findById(tableId, tx);
    if (table?.ownerUserId === permission.userId) {
      throw new Error("Cannot revoke permissions for table owner");
    }

    await this.permissionsRepo.deleteById(permissionId, tx);
  }

  /**
   * Get all tables a user has access to (with their permission level)
   */
  async getUserTablePermissions(
    userId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<Array<DatavaultTablePermission & { permissionFlags: TablePermissionFlags }>> {
    const permissions = await this.permissionsRepo.findByUserId(userId, tx);

    // Map permissions to include flags
    return Promise.all(
      permissions.map(async (permission) => {
        const flags = await this.checkTablePermission(userId, permission.tableId, tenantId, tx);
        return {
          ...permission,
          permissionFlags: flags,
        };
      })
    );
  }
}

// Singleton instance
export const datavaultTablePermissionsService = new DatavaultTablePermissionsService();
