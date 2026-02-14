import { eq } from 'drizzle-orm';

import { workflowQueries } from '@shared/schema';
import type { WorkflowQuery } from '@shared/types/query';
import { workflowQuerySchema } from '@shared/types/query';

import { db } from '../db';
import { queryRunner } from '../lib/queries/QueryRunner';
export class QueryService {
    /**
     * Create a new query definition
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async createQuery(data: Omit<WorkflowQuery, 'id'>, _tenantId: string) {
        // Validate schema
        const validated = workflowQuerySchema.omit({ id: true }).parse(data);
        // Insert
        const [query] = await db.insert(workflowQueries).values(validated).returning();
        return query;
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async getQuery(id: string) {
        const data = await db.query.workflowQueries.findFirst({
            where: eq(workflowQueries.id, id)
        });
        return data as WorkflowQuery | undefined;
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async listQueriesForWorkflow(workflowId: string) {
        return db.query.workflowQueries.findMany({
            where: eq(workflowQueries.workflowId, workflowId)
        });
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async updateQuery(id: string, updates: Partial<WorkflowQuery>) {
        const [updated] = await db.update(workflowQueries)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(workflowQueries.id, id))
            .returning();
        return updated;
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async getListOptions(
        queryId: string,
        labelColumnId: string,
        valueColumnId: string,
        context: Record<string, unknown>,
        tenantId: string
    ) {
        const query = await this.getQuery(queryId);
        if (!query) { throw new Error('Query not found'); }
        // Execute query to get live list
        const list = await queryRunner.executeQuery(query, context, tenantId);
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
        const query = await this.getQuery(queryId);
        if (!query) { throw new Error('Query not found'); }
        const list = await queryRunner.executeQuery(query, context, tenantId);
        return list.rows.some((row: Record<string, unknown>) => {
            const rowValue = row[valueColumnId];
            // Loose equality check for strings/numbers might be needed
            // eslint-disable-next-line eqeqeq
            return rowValue == value;
        });
    }
}
export const queryService = new QueryService();