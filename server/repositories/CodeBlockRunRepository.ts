import { and, eq, sql } from 'drizzle-orm';

import { codeBlockRuns, workflowRuns, workflows, type CodeBlockRun, type InsertCodeBlockRun, type WorkflowRun } from '@shared/schema';

import type { db } from '../db';

import { BaseRepository, type DbTransaction } from './BaseRepository';

export class CodeBlockRunRepository extends BaseRepository<typeof codeBlockRuns, CodeBlockRun, InsertCodeBlockRun> {
  constructor(dbInstance?: typeof db) {
    super(codeBlockRuns, dbInstance);
  }

  async findRunOwnership(runId: string, tx?: DbTransaction): Promise<{ run: WorkflowRun; tenantId: string | null } | undefined> {
    const [record] = await this.getDb(tx).select({
      run: workflowRuns,
      tenantId: sql<string | null>`app_owner_tenant(${workflows.ownerType}, ${workflows.ownerUuid}, ${workflows.ownerId}, ${workflows.creatorId}, ${workflows.projectId})`,
    }).from(workflowRuns).innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
      .where(eq(workflowRuns.id, runId));
    return record;
  }

  async findByRunAndStep(runId: string, stepId: string, tx?: DbTransaction): Promise<CodeBlockRun | undefined> {
    const [record] = await this.getDb(tx).select().from(codeBlockRuns)
      .where(and(eq(codeBlockRuns.runId, runId), eq(codeBlockRuns.stepId, stepId)));
    return record;
  }

  async upsert(data: InsertCodeBlockRun, tx?: DbTransaction): Promise<CodeBlockRun> {
    const { runId, stepId, ...state } = data;
    const [record] = await this.getDb(tx).insert(codeBlockRuns).values({ ...state, runId, stepId })
      .onConflictDoUpdate({
        target: [codeBlockRuns.runId, codeBlockRuns.stepId],
        set: { ...state, updatedAt: new Date() },
      }).returning();
    return record;
  }
}

export const codeBlockRunRepository = new CodeBlockRunRepository();
