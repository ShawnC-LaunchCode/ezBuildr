import { eq, desc } from "drizzle-orm";

import { workflowQueries } from "@shared/schema";
import type { WorkflowQuery } from "@shared/types/query";

import { db } from "../db";


import { BaseRepository, type DbTransaction } from "./BaseRepository";

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
            .orderBy(desc(workflowQueries.updatedAt)) as any;
    }
}

// Singleton instance
export const workflowQueriesRepository = new WorkflowQueriesRepository();
