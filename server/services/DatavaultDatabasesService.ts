import { NotFoundError, UnauthorizedError, BadRequestError } from '../middleware/errorHandler';
import {
  datavaultDatabaseAccessRepository,
  datavaultDatabasesRepository,
  datavaultTablesRepository,
  type DbTransaction,
} from '../repositories';
import { canManageOrg, isOrgMember } from '../utils/ownershipAccess';
import { withCurrentTenant, getCurrentTenantId, withTenant } from '../utils/rlsContext';

import { aclService } from './AclService';
import { datavaultAclService } from './DatavaultAclService';

import type { AccessRole, DatavaultDatabase, DatavaultDatabaseAccess, DatavaultScopeType, PrincipalType } from '../../shared/schema';

interface CreateDatabaseInput {
  tenantId: string;
  name: string;
  description?: string;
  scopeType: DatavaultScopeType;
  scopeId?: string;
  creatorId: string;
  ownerType?: 'user' | 'org';
  ownerUuid?: string;
}

interface UpdateDatabaseInput {
  name?: string;
  description?: string;
  scopeType?: DatavaultScopeType;
  scopeId?: string;
}

/**
 * RLS-2b: copies the service-boundary tenant transaction pattern from
 * CollectionService (RLS-2a) — see docs/architecture/TENANT_ISOLATION_RLS.md §2b.
 */
export class DatavaultDatabasesService {
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

  private hasMinimumRole(userRole: AccessRole, minRole: Exclude<AccessRole, 'none'>): boolean {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };
    return rolePrecedence[userRole] >= rolePrecedence[minRole];
  }

  /**
   * Get all databases for a tenant (filtered by user access)
   */
  async getDatabasesForTenant(tenantId: string, userId: string, tx?: DbTransaction): Promise<DatavaultDatabase[]> {
    return this.withTx(tenantId, tx, (scopedTx) =>
      datavaultDatabasesRepository.findByTenantAndUser(tenantId, userId, scopedTx));
  }

  /**
   * Get databases by scope
   */
  async getDatabasesByScope(
    tenantId: string,
    scopeType: DatavaultScopeType,
    scopeId?: string,
    userId?: string,
    tx?: DbTransaction
  ): Promise<DatavaultDatabase[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      if (scopeType === 'account' && userId) {
        const visible = await datavaultDatabasesRepository.findByTenantAndUser(tenantId, userId, scopedTx);
        return visible.filter((database) => database.scopeType === 'account');
      }
      return datavaultDatabasesRepository.findByScope(tenantId, scopeType, scopeId, scopedTx);
    });
  }

  async verifyDatabaseAccess(
    databaseId: string,
    tenantId: string,
    userId: string,
    minRole: Exclude<AccessRole, 'none'> = 'view',
    tx?: DbTransaction
  ): Promise<DatavaultDatabase> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const database = await datavaultDatabasesRepository.findById(databaseId, scopedTx);
      if (!database) {
        throw new NotFoundError('Database not found');
      }
      if (database.tenantId !== tenantId) {
        throw new UnauthorizedError('Access denied - database belongs to different tenant');
      }
      const userRole = await datavaultAclService.resolveRoleForDatabase(userId, databaseId, scopedTx);
      if (!this.hasMinimumRole(userRole, minRole)) {
        throw new Error('Access denied - insufficient permissions for this database');
      }
      return database;
    });
  }

  /**
   * Get database by ID
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getDatabaseById(
    id: string,
    tenantId: string,
    userId?: string,
    minRole: Exclude<AccessRole, 'none'> = 'view',
    tx?: DbTransaction
  ) {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const database = await datavaultDatabasesRepository.findByIdWithStats(id, scopedTx);

      if (!database) {
        throw new NotFoundError('Database not found');
      }

      if (database.tenantId !== tenantId) {
        throw new UnauthorizedError('Database belongs to different tenant');
      }

      if (userId) {
        const userRole = await datavaultAclService.resolveRoleForDatabase(userId, id, scopedTx);
        if (!this.hasMinimumRole(userRole, minRole)) {
          throw new Error('Access denied - insufficient permissions for this database');
        }
      }

      return database;
    });
  }

  // eslint-disable-next-line complexity
  private async resolveCreateOwnership(
    input: CreateDatabaseInput,
    tx?: DbTransaction
  ): Promise<{ ownerType: 'user' | 'org'; ownerUuid: string }> {
    if (input.scopeType === 'project') {
      if (!input.scopeId) {
        throw new BadRequestError('Project scope requires a scope ID');
      }
      const hasProjectAccess = await aclService.hasProjectRole(input.creatorId, input.scopeId, 'edit', tx);
      if (!hasProjectAccess) {
        throw new Error('Access denied - insufficient permissions for this project');
      }
      const { projectRepository } = await import('../repositories');
      const project = await projectRepository.findById(input.scopeId, tx);
      if (!project) {
        throw new NotFoundError('Project not found');
      }
      return {
        ownerType: project.ownerType ?? 'user',
        ownerUuid: project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId,
      };
    }

    if (input.scopeType === 'workflow') {
      if (!input.scopeId) {
        throw new BadRequestError('Workflow scope requires a scope ID');
      }
      const hasWorkflowAccess = await aclService.hasWorkflowRole(input.creatorId, input.scopeId, 'edit', tx);
      if (!hasWorkflowAccess) {
        throw new Error('Access denied - insufficient permissions for this workflow');
      }
      const { workflowRepository } = await import('../repositories');
      const workflow = await workflowRepository.findById(input.scopeId, tx);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }
      return {
        ownerType: workflow.ownerType ?? 'user',
        ownerUuid: workflow.ownerUuid ?? workflow.ownerId ?? workflow.creatorId ?? input.creatorId,
      };
    }

    const ownerType = input.ownerType ?? 'user';
    const ownerUuid = input.ownerUuid ?? input.creatorId;
    if (ownerType === 'org') {
      const canManage = await canManageOrg(input.creatorId, ownerUuid, tx);
      if (!canManage) {
        throw new Error('Access denied: Organization admin role required to create organization databases');
      }
    } else if (ownerUuid !== input.creatorId) {
      throw new Error('Access denied: You do not have permission to create assets with this ownership');
    }
    return { ownerType, ownerUuid };
  }

  /**
   * Create a new database
   */
  async createDatabase(input: CreateDatabaseInput, tx?: DbTransaction): Promise<DatavaultDatabase> {
    return this.withTx(input.tenantId, tx, async (scopedTx) => {
      // Validate scope
      this.validateScope(input.scopeType, input.scopeId);

      const { ownerType, ownerUuid } = await this.resolveCreateOwnership(input, scopedTx);

      return datavaultDatabasesRepository.create({
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        ownerType,
        ownerUuid,
      }, scopedTx);
    });
  }

  /**
   * Update a database
   */
  async updateDatabase(
    id: string,
    tenantId: string,
    input: UpdateDatabaseInput,
    userId?: string,
    tx?: DbTransaction
  ): Promise<DatavaultDatabase> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      if (userId) {
        await this.verifyDatabaseAccess(id, tenantId, userId, 'edit', scopedTx);
      } else {
        const exists = await datavaultDatabasesRepository.existsForTenant(id, tenantId, scopedTx);
        if (!exists) {
          throw new NotFoundError('Database not found or unauthorized');
        }
      }

      // Validate scope if being changed
      if (input.scopeType !== undefined) {
        this.validateScope(input.scopeType, input.scopeId);
      }

      const updated = await datavaultDatabasesRepository.update(id, input, scopedTx);

      if (!updated) {
        throw new Error('Failed to update database');
      }

      return updated;
    });
  }

  /**
   * Delete a database
   */
  async deleteDatabase(id: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      // Check ownership
      const exists = await datavaultDatabasesRepository.existsForTenant(id, tenantId, scopedTx);
      if (!exists) {
        throw new NotFoundError('Database not found or unauthorized');
      }

      const deleted = await datavaultDatabasesRepository.delete(id, scopedTx);

      if (!deleted) {
        throw new Error('Failed to delete database');
      }
    });
  }

  async deleteDatabaseForUser(id: string, tenantId: string, userId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyDatabaseAccess(id, tenantId, userId, 'owner', scopedTx);
      const deleted = await datavaultDatabasesRepository.delete(id, scopedTx);
      if (!deleted) {
        throw new Error('Failed to delete database');
      }
    });
  }

  /**
   * Get tables in a database
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getTablesInDatabase(databaseId: string, tenantId: string, userId?: string, tx?: DbTransaction) {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      if (userId) {
        await this.verifyDatabaseAccess(databaseId, tenantId, userId, 'view', scopedTx);
      } else {
        const exists = await datavaultDatabasesRepository.existsForTenant(databaseId, tenantId, scopedTx);
        if (!exists) {
          throw new NotFoundError('Database not found or unauthorized');
        }
      }

      return datavaultDatabasesRepository.getTablesInDatabase(databaseId, scopedTx);
    });
  }

  /**
   * Validate scope type and ID combination
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private validateScope(scopeType: DatavaultScopeType, scopeId?: string) {
    if (scopeType === 'account' && scopeId) {
      throw new BadRequestError('Account scope should not have a scope ID');
    }

    if ((scopeType === 'project' || scopeType === 'workflow') && !scopeId) {
      throw new BadRequestError(`${scopeType} scope requires a scope ID`);
    }
  }

  /**
   * Transfer database ownership (new ownership model)
   * Cascades to all child tables (tables inherit database ownership)
   *
   * @param databaseId - Database to transfer
   * @param userId - User requesting transfer
   * @param targetOwnerType - 'user' or 'org'
   * @param targetOwnerUuid - UUID of target owner
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async transferOwnership(
    databaseId: string,
    userId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string,
    tx?: DbTransaction
  ) {
    const { transferService } = await import('./TransferService');

    // No tenantId argument on this method (see file header) — the database's own
    // tenantId IS the tenant boundary, so it has to be discovered from the row
    // before the scoped transaction can be opened.
    //
    // ⚠️ RLS-5: this lookup used to be unscoped "by design", on the reasoning
    // that "a primary-key lookup isn't itself tenant-filtered". That premise
    // was only ever true while the app connected as the table OWNER, which
    // Postgres exempts from RLS. Against a real non-owner role
    // `datavault_databases` is covered, an unscoped read returns NOTHING, and
    // every transfer failed as "Database not found" — a bootstrap read that
    // cannot see the row it needs in order to learn which tenant to pin.
    //
    // Use the ambient tenant when the caller has one (routes and block runners
    // always do), which makes the row visible and costs nothing. With no
    // ambient tenant this behaves exactly as before, so no pre-enforcement
    // caller changes.
    const ambientTenantId = getCurrentTenantId();
    const preliminary = tx !== undefined || ambientTenantId === undefined
      ? await datavaultDatabasesRepository.findById(databaseId, tx)
      : await withTenant(ambientTenantId, (scoped) =>
          datavaultDatabasesRepository.findById(databaseId, scoped));
    if (!preliminary) {
      throw new NotFoundError('Database not found');
    }

    return this.withTx(preliminary.tenantId, tx, async (scopedTx) => {
      const database = await datavaultDatabasesRepository.findById(databaseId, scopedTx) ?? preliminary;

      // Source-side authorization: the direct owner, or any member of the org that
      // owns the database (member-is-enough policy for transfers).
      const hasOwnerAccess = await datavaultAclService.hasDatabaseRole(userId, databaseId, 'owner', scopedTx);
      const isOrgOwnedMember =
        database.ownerType === 'org' &&
        database.ownerUuid != null &&
        (await isOrgMember(userId, database.ownerUuid, scopedTx));
      if (!hasOwnerAccess && !isOrgOwnedMember) {
        throw new Error('Access denied: You do not have permission to transfer this database');
      }

      // Transfer-into-org requires org membership (not admin); validateTransfer
      // checks target existence first ("not found") then membership ("not a member").
      await transferService.validateTransfer(
        userId,
        database.ownerType ?? 'user',
        database.ownerUuid ?? userId,
        { ownerType: targetOwnerType, ownerUuid: targetOwnerUuid },
        scopedTx
      );

      const updated = await datavaultDatabasesRepository.update(databaseId, {
        ownerType: targetOwnerType,
        ownerUuid: targetOwnerUuid,
      }, scopedTx);
      if (!updated) {
        throw new Error('Failed to transfer database ownership');
      }
      await datavaultTablesRepository.updateOwnerByDatabaseId(databaseId, targetOwnerType, targetOwnerUuid, scopedTx);
      return updated;
    });
  }

  async getDatabaseAccess(databaseId: string, tenantId: string, userId: string, tx?: DbTransaction): Promise<{
    entries: DatavaultDatabaseAccess[];
    currentUserRole: AccessRole;
  }> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyDatabaseAccess(databaseId, tenantId, userId, 'view', scopedTx);
      const [entries, currentUserRole] = await Promise.all([
        datavaultDatabaseAccessRepository.findByDatabaseId(databaseId, scopedTx),
        datavaultAclService.resolveRoleForDatabase(userId, databaseId, scopedTx),
      ]);
      return { entries, currentUserRole };
    });
  }

  async grantDatabaseAccess(
    databaseId: string,
    tenantId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: AccessRole }>,
    tx?: DbTransaction
  ): Promise<DatavaultDatabaseAccess[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyDatabaseAccess(databaseId, tenantId, requestorId, 'owner', scopedTx);
      const results: DatavaultDatabaseAccess[] = [];
      for (const entry of entries) {
        const acl = await datavaultDatabaseAccessRepository.upsert(
          databaseId,
          entry.principalType,
          entry.principalId,
          entry.role,
          scopedTx
        );
        results.push(acl);
      }
      return results;
    });
  }

  async revokeDatabaseAccess(
    databaseId: string,
    tenantId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyDatabaseAccess(databaseId, tenantId, requestorId, 'owner', scopedTx);
      await datavaultDatabaseAccessRepository.deleteManyByPrincipals(databaseId, entries, scopedTx);
    });
  }
}

export const datavaultDatabasesService = new DatavaultDatabasesService();
