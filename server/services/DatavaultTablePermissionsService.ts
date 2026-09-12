import type {
  AccessRole,
  DatavaultTablePermission,
  InsertDatavaultTablePermission,
  DatavaultTableRole,
} from "@shared/schema";

import {
  datavaultTablePermissionsRepository,
  datavaultTablesRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";

import { datavaultAclService } from "./DatavaultAclService";

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
 *
 * RLS-2b: copies the service-boundary tenant transaction pattern from
 * CollectionService (RLS-2a) — see docs/architecture/TENANT_ISOLATION_RLS.md §2b.
 */
export class DatavaultTablePermissionsService {
  private permissionsRepo: typeof datavaultTablePermissionsRepository;
  private tablesRepo: typeof datavaultTablesRepository;

  constructor(
    permissionsRepo?: typeof datavaultTablePermissionsRepository,
    tablesRepo?: typeof datavaultTablesRepository
  ) {
    this.permissionsRepo = permissionsRepo ?? datavaultTablePermissionsRepository;
    this.tablesRepo = tablesRepo ?? datavaultTablesRepository;
  }

  /** See CollectionService.withTx (RLS-2a) — identical shape, copied per RLS-2b. */
  private async withTx<T>(
    expectedTenantId: string,
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    const ambientTenantId = getCurrentTenantId();
    if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
      throw new Error(
        `RLS: tenant mismatch — operation requested for tenant "${expectedTenantId}" but the ` +
        `request's async context is tenant "${ambientTenantId}". Refusing to run rather than ` +
        `silently scoping to the wrong tenant.`
      );
    }
    return withCurrentTenant(fn);
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Get the table to check if user is the owner
      const table = await this.tablesRepo.findById(tableId, scopedTx);

      if (!table) {
        return { read: false, write: false, owner: false };
      }

      // Verify table belongs to tenant
      if (table.tenantId !== tenantId) {
        return { read: false, write: false, owner: false };
      }

      const role = await datavaultAclService.resolveRoleForTable(userId, tableId, scopedTx);
      return this.accessRoleToPermissionFlags(role);
    });
  }

  /**
   * Convert unified access roles to legacy permission flags.
   */
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
    await this.withTx(tenantId, tx, async (scopedTx) => {
      const permissions = await this.checkTablePermission(userId, tableId, tenantId, scopedTx);

      if (!permissions[level]) {
        throw new Error(`Access denied - ${level} permission required`);
      }
    });
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Only owners can view permissions
      await this.requirePermission(userId, tableId, tenantId, "owner", scopedTx);
      return this.permissionsRepo.findByTableId(tableId, scopedTx);
    });
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Only owners can grant permissions
      await this.requirePermission(actorUserId, tableId, tenantId, "owner", scopedTx);

      // Ensure tableId matches
      if (data.tableId !== tableId) {
        throw new Error("Table ID mismatch");
      }

      // Prevent user from modifying their own permissions (if they're the table owner)
      const table = await this.tablesRepo.findById(tableId, scopedTx);
      if (table?.ownerUserId === data.userId) {
        throw new Error("Cannot modify permissions for table owner");
      }

      return this.permissionsRepo.upsert(data, scopedTx);
    });
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
    await this.withTx(tenantId, tx, async (scopedTx) => {
      // Only owners can revoke permissions
      await this.requirePermission(actorUserId, tableId, tenantId, "owner", scopedTx);

      // Get the permission to verify it exists and belongs to the table
      const permission = await this.permissionsRepo.findById(permissionId, scopedTx);

      if (!permission) {
        throw new Error("Permission not found");
      }

      if (permission.tableId !== tableId) {
        throw new Error("Permission does not belong to this table");
      }

      // Prevent revoking table owner's permission
      const table = await this.tablesRepo.findById(tableId, scopedTx);
      if (table?.ownerUserId === permission.userId) {
        throw new Error("Cannot revoke permissions for table owner");
      }

      await this.permissionsRepo.deleteById(permissionId, scopedTx);
    });
  }

  /**
   * Get all tables a user has access to (with their permission level)
   */
  async getUserTablePermissions(
    userId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<Array<DatavaultTablePermission & { permissionFlags: TablePermissionFlags }>> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const permissions = await this.permissionsRepo.findByUserId(userId, scopedTx);
      if (permissions.length === 0) {return [];}

      // Batch fetch all relevant tables in one query instead of one per permission
      const tableIds = permissions.map(p => p.tableId);
      const tables = await this.tablesRepo.findByIds(tableIds, scopedTx);
      const tableMap = new Map(tables.map(t => [t.id, t]));

      return permissions.map(permission => {
        const table = tableMap.get(permission.tableId);
        let flags: TablePermissionFlags;

        if (!table || table.tenantId !== tenantId) {
          flags = { read: false, write: false, owner: false };
        } else if (table.ownerUserId === userId) {
          flags = { read: true, write: true, owner: true };
        } else {
          flags = this.roleToPermissionFlags(permission.role);
        }

        return { ...permission, permissionFlags: flags };
      });
    });
  }
}

// Singleton instance
export const datavaultTablePermissionsService = new DatavaultTablePermissionsService();
