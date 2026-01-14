import type { InsertDatavaultDatabase, DatavaultDatabase } from "@shared/schema";

import { datavaultDatabasesRepository } from "../repositories/DatavaultDatabasesRepository";

import type { DbTransaction } from "../repositories/BaseRepository";

/**
 * Service for managing DataSources (Databases) and their connections to Workflows.
 */
export class DataSourceService {
    private repo: typeof datavaultDatabasesRepository;

    constructor(repo?: typeof datavaultDatabasesRepository) {
        this.repo = repo || datavaultDatabasesRepository;
    }

    /**
     * List data sources for a tenant
     */
    async listDataSources(tenantId: string): Promise<DatavaultDatabase[]> {
        return this.repo.findByTenantId(tenantId);
    }

    /**
     * Get data source by ID
     */
    async getDataSource(id: string, tenantId: string): Promise<DatavaultDatabase | null> {
        const dataSource = await this.repo.findById(id);
        if (!dataSource || dataSource.tenantId !== tenantId) {
            return null;
        }
        return dataSource;
    }

    /**
     * Create a new data source
     * Handles mapping of 'native_table' virtual type to 'native' DB type
     */
    async createDataSource(data: InsertDatavaultDatabase | { type: string;[key: string]: any }): Promise<DatavaultDatabase> {
        if (data.type === 'native_table') {
            // Map native_table to native, preserving the config (which contains tableId)
            // We can also add a flag to config to explicitly mark it if needed
            const config = data.config || {};
            const dbData = {
                ...data,
                type: 'native' as const, // Cast to satisfy DB enum
                config: {
                    ...config,
                    isNativeTable: true
                }
            };
            return this.repo.create(dbData as InsertDatavaultDatabase);
        }
        return this.repo.create(data as InsertDatavaultDatabase);
    }

    /**
     * Update a data source
     */
    async updateDataSource(
        id: string,
        tenantId: string,
        data: Partial<Omit<DatavaultDatabase, 'id' | 'createdAt'>>
    ): Promise<DatavaultDatabase> {
        const exists = await this.repo.existsForTenant(id, tenantId);
        if (!exists) {
            throw new Error(`DataSource ${id} not found or access denied`);
        }
        const updated = await this.repo.update(id, data);
        if (!updated) {
            throw new Error(`Failed to update DataSource ${id}`);
        }
        return updated;
    }

    /**
     * Delete a data source
     */
    async deleteDataSource(id: string, tenantId: string): Promise<boolean> {
        const exists = await this.repo.existsForTenant(id, tenantId);
        if (!exists) {
            throw new Error(`DataSource ${id} not found or access denied`);
        }
        return this.repo.delete(id);
    }

    /**
     * Find data sources linked to a workflow
     */
    async listDataSourcesForWorkflow(workflowId: string): Promise<DatavaultDatabase[]> {
        return this.repo.findByWorkflowId(workflowId);
    }

    /**
     * Link a data source to a workflow
     */
    async linkDataSourceToWorkflow(workflowId: string, dataSourceId: string, tenantId: string): Promise<void> {
        const exists = await this.repo.existsForTenant(dataSourceId, tenantId);
        if (!exists) {
            throw new Error(`DataSource ${dataSourceId} not found or access denied`);
        }
        // Verify workflow ownership if needed (assuming caller checks workflow access)
        await this.repo.linkToWorkflow(workflowId, dataSourceId);
    }

    /**
     * Unlink a data source from a workflow
     */
    async unlinkDataSourceFromWorkflow(workflowId: string, dataSourceId: string): Promise<void> {
        await this.repo.unlinkFromWorkflow(workflowId, dataSourceId);
    }

    /**
     * Get tables within a data source
     */
    async listTables(dataSourceId: string, tenantId: string) {
        const exists = await this.repo.existsForTenant(dataSourceId, tenantId);
        if (!exists) {
            throw new Error(`DataSource ${dataSourceId} not found or access denied`);
        }
        return this.repo.getTablesInDatabase(dataSourceId);
    }
}

export const dataSourceService = new DataSourceService();
