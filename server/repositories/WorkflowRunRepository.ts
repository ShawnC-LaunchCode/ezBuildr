import { eq, and, or, desc, inArray, count, sql } from "drizzle-orm";

import { workflowRuns, type WorkflowRun, type InsertWorkflowRun } from "@shared/schema";

import { db } from "../db";
import { hashToken } from "../utils/encryption";

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
    const predicate = HASH_SHAPE.test(token)
      ? eq(workflowRuns.shareToken, hashed)
      : or(eq(workflowRuns.shareToken, hashed), eq(workflowRuns.shareToken, token));
    const [run] = await database
      .select()
      .from(workflowRuns)
      .where(predicate)
      .limit(1);
    return run ?? null;
  }

  /**
   * Mark run as complete
   */
  async markComplete(runId: string, tx?: DbTransaction): Promise<WorkflowRun> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowRuns)
      .set({
        completed: true,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId))
      .returning();
    if (updated == null) {throw new Error("Failed to mark run as complete");}
    return updated;
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
