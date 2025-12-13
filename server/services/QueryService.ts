import { db } from '../db';
import { workflowQueries, datavaultColumns } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { WorkflowQuery } from '@shared/types/query';
import { workflowQuerySchema } from '@shared/types/query';
import { queryRunner } from '../lib/queries/QueryRunner';

export class QueryService {
    /**
     * Create a new query definition
     */
    async createQuery(data: Omit<WorkflowQuery, 'id'>, tenantId: string) {
        // Validate schema
        const validated = workflowQuerySchema.omit({ id: true }).parse(data);

        // Insert
        const [query] = await db.insert(workflowQueries).values(validated).returning();
        return query;
    }

    async getQuery(id: string) {
        const data = await db.query.workflowQueries.findFirst({
            where: eq(workflowQueries.id, id)
        });
        return data as WorkflowQuery | undefined;
    }

    async listQueriesForWorkflow(workflowId: string) {
        return await db.query.workflowQueries.findMany({
            where: eq(workflowQueries.workflowId, workflowId)
        });
    }

    async updateQuery(id: string, updates: Partial<WorkflowQuery>) {
        const [updated] = await db.update(workflowQueries)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(workflowQueries.id, id))
            .returning();
        return updated;
    }

    async deleteQuery(id: string) {
        await db.delete(workflowQueries).where(eq(workflowQueries.id, id));
    }

    // =================================================================
    // UI Binding Helpers (Part 5)
    // =================================================================

    /**
     * Get options for a dropdown based on a query list
     * Used by frontend to preview available options
     */
    async getListOptions(
        queryId: string,
        labelColumnId: string,
        valueColumnId: string,
        context: Record<string, any>,
        tenantId: string
    ) {
        const query = await this.getQuery(queryId);
        if (!query) throw new Error('Query not found');

        // Execute query to get live list
        const list = await queryRunner.executeQuery(query, context, tenantId);

        // Map to options
        return list.rows.map(row => ({
            label: row[labelColumnId] ?? row['_id'], // Fallback to ID
            value: row[valueColumnId] ?? row['_id']
        }));
    }

    /**
     * Validate that a specific value exists in a list
     * Used for backend validation of submissions
     */
    async validateValueInList(
        value: any,
        queryId: string,
        valueColumnId: string,
        context: Record<string, any>,
        tenantId: string
    ) {
        const query = await this.getQuery(queryId);
        if (!query) throw new Error('Query not found');

        const list = await queryRunner.executeQuery(query, context, tenantId);

        return list.rows.some(row => {
            const rowValue = row[valueColumnId];
            // Loose equality check for strings/numbers might be needed
            return rowValue == value;
        });
    }
}

export const queryService = new QueryService();
