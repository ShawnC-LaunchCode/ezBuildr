import { NotFoundError, UnauthorizedError, BadRequestError } from '../middleware/errorHandler';
import {
  datavaultDatabaseAccessRepository,
  datavaultDatabasesRepository,
  datavaultTablesRepository,
  type DbTransaction,
} from '../repositories';
import { canManageOrg } from '../utils/ownershipAccess';

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

export class DatavaultDatabasesService {
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
  async getDatabasesForTenant(tenantId: string, userId: string): Promise<DatavaultDatabase[]> {
    return datavaultDatabasesRepository.findByTenantAndUser(tenantId, userId);
  }

  /**
   * Get databases by scope
   */
  async getDatabasesByScope(
    tenantId: string,
    scopeType: DatavaultScopeType,
    scopeId?: string,
    userId?: string
  ): Promise<DatavaultDatabase[]> {
    if (scopeType === 'account' && userId) {
      const visible = await datavaultDatabasesRepository.findByTenantAndUser(tenantId, userId);
      return visible.filter((database) => database.scopeType === 'account');
    }
    return datavaultDatabasesRepository.findByScope(tenantId, scopeType, scopeId);
  }

  async verifyDatabaseAccess(
    databaseId: string,
    tenantId: string,
    userId: string,
    minRole: Exclude<AccessRole, 'none'> = 'view',
    tx?: DbTransaction
  ): Promise<DatavaultDatabase> {
    const database = await datavaultDatabasesRepository.findById(databaseId, tx);
    if (!database) {
      throw new NotFoundError('Database not found');
    }
    if (database.tenantId !== tenantId) {
      throw new UnauthorizedError('Access denied - database belongs to different tenant');
    }
    const userRole = await datavaultAclService.resolveRoleForDatabase(userId, databaseId, tx);
    if (!this.hasMinimumRole(userRole, minRole)) {
      throw new Error('Access denied - insufficient permissions for this database');
    }
    return database;
  }

  /**
   * Get database by ID
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getDatabaseById(
    id: string,
    tenantId: string,
    userId?: string,
    minRole: Exclude<AccessRole, 'none'> = 'view'
  ) {
    const database = await datavaultDatabasesRepository.findByIdWithStats(id);

    if (!database) {
      throw new NotFoundError('Database not found');
    }

    if (database.tenantId !== tenantId) {
      throw new UnauthorizedError('Database belongs to different tenant');
    }

    if (userId) {
      const userRole = await datavaultAclService.resolveRoleForDatabase(userId, id);
      if (!this.hasMinimumRole(userRole, minRole)) {
        throw new Error('Access denied - insufficient permissions for this database');
      }
    }

    return database;
  }

  // eslint-disable-next-line complexity
  private async resolveCreateOwnership(input: CreateDatabaseInput): Promise<{ ownerType: 'user' | 'org'; ownerUuid: string }> {
    if (input.scopeType === 'project') {
      if (!input.scopeId) {
        throw new BadRequestError('Project scope requires a scope ID');
      }
      const hasProjectAccess = await aclService.hasProjectRole(input.creatorId, input.scopeId, 'edit');
      if (!hasProjectAccess) {
        throw new Error('Access denied - insufficient permissions for this project');
      }
      const { projectRepository } = await import('../repositories');
      const project = await projectRepository.findById(input.scopeId);
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
      const hasWorkflowAccess = await aclService.hasWorkflowRole(input.creatorId, input.scopeId, 'edit');
      if (!hasWorkflowAccess) {
        throw new Error('Access denied - insufficient permissions for this workflow');
      }
      const { workflowRepository } = await import('../repositories');
      const workflow = await workflowRepository.findById(input.scopeId);
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
      const canManage = await canManageOrg(input.creatorId, ownerUuid);
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
  async createDatabase(input: CreateDatabaseInput): Promise<DatavaultDatabase> {
    // Validate scope
    this.validateScope(input.scopeType, input.scopeId);

    const { ownerType, ownerUuid } = await this.resolveCreateOwnership(input);

    return datavaultDatabasesRepository.create({
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      ownerType,
      ownerUuid,
    });
  }

  /**
   * Update a database
   */
  async updateDatabase(
    id: string,
    tenantId: string,
    input: UpdateDatabaseInput,
    userId?: string
  ): Promise<DatavaultDatabase> {
    if (userId) {
      await this.verifyDatabaseAccess(id, tenantId, userId, 'edit');
    } else {
      const exists = await datavaultDatabasesRepository.existsForTenant(id, tenantId);
      if (!exists) {
        throw new NotFoundError('Database not found or unauthorized');
      }
    }

    // Validate scope if being changed
    if (input.scopeType !== undefined) {
      this.validateScope(input.scopeType, input.scopeId);
    }

    const updated = await datavaultDatabasesRepository.update(id, input);

    if (!updated) {
      throw new Error('Failed to update database');
    }

    return updated;
  }

  /**
   * Delete a database
   */
  async deleteDatabase(id: string, tenantId: string): Promise<void> {
    // Check ownership
    const exists = await datavaultDatabasesRepository.existsForTenant(id, tenantId);
    if (!exists) {
      throw new NotFoundError('Database not found or unauthorized');
    }

    const deleted = await datavaultDatabasesRepository.delete(id);

    if (!deleted) {
      throw new Error('Failed to delete database');
    }
  }

  async deleteDatabaseForUser(id: string, tenantId: string, userId: string): Promise<void> {
    await this.verifyDatabaseAccess(id, tenantId, userId, 'owner');
    const deleted = await datavaultDatabasesRepository.delete(id);
    if (!deleted) {
      throw new Error('Failed to delete database');
    }
  }

  /**
   * Get tables in a database
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getTablesInDatabase(databaseId: string, tenantId: string, userId?: string) {
    if (userId) {
      await this.verifyDatabaseAccess(databaseId, tenantId, userId, 'view');
    } else {
      const exists = await datavaultDatabasesRepository.existsForTenant(databaseId, tenantId);
      if (!exists) {
        throw new NotFoundError('Database not found or unauthorized');
      }
    }

    return datavaultDatabasesRepository.getTablesInDatabase(databaseId);
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
    targetOwnerUuid: string
  ) {
    const { transferService } = await import('./TransferService');

    // Get database
    const database = await datavaultDatabasesRepository.findById(databaseId);
    if (!database) {
      throw new NotFoundError('Database not found');
    }

    const hasOwnerAccess = await datavaultAclService.hasDatabaseRole(userId, databaseId, 'owner');
    if (!hasOwnerAccess) {
      throw new Error('Access denied: You do not have permission to transfer this database');
    }

    if (targetOwnerType === 'org' && !(await canManageOrg(userId, targetOwnerUuid))) {
      throw new Error('Access denied: Organization admin role required to transfer databases to this organization');
    }

    // Validate transfer permissions
    await transferService.validateTransfer(
      userId,
      database.ownerType ?? 'user',
      database.ownerUuid ?? userId,
      targetOwnerType,
      targetOwnerUuid
    );

    const updated = await datavaultDatabasesRepository.update(databaseId, {
      ownerType: targetOwnerType,
      ownerUuid: targetOwnerUuid,
    });
    if (!updated) {
      throw new Error('Failed to transfer database ownership');
    }
    await datavaultTablesRepository.updateOwnerByDatabaseId(databaseId, targetOwnerType, targetOwnerUuid);
    return updated;
  }

  async getDatabaseAccess(databaseId: string, tenantId: string, userId: string): Promise<{
    entries: DatavaultDatabaseAccess[];
    currentUserRole: AccessRole;
  }> {
    await this.verifyDatabaseAccess(databaseId, tenantId, userId, 'view');
    const [entries, currentUserRole] = await Promise.all([
      datavaultDatabaseAccessRepository.findByDatabaseId(databaseId),
      datavaultAclService.resolveRoleForDatabase(userId, databaseId),
    ]);
    return { entries, currentUserRole };
  }

  async grantDatabaseAccess(
    databaseId: string,
    tenantId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: AccessRole }>
  ): Promise<DatavaultDatabaseAccess[]> {
    await this.verifyDatabaseAccess(databaseId, tenantId, requestorId, 'owner');
    const results: DatavaultDatabaseAccess[] = [];
    for (const entry of entries) {
      const acl = await datavaultDatabaseAccessRepository.upsert(
        databaseId,
        entry.principalType,
        entry.principalId,
        entry.role
      );
      results.push(acl);
    }
    return results;
  }

  async revokeDatabaseAccess(
    databaseId: string,
    tenantId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>
  ): Promise<void> {
    await this.verifyDatabaseAccess(databaseId, tenantId, requestorId, 'owner');
    await datavaultDatabaseAccessRepository.deleteManyByPrincipals(databaseId, entries);
  }
}

export const datavaultDatabasesService = new DatavaultDatabasesService();
