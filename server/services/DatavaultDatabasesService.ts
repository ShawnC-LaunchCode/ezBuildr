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
   * Get all databases for a tenant
   */
  async getDatabasesForTenant(tenantId: string): Promise<DatavaultDatabase[]> {
    return datavaultDatabasesRepository.findByTenantId(tenantId);
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
      throw new Error('Database not found');
    }

    if (database.tenantId !== tenantId) {
      throw new Error('Unauthorized: Database belongs to different tenant');
    }

    return database;
  }

  /**
   * Create a new database
   */
  async createDatabase(input: CreateDatabaseInput): Promise<DatavaultDatabase> {
    // Validate scope
    this.validateScope(input.scopeType, input.scopeId);

    return datavaultDatabasesRepository.create({
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
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
      throw new Error('Database not found or unauthorized');
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
      throw new Error('Database not found or unauthorized');
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
      throw new Error('Database not found or unauthorized');
    }

    return datavaultDatabasesRepository.getTablesInDatabase(databaseId);
  }

  /**
   * Validate scope type and ID combination
   */
  private validateScope(scopeType: DatavaultScopeType, scopeId?: string) {
    if (scopeType === 'account' && scopeId) {
      throw new Error('Account scope should not have a scope ID');
    }

    if ((scopeType === 'project' || scopeType === 'workflow') && !scopeId) {
      throw new Error(`${scopeType} scope requires a scope ID`);
    }
  }
}

export const datavaultDatabasesService = new DatavaultDatabasesService();
