import { and, eq, sql } from 'drizzle-orm';

import { runSubmissions, type InsertRunSubmission, type RunSubmission } from '@shared/schema';

import type { db } from '../db';

import { BaseRepository, type DbTransaction } from './BaseRepository';

/**
 * CB-9a-2: the persistence half of one logical submission.
 *
 * `claim` is the whole mechanism. It is an INSERT racing against a unique
 * index, not a read-then-write: two concurrent requests carrying the same key
 * both attempt the insert, exactly one wins, and the loser is told to replay.
 * A check-then-insert would leave a window where both callers see "no row yet"
 * and both execute — which is the double-fire this ticket exists to close.
 */
export class RunSubmissionRepository extends BaseRepository<typeof runSubmissions, RunSubmission, InsertRunSubmission> {
  constructor(dbInstance?: typeof db) {
    super(runSubmissions, dbInstance);
  }

  /**
   * Try to own this submission. Returns the row on success, `undefined` when
   * another attempt already owns it — the caller then reads it and replays.
   */
  async claim(runId: string, submissionKey: string, pageId: string | null, tx?: DbTransaction): Promise<RunSubmission | undefined> {
    const [record] = await this.getDb(tx)
      .insert(runSubmissions)
      .values({ runId, submissionKey, pageId })
      .onConflictDoNothing({ target: [runSubmissions.runId, runSubmissions.submissionKey] })
      .returning();
    return record;
  }

  async find(runId: string, submissionKey: string, tx?: DbTransaction): Promise<RunSubmission | undefined> {
    const [record] = await this.getDb(tx).select().from(runSubmissions)
      .where(and(eq(runSubmissions.runId, runId), eq(runSubmissions.submissionKey, submissionKey)));
    return record;
  }

  /** Record the submit response so a retry of the same key replays it verbatim. */
  async recordResponse(id: string, status: 'succeeded' | 'failed', response: unknown, tx?: DbTransaction): Promise<void> {
    await this.getDb(tx).update(runSubmissions)
      .set({ status, response, completedAt: sql`now()` })
      .where(eq(runSubmissions.id, id));
  }

  /** Record the paired navigation result, so a retried `next` replays too. */
  async recordNavigation(id: string, navigation: unknown, tx?: DbTransaction): Promise<void> {
    await this.getDb(tx).update(runSubmissions)
      .set({ navigation })
      .where(eq(runSubmissions.id, id));
  }

  /**
   * Release a claim whose execution threw before recording anything. Without
   * this an unexpected server error would wedge that key permanently
   * `in_progress`, and the client's retry would be refused forever rather than
   * being allowed to try again.
   */
  async releaseClaim(id: string, tx?: DbTransaction): Promise<void> {
    await this.getDb(tx).delete(runSubmissions)
      .where(and(eq(runSubmissions.id, id), eq(runSubmissions.status, 'in_progress')));
  }
}

export const runSubmissionRepository = new RunSubmissionRepository();
