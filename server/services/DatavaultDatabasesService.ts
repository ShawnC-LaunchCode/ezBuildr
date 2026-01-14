import { NotFoundError, UnauthorizedError, BadRequestError } from '../middleware/errorHandler';
import { datavaultDatabasesRepository } from '../repositories/DatavaultDatabasesRepository';

import type { DatavaultDatabase, DatavaultScopeType } from '../../shared/schema';

interface CreateDatabaseInput {
  tenantId: string;
  name: string;
  description?: string;
  scopeType: DatavaultScopeType;
  scopeId?: string;
}

interface UpdateDatabaseInput {
  name?: string;
  description?: string;
  scopeType?: DatavaultScopeType;
  scopeId?: string;
}

export class DatavaultDatabasesService {

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
    scopeId?: string
  ): Promise<DatavaultDatabase[]> {
    return datavaultDatabasesRepository.findByScope(tenantId, scopeType, scopeId);
  }

  /**
   * Get database by ID
   */
  async getDatabaseById(id: string, tenantId: string) {
    const database = await datavaultDatabasesRepository.findByIdWithStats(id);

    if (!database) {
      throw new NotFoundError('Database not found');
    }

    if (database.tenantId !== tenantId) {
      throw new UnauthorizedError('Database belongs to different tenant');
    }

    return database;
  }

  /**
   * Create a new database
   */
  async createDatabase(input: CreateDatabaseInput & { ownerType?: 'user' | 'org'; ownerUuid?: string; creatorId?: string }): Promise<DatavaultDatabase> {
    // Validate scope
    this.validateScope(input.scopeType, input.scopeId);

    // Validate ownership if provided
    if (input.ownerType && input.ownerUuid && input.creatorId) {
      const { canCreateWithOwnership } = await import('../utils/ownershipAccess');
      const canCreate = await canCreateWithOwnership(input.creatorId, input.ownerType, input.ownerUuid);
      if (!canCreate) {
        throw new Error('Access denied: You do not have permission to create assets with this ownership');
      }
    }

    return datavaultDatabasesRepository.create({
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      ownerType: input.ownerType,
      ownerUuid: input.ownerUuid,
    });
  }

  /**
   * Update a database
   */
  async updateDatabase(
    id: string,
    tenantId: string,
    input: UpdateDatabaseInput
  ): Promise<DatavaultDatabase> {
    // Check ownership
    const exists = await datavaultDatabasesRepository.existsForTenant(id, tenantId);
    if (!exists) {
      throw new NotFoundError('Database not found or unauthorized');
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

  /**
   * Get tables in a database
   */
  async getTablesInDatabase(databaseId: string, tenantId: string) {
    // Verify ownership
    const exists = await datavaultDatabasesRepository.existsForTenant(databaseId, tenantId);
    if (!exists) {
      throw new NotFoundError('Database not found or unauthorized');
    }

    return datavaultDatabasesRepository.getTablesInDatabase(databaseId);
  }

  /**
   * Validate scope type and ID combination
   */
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
  async transferOwnership(
    databaseId: string,
    userId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ) {
    const { transferService } = await import('./TransferService');
    const { canAccessAsset } = await import('../utils/ownershipAccess');

    // Get database
    const database = await datavaultDatabasesRepository.findById(databaseId);
    if (!database) {
      throw new NotFoundError('Database not found');
    }

    // Verify user has access to database
    const hasAccess = await canAccessAsset(userId, database.ownerType, database.ownerUuid);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have permission to transfer this database');
    }

    // Validate transfer permissions
    await transferService.validateTransfer(
      userId,
      database.ownerType,
      database.ownerUuid,
      targetOwnerType,
      targetOwnerUuid
    );

    // Update database ownership
    // FIX #4: Tables inherit ownership from database (by design)
    // - datavault_tables has NO owner_type/owner_uuid columns
    // - Access control happens at database level via DatavaultDatabasesRepository.findByTenantAndUser()
    // - Table queries ALWAYS join to parent database to check ownership
    // - This is intentional: tables cannot have different ownership than their database
    // - If this changes in future, add owner columns to datavault_tables and cascade here

    return datavaultDatabasesRepository.update(databaseId, {
      ownerType: targetOwnerType,
      ownerUuid: targetOwnerUuid,
    });
  }
}

export const datavaultDatabasesService = new DatavaultDatabasesService();
