import { eq, and, or, desc, inArray, count, sql } from "drizzle-orm";

import { workflowRuns, type WorkflowRun, type InsertWorkflowRun } from "@shared/schema";

import { db } from "../db";
import { hashToken } from "../utils/encryption";
import { createError } from "../utils/errors";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/** A SHA-256 hex digest is exactly 64 lowercase hex chars. */
const HASH_SHAPE = /^[a-f0-9]{64}$/i;

/**
 * Repository for workflow run data access
 */
export class WorkflowRunRepository extends BaseRepository<
  typeof workflowRuns,
  WorkflowRun,
  InsertWorkflowRun
> {
  constructor(dbInstance?: typeof db) {
    super(workflowRuns, dbInstance);
  }

  /**
   * Find runs by workflow ID
   */
  async findByWorkflowId(
    workflowId: string,
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<WorkflowRun[]> {
    const database = this.getDb(tx);
    let query = database
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.createdAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }

  /**
   * Find runs by multiple workflow IDs
   */
  async findByWorkflowIds(
    workflowIds: string[],
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<WorkflowRun[]> {
    const database = this.getDb(tx);
    if (workflowIds.length === 0) {
      return [];
    }
    let query = database
      .select()
      .from(workflowRuns)
      .where(inArray(workflowRuns.workflowId, workflowIds))
      .orderBy(desc(workflowRuns.createdAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }

  /**
   * Count runs per workflow in one grouped query, keyed by workflow id.
   * Workflows with no runs are absent from the map, not zero-filled.
   */
  async countByWorkflowIds(
    workflowIds: string[],
    tx?: DbTransaction
  ): Promise<Map<string, number>> {
    if (workflowIds.length === 0) {
      return new Map();
    }
    const database = this.getDb(tx);
    const rows = await database
      .select({
        workflowId: workflowRuns.workflowId,
        runCount: count(workflowRuns.id),
      })
      .from(workflowRuns)
      .where(inArray(workflowRuns.workflowId, workflowIds))
      .groupBy(workflowRuns.workflowId);
    return new Map(rows.map((row) => [row.workflowId, Number(row.runCount)]));
  }

  /**
   * Find completed runs by workflow ID
   */
  async findCompletedByWorkflowId(
    workflowId: string,
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<WorkflowRun[]> {
    const database = this.getDb(tx);
    let query = database
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.completed, true)))
      .orderBy(desc(workflowRuns.completedAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }

  /**
   * Find run by token (for intake portal)
   *
   * Run tokens are stored hashed (SHA-256). We look up by the hash of the
   * supplied plaintext token. For rows created before hashing existed we also
   * match the raw value — but only when the supplied token is not itself a
   * 64-char hex string, so a leaked token *hash* cannot be replayed as a bearer
   * token. Legacy plaintext run tokens are UUIDs, never hash-shaped.
   */
  async findByToken(token: string, tx?: DbTransaction): Promise<WorkflowRun | null> {
    const database = this.getDb(tx);
    const hashed = hashToken(token);
    const predicate = HASH_SHAPE.test(token)
      ? eq(workflowRuns.runToken, hashed)
      : or(eq(workflowRuns.runToken, hashed), eq(workflowRuns.runToken, token));
    const [run] = await database
      .select()
      .from(workflowRuns)
      .where(predicate)
      .limit(1);
    return run ?? null;
  }

  /**
   * Revoke a run's bearer token by forcing it expired. Run tokens already carry an absolute
   * expiry (tokenExpiresAt) that runTokenAuth enforces; setting it into the past immediately
   * invalidates the token — the mechanism used to kill a leaked run link on demand.
   */
  async revokeToken(runId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(workflowRuns)
      .set({ tokenExpiresAt: new Date(Date.now() - 1000), updatedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
  }

  /**
   * Find run by share token (read-only link)
   *
   * Share tokens are stored hashed; see findByToken for the lookup rationale.
   */
  async findByShareToken(token: string, tx?: DbTransaction): Promise<WorkflowRun | null> {
    const database = this.getDb(tx);
    const hashed = hashToken(token);
    const [run] = await database
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.shareTokenHash, hashed))
      .limit(1);
    return run ?? null;
  }

  /**
   * Mark run as complete. Conditional on completed = false so that two
   * concurrent completions cannot both succeed (the loser gets
   * "Run is already completed" instead of re-triggering side effects).
   */
  async markComplete(runId: string, tx?: DbTransaction): Promise<WorkflowRun> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowRuns)
      .set({
        completed: true,
        completedAt: new Date(),
        progress: 100,
        updatedAt: new Date(),
      })
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.completed, false)))
      .returning();
    if (updated == null) {
      const existing = await this.findById(runId, tx);
      if (existing) {throw createError.runCompleted();}
      throw createError.notFound('Run', runId);
    }
    return updated;
  }

  /**
   * Rotate a portal-assigned run token only when the authenticated portal
   * email exactly matches the run assignment.
   */
  async rotatePortalToken(
    runId: string,
    clientEmail: string,
    runTokenHash: string,
    tokenExpiresAt: Date,
    tx?: DbTransaction
  ): Promise<WorkflowRun | null> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowRuns)
      .set({ runToken: runTokenHash, tokenExpiresAt, updatedAt: new Date() })
      .where(and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.clientEmail, clientEmail),
        eq(workflowRuns.accessMode, 'portal')
      ))
      .returning();
    return updated ?? null;
  }

  /**
   * Apply respondent-facing state transitions only while the run is mutable.
   * The conditional update serializes with markComplete at the row boundary.
   */
  async updateIfIncomplete(
    runId: string,
    updates: Partial<InsertWorkflowRun>,
    tx?: DbTransaction
  ): Promise<WorkflowRun> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowRuns)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.completed, false)))
      .returning();
    if (updated !== undefined) {return updated;}

    const existing = await this.findById(runId, tx);
    if (existing) {throw createError.runCompleted();}
    throw createError.notFound('Run', runId);
  }

  /**
   * Update the generation status of a run.
   *
   * generation_status is varchar(50); a long `failed:<reason>` must not make
   * the status write itself fail — that would strand the run in 'generating'.
   * The full reason is always in the server logs; the status only needs the
   * machine-readable prefix plus a hint.
   */
  async updateGenerationStatus(runId: string, status: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    const GENERATION_STATUS_MAX_LENGTH = 50;
    const bounded = status.length > GENERATION_STATUS_MAX_LENGTH
      ? status.slice(0, GENERATION_STATUS_MAX_LENGTH)
      : status;
    await database
      .update(workflowRuns)
      .set({ generationStatus: bounded, updatedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
  }

  /**
   * Atomically claim document generation for a run. Only pending/failed rows can
   * transition into generating, so two app instances cannot both render the same
   * document set after racing on a read.
   */
  async tryMarkGenerationStarted(runId: string, tx?: DbTransaction): Promise<boolean> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowRuns)
      .set({ generationStatus: 'generating', updatedAt: new Date() })
      .where(and(
        eq(workflowRuns.id, runId),
        or(
          sql`${workflowRuns.generationStatus} IS NULL`,
          eq(workflowRuns.generationStatus, 'pending'),
          sql`${workflowRuns.generationStatus} LIKE 'failed:%'`
        )
      ))
      .returning({ id: workflowRuns.id });
    return updated !== undefined;
  }

  /**
   * Find run by portal access key
   */
  async findByPortalAccessKey(key: string, tx?: DbTransaction): Promise<WorkflowRun | null> {
    const database = this.getDb(tx);
    const [run] = await database
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.portalAccessKey, key))
      .limit(1);
    return run ?? null;
  }
  /**
   * Get workflow run statistics (admin only)
   * Optimized to use a single query instead of fetching all runs
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getRunStats(tx?: DbTransaction) {
    const database = this.getDb(tx);
    const [stats] = await database
      .select({
        total: count(workflowRuns.id),
        completed: sql<number>`sum(case when ${workflowRuns.completed} = true then 1 else 0 end)`,
        inProgress: sql<number>`sum(case when ${workflowRuns.completed} = false then 1 else 0 end)`,
      })
      .from(workflowRuns);

    return {
      total: Number(stats?.total ?? 0),
      completed: Number(stats?.completed ?? 0),
      inProgress: Number(stats?.inProgress ?? 0),
    };
  }
}

// Singleton instance
export const workflowRunRepository = new WorkflowRunRepository();
