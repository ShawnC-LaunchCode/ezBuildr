import type { WorkflowQuery } from '@shared/types/query';
import { workflowQuerySchema } from '@shared/types/query';

import { queryRunner } from '../lib/queries/QueryRunner';
import { withTenant } from '../utils/rlsContext';
import {
    projectRepository,
    userRepository,
    workflowQueriesRepository,
    workflowRepository,
} from '../repositories';

const workflowQueryUpdateSchema = workflowQuerySchema.pick({
    name: true,
    filters: true,
    sort: true,
    limit: true,
}).partial();

export class QueryService {
    private readonly queryRepo: typeof workflowQueriesRepository;
    private readonly workflowRepo: typeof workflowRepository;
    private readonly projectRepo: typeof projectRepository;
    private readonly userRepo: typeof userRepository;

    constructor(
        queryRepo?: typeof workflowQueriesRepository,
        workflowRepo?: typeof workflowRepository,
        projectRepo?: typeof projectRepository,
        userRepo?: typeof userRepository,
    ) {
        this.queryRepo = queryRepo ?? workflowQueriesRepository;
        this.workflowRepo = workflowRepo ?? workflowRepository;
        this.projectRepo = projectRepo ?? projectRepository;
        this.userRepo = userRepo ?? userRepository;
    }

    private async resolveWorkflowTenantId(workflowId: string): Promise<string> {
        const workflow = await this.workflowRepo.findById(workflowId);
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.projectId) {
            const project = await this.projectRepo.findById(workflow.projectId);
            if (project?.tenantId) {
                return project.tenantId;
            }
        }

        if (workflow.creatorId) {
            const creator = await this.userRepo.findById(workflow.creatorId);
            if (creator?.tenantId) {
                return creator.tenantId;
            }
        }

        throw new Error('Workflow tenant not found');
    }

    private async verifyWorkflowTenant(workflowId: string, tenantId: string): Promise<void> {
        const workflowTenantId = await this.resolveWorkflowTenantId(workflowId);
        if (workflowTenantId !== tenantId) {
            throw new Error('Access denied - workflow belongs to different tenant');
        }
    }

    private async verifyQueryTenant(queryId: string, tenantId: string): Promise<WorkflowQuery> {
        const query = await this.queryRepo.findById(queryId);
        if (!query) {
            throw new Error('Query not found');
        }

        await this.verifyWorkflowTenant(query.workflowId, tenantId);
        return query;
    }

    /** Create a new query definition. */
    async createQuery(data: Omit<WorkflowQuery, 'id'>, tenantId: string): Promise<WorkflowQuery> {
        const validated = workflowQuerySchema.omit({ id: true }).parse(data);
        await this.verifyWorkflowTenant(validated.workflowId, tenantId);
        return this.queryRepo.create(validated);
    }

    async getQuery(id: string, tenantId: string): Promise<WorkflowQuery> {
        return this.verifyQueryTenant(id, tenantId);
    }

    async listQueriesForWorkflow(workflowId: string, tenantId: string): Promise<WorkflowQuery[]> {
        await this.verifyWorkflowTenant(workflowId, tenantId);
        return this.queryRepo.findByWorkflowId(workflowId);
    }

    async updateQuery(
        id: string,
        updates: Partial<WorkflowQuery>,
        tenantId: string,
    ): Promise<WorkflowQuery> {
        await this.verifyQueryTenant(id, tenantId);
        const validatedUpdates = workflowQueryUpdateSchema.parse(updates);
        return this.queryRepo.update(id, validatedUpdates);
    }

    async deleteQuery(id: string, tenantId: string): Promise<void> {
        await this.verifyQueryTenant(id, tenantId);
        await this.queryRepo.delete(id);
    }

    // =================================================================
    // UI Binding Helpers (Part 5)
    // =================================================================
    /**
     * Get options for a dropdown based on a query list
     * Used by frontend to preview available options
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async getListOptions(
        queryId: string,
        labelColumnId: string,
        valueColumnId: string,
        context: Record<string, unknown>,
        tenantId: string
    ) {
        const query = await this.getQuery(queryId, tenantId);
        // Execute query to get live list, in a tenant-scoped transaction —
        // the DataVault tables it reads are RLS-covered.
        const list = await withTenant(tenantId, (tx) =>
            queryRunner.executeQuery(query, context, tenantId, tx));
        // Map to options
        return list.rows.map((row: Record<string, unknown>) => ({
            label: row[labelColumnId] ?? row['_id'], // Fallback to ID
            value: row[valueColumnId] ?? row['_id']
        }));
    }
    /**
     * Validate that a specific value exists in a list
     * Used for backend validation of submissions
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async validateValueInList(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: any,
        queryId: string,
        valueColumnId: string,
        context: Record<string, unknown>,
        tenantId: string
    ) {
        const query = await this.getQuery(queryId, tenantId);
        const list = await withTenant(tenantId, (tx) =>
            queryRunner.executeQuery(query, context, tenantId, tx));
        return list.rows.some((row: Record<string, unknown>) => {
            const rowValue = row[valueColumnId];
            // Loose equality check for strings/numbers might be needed
            // eslint-disable-next-line eqeqeq
            return rowValue == value;
        });
    }
}

export const queryService = new QueryService();
