import { and, asc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';

import {
  runCompletionJobs,
  type InsertRunCompletionJob,
  type RunCompletionJob,
  type RunCompletionJobKind,
} from '@shared/schema';

import { db } from '../db';

import { BaseRepository, type DbTransaction } from './BaseRepository';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const MAX_ERROR_LENGTH = 4_000;

export interface EnqueueRunCompletionJobInput {
  runId: string;
  kind: RunCompletionJobKind;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface ClaimRunCompletionJobsOptions {
  leaseOwner: string;
  limit?: number;
  leaseMs?: number;
  now?: Date;
}

export interface RetryRunCompletionJobOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: Date;
}

/** Data access for the durable post-completion outbox. */
export class RunCompletionJobRepository extends BaseRepository<
  typeof runCompletionJobs,
  RunCompletionJob,
  InsertRunCompletionJob
> {
  constructor(dbInstance?: typeof db) {
    super(runCompletionJobs, dbInstance);
  }

  /**
   * Enqueue once per run/kind. The caller's completion transaction is required
   * so marking a run complete and creating its work cannot commit separately.
   */
  async enqueue(
    input: EnqueueRunCompletionJobInput,
    tx: DbTransaction
  ): Promise<RunCompletionJob> {
    const [created] = await tx
      .insert(runCompletionJobs)
      .values({
        runId: input.runId,
        kind: input.kind,
        payload: input.payload ?? {},
        maxAttempts: Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
        availableAt: input.availableAt ?? new Date(),
      })
      .onConflictDoNothing({
        target: [runCompletionJobs.runId, runCompletionJobs.kind],
      })
      .returning();

    if (created !== undefined) { return created; }

    const existing = await this.findByRunAndKind(input.runId, input.kind, tx);
    if (existing === undefined) {
      throw new Error('Run completion job enqueue conflict could not be resolved');
    }
    return existing;
  }

  async findByRunAndKind(
    runId: string,
    kind: RunCompletionJobKind,
    tx?: DbTransaction
  ): Promise<RunCompletionJob | undefined> {
    const database = this.getDb(tx);
    const [job] = await database
      .select()
      .from(runCompletionJobs)
      .where(and(eq(runCompletionJobs.runId, runId), eq(runCompletionJobs.kind, kind)))
      .limit(1);
    return job;
  }

  /**
   * Claim a batch atomically. SKIP LOCKED lets multiple workers claim in
   * parallel without waiting on or receiving the same rows.
   */
  async claimBatch(options: ClaimRunCompletionJobsOptions): Promise<RunCompletionJob[]> {
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
    const leaseMs = Math.max(1_000, options.leaseMs ?? DEFAULT_LEASE_MS);
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);

    return this.transaction(async (tx) => {
      // A worker that dies during its final allowed attempt must not leave a
      // permanently processing row. Terminalize it before selecting new work.
      await tx
        .update(runCompletionJobs)
        .set({
          status: 'dead_letter',
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
          updatedAt: now,
          lastError: sql`COALESCE(${runCompletionJobs.lastError}, 'Lease expired after final attempt')`,
        })
        .where(and(
          eq(runCompletionJobs.status, 'processing'),
          lte(runCompletionJobs.leaseExpiresAt, now),
          sql`${runCompletionJobs.attempts} >= ${runCompletionJobs.maxAttempts}`
        ));

      const candidates = await tx
        .select({ id: runCompletionJobs.id })
        .from(runCompletionJobs)
        .where(and(
          lte(runCompletionJobs.availableAt, now),
          sql`${runCompletionJobs.attempts} < ${runCompletionJobs.maxAttempts}`,
          or(
            inArray(runCompletionJobs.status, ['pending', 'retry']),
            and(
              eq(runCompletionJobs.status, 'processing'),
              lte(runCompletionJobs.leaseExpiresAt, now)
            )
          )
        ))
        .orderBy(asc(runCompletionJobs.availableAt), asc(runCompletionJobs.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });

      if (candidates.length === 0) { return []; }

      return tx
        .update(runCompletionJobs)
        .set({
          status: 'processing',
          attempts: sql`${runCompletionJobs.attempts} + 1`,
          leaseOwner: options.leaseOwner,
          leaseExpiresAt,
          updatedAt: now,
          completedAt: null,
        })
        .where(inArray(runCompletionJobs.id, candidates.map(({ id }) => id)))
        .returning();
    });
  }

  /** Extend a live claim; returns undefined when ownership has changed. */
  async extendLease(
    jobId: string,
    leaseOwner: string,
    leaseMs = DEFAULT_LEASE_MS,
    tx?: DbTransaction
  ): Promise<RunCompletionJob | undefined> {
    const now = new Date();
    const database = this.getDb(tx);
    const [updated] = await database
      .update(runCompletionJobs)
      .set({
        leaseExpiresAt: new Date(now.getTime() + Math.max(1_000, leaseMs)),
        updatedAt: now,
      })
      .where(and(
        eq(runCompletionJobs.id, jobId),
        eq(runCompletionJobs.status, 'processing'),
        eq(runCompletionJobs.leaseOwner, leaseOwner),
        or(
          sql`${runCompletionJobs.leaseExpiresAt} IS NULL`,
          gt(runCompletionJobs.leaseExpiresAt, now)
        )
      ))
      .returning();
    return updated;
  }

  /** Mark a claimed job successful, fenced by the worker's lease owner. */
  async markSucceeded(
    jobId: string,
    leaseOwner: string,
    tx?: DbTransaction
  ): Promise<RunCompletionJob | undefined> {
    const now = new Date();
    const database = this.getDb(tx);
    const [updated] = await database
      .update(runCompletionJobs)
      .set({
        status: 'succeeded',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(runCompletionJobs.id, jobId),
        eq(runCompletionJobs.status, 'processing'),
        eq(runCompletionJobs.leaseOwner, leaseOwner)
      ))
      .returning();
    return updated;
  }

  /**
   * Release a failed claim for exponential-backoff retry, or dead-letter it
   * when the claim consumed the final allowed attempt.
   */
  async markRetryOrDeadLetter(
    jobId: string,
    leaseOwner: string,
    error: unknown,
    options: RetryRunCompletionJobOptions = {},
    tx?: DbTransaction
  ): Promise<RunCompletionJob | undefined> {
    const now = options.now ?? new Date();
    const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? MAX_RETRY_DELAY_MS);
    const boundedError = this.boundError(error);
    const database = this.getDb(tx);
    const [updated] = await database
      .update(runCompletionJobs)
      .set({
        status: sql`CASE WHEN ${runCompletionJobs.attempts} >= ${runCompletionJobs.maxAttempts} THEN 'dead_letter' ELSE 'retry' END`,
        // ${now} must be cast to timestamptz: as an untyped bind param, Postgres
        // resolves `${now} + <interval>` via `interval + interval` and infers the
        // whole CASE as interval, which the timestamptz column rejects.
        availableAt: sql`CASE
          WHEN ${runCompletionJobs.attempts} >= ${runCompletionJobs.maxAttempts} THEN ${now}::timestamptz
          ELSE ${now}::timestamptz + LEAST(
            ${maxDelayMs},
            ${baseDelayMs} * POWER(2, GREATEST(${runCompletionJobs.attempts} - 1, 0))
          ) * INTERVAL '1 millisecond'
        END`,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: boundedError,
        completedAt: sql`CASE WHEN ${runCompletionJobs.attempts} >= ${runCompletionJobs.maxAttempts} THEN ${now}::timestamptz ELSE NULL END`,
        updatedAt: now,
      })
      .where(and(
        eq(runCompletionJobs.id, jobId),
        eq(runCompletionJobs.status, 'processing'),
        eq(runCompletionJobs.leaseOwner, leaseOwner)
      ))
      .returning();
    return updated;
  }

  private boundError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, MAX_ERROR_LENGTH);
  }
}

export const runCompletionJobRepository = new RunCompletionJobRepository();
