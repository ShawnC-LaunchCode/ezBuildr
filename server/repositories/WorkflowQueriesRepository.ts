import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { workflowQueries } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import type { WorkflowQuery } from "@shared/types/query";
import type { InferInsertModel } from "drizzle-orm";

type InsertWorkflowQuery = InferInsertModel<typeof workflowQueries>;

/**
 * Repository for workflow queries
 */
export class WorkflowQueriesRepository extends BaseRepository<typeof workflowQueries, WorkflowQuery, InsertWorkflowQuery> {
    constructor(dbInstance?: typeof db) {
        super(workflowQueries, dbInstance);
    }

    /**
     * Find queries by workflow ID
     */
    async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<WorkflowQuery[]> {
        const database = this.getDb(tx);
        return await database
            .select()
            .from(workflowQueries)
            .where(eq(workflowQueries.workflowId, workflowId))
            .orderBy(desc(workflowQueries.updatedAt));
    }
}

// Singleton instance
export const workflowQueriesRepository = new WorkflowQueriesRepository();
