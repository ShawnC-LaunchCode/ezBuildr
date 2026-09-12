import type { InsertDatavaultDatabase, DatavaultDatabase, DatavaultTable } from "@shared/schema";

import { datavaultDatabasesRepository } from "../repositories/DatavaultDatabasesRepository";
import { withCurrentTenant } from "../utils/rlsContext";

import type { DbTransaction } from "../repositories";
/**
 * Service for managing DataSources (Databases) and their connections to Workflows.
 */
export class DataSourceService {
    private repo: typeof datavaultDatabasesRepository;
    constructor(repo?: typeof datavaultDatabasesRepository) {
        this.repo = repo ?? datavaultDatabasesRepository;
    }
    /**
     * Run `fn` inside a tenant-scoped transaction opened at this service
     * boundary (RLS-2e, ambient-only variant). Reuses a caller-supplied `tx`
     * rather than nesting.
     *
     * Every method here reads or writes `datavault_databases`, which is
     * RLS-covered — this whole service ran unscoped until 2026-08-21, so under
     * enforcement `createDataSource` was rejected outright and every list/get
     * returned nothing. It is reached only from `dataSource.routes`, which
     * mounts `hybridAuth` on the whole router, so the ambient tenant is always
     * populated.
     *
     * The GUC comes from the ambient context, NOT from the `tenantId` argument
     * these methods carry: that argument stays the `eq(tenantId, …)` predicate,
     * and two checks fed by one input would not be two checks (§2b).
     *
     * ⚠️ This service was invisible to `scripts/audit-rls-surface.ts` because
     * it reaches its repository through a field alias (`this.repo.create`),
     * not the `datavaultDatabasesRepository.create` spelling the scanner
     * matches. Found by attributing a runtime violation in the restricted run
     * instead. Worth remembering when reading that script's totals.
     */
    private async withTx<T>(
        tx: DbTransaction | undefined,
        fn: (tx: DbTransaction) => Promise<T>
    ): Promise<T> {
        if (tx) {
            return fn(tx);
        }
        return withCurrentTenant(fn);
    }
    /**
     * List data sources for a tenant
     */
    async listDataSources(tenantId: string, tx?: DbTransaction): Promise<DatavaultDatabase[]> {
        return this.withTx(tx, (scopedTx) => this.repo.findByTenantId(tenantId, scopedTx));
    }
    /**
     * Get data source by ID
     */
    async getDataSource(id: string, tenantId: string, tx?: DbTransaction): Promise<DatavaultDatabase | null> {
        return this.withTx(tx, async (scopedTx) => {
            const dataSource = await this.repo.findById(id, scopedTx);
            if (!dataSource || dataSource.tenantId !== tenantId) {
                return null;
            }
            return dataSource;
        });
    }
    /**
     * Create a new data source
     * Handles mapping of 'native_table' virtual type to 'native' DB type
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts flexible data source configuration
    async createDataSource(data: InsertDatavaultDatabase | { type: string;[key: string]: any }, tx?: DbTransaction): Promise<DatavaultDatabase> {
        return this.withTx(tx, (scopedTx) => {
            if (data.type === 'native_table') {
                const config = (data.config !== null && data.config !== undefined && typeof data.config === 'object')
                    ? data.config as Record<string, unknown>
                    : {};
                const dbData = {
                    ...data,
                    type: 'native' as const,
                    config: {
                        ...config,
                        isNativeTable: true
                    }
                };
                return this.repo.create(dbData as unknown as InsertDatavaultDatabase, scopedTx);
            }
            return this.repo.create(data as InsertDatavaultDatabase, scopedTx);
        });
    }
    /**
     * Update a data source
     */
    async updateDataSource(
        id: string,
        tenantId: string,
        data: Partial<Omit<DatavaultDatabase, 'id' | 'createdAt'>>,
        tx?: DbTransaction
    ): Promise<DatavaultDatabase> {
        return this.withTx(tx, async (scopedTx) => {
            const exists = await this.repo.existsForTenant(id, tenantId, scopedTx);
            if (!exists) {
                throw new Error(`DataSource ${id} not found or access denied`);
            }
            const updated = await this.repo.update(id, data, scopedTx);
            if (!updated) {
                throw new Error(`Failed to update DataSource ${id}`);
            }
            return updated;
        });
    }
    /**
     * Delete a data source
     */
    async deleteDataSource(id: string, tenantId: string, tx?: DbTransaction): Promise<boolean> {
        return this.withTx(tx, async (scopedTx) => {
            const exists = await this.repo.existsForTenant(id, tenantId, scopedTx);
            if (!exists) {
                throw new Error(`DataSource ${id} not found or access denied`);
            }
            return this.repo.delete(id, scopedTx);
        });
    }
    /**
     * Find data sources linked to a workflow
     */
    async listDataSourcesForWorkflow(workflowId: string, tx?: DbTransaction): Promise<DatavaultDatabase[]> {
        return this.withTx(tx, (scopedTx) => this.repo.findByWorkflowId(workflowId, scopedTx));
    }
    /**
     * Link a data source to a workflow
     */
    async linkDataSourceToWorkflow(workflowId: string, dataSourceId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
        await this.withTx(tx, async (scopedTx) => {
            const exists = await this.repo.existsForTenant(dataSourceId, tenantId, scopedTx);
            if (!exists) {
                throw new Error(`DataSource ${dataSourceId} not found or access denied`);
            }
            // Verify workflow ownership if needed (assuming caller checks workflow access)
            await this.repo.linkToWorkflow(workflowId, dataSourceId, scopedTx);
        });
    }
    /**
     * Unlink a data source from a workflow
     */
    async unlinkDataSourceFromWorkflow(workflowId: string, dataSourceId: string, tx?: DbTransaction): Promise<void> {
        await this.withTx(tx, (scopedTx) => this.repo.unlinkFromWorkflow(workflowId, dataSourceId, scopedTx));
    }
    /**
     * Get tables within a data source
     */
    async listTables(dataSourceId: string, tenantId: string, tx?: DbTransaction): Promise<DatavaultTable[]> {
        return this.withTx(tx, async (scopedTx) => {
            const exists = await this.repo.existsForTenant(dataSourceId, tenantId, scopedTx);
            if (!exists) {
                throw new Error(`DataSource ${dataSourceId} not found or access denied`);
            }
            return this.repo.getTablesInDatabase(dataSourceId, scopedTx);
        });
    }
}
export const dataSourceService = new DataSourceService();
