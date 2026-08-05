import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  runDocumentDeliveries,
  type InsertRunDocumentDelivery,
  type RunDocumentDelivery,
} from '@shared/schema';
import type { DeliveryAuditLogEntry } from '@shared/types/delivery';

import { db } from '../db';

import { BaseRepository, type DbTransaction } from './BaseRepository';

const MAX_ERROR_LENGTH = 4_000;

export interface ClaimDeliveryJobsOptions {
  limit?: number;
  now?: Date;
}

export interface MarkRetryOrFailedOptions {
  error: string;
  auditEntry: DeliveryAuditLogEntry;
  nextAttemptAt?: Date | null;
  isFinalFailure?: boolean;
}

export class RunDocumentDeliveryRepository extends BaseRepository<
  typeof runDocumentDeliveries,
  RunDocumentDelivery,
  InsertRunDocumentDelivery
> {
  constructor(dbInstance?: typeof db) {
    super(runDocumentDeliveries, dbInstance);
  }

  /**
   * Create a single delivery job record
   */
  async createDelivery(
    input: InsertRunDocumentDelivery,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery> {
    const database = this.getDb(tx);
    const [created] = await database
      .insert(runDocumentDeliveries)
      .values(input)
      .returning();
    if (created === undefined) {
      throw new Error('Failed to create run document delivery');
    }
    return created;
  }

  /**
   * Batch create delivery job records
   */
  async createDeliveries(
    inputs: InsertRunDocumentDelivery[],
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery[]> {
    if (inputs.length === 0) {
      return [];
    }
    const database = this.getDb(tx);
    return database
      .insert(runDocumentDeliveries)
      .values(inputs)
      .returning();
  }

  /**
   * Find all delivery jobs for a specific workflow run
   */
  async findByRunId(
    runId: string,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(runDocumentDeliveries)
      .where(eq(runDocumentDeliveries.runId, runId))
      .orderBy(asc(runDocumentDeliveries.createdAt));
  }

  async findByRunIdAndTenantId(
    runId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(runDocumentDeliveries)
      .where(and(
        eq(runDocumentDeliveries.runId, runId),
        eq(runDocumentDeliveries.tenantId, tenantId)
      ))
      .orderBy(asc(runDocumentDeliveries.createdAt));
  }

  /**
   * Find a delivery job by ID and tenant ID (ensures tenant isolation)
   */
  async findByIdAndTenantId(
    id: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery | null> {
    const database = this.getDb(tx);
    const [delivery] = await database
      .select()
      .from(runDocumentDeliveries)
      .where(
        and(
          eq(runDocumentDeliveries.id, id),
          eq(runDocumentDeliveries.tenantId, tenantId)
        )
      )
      .limit(1);
    return delivery ?? null;
  }

  /**
   * Atomically claim a batch of pending/retry delivery jobs ready for processing,
   * as well as stuck processing jobs older than 5 minutes.
   * Uses FOR UPDATE SKIP LOCKED to support parallel workers without contention.
   */
  async claimBatch(options: ClaimDeliveryJobsOptions = {}): Promise<RunDocumentDelivery[]> {
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
    const staleProcessingThreshold = new Date(now.getTime() - 5 * 60 * 1000);

    return this.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: runDocumentDeliveries.id })
        .from(runDocumentDeliveries)
        .where(
          or(
            and(
              lte(runDocumentDeliveries.nextAttemptAt, now),
              inArray(runDocumentDeliveries.status, ['pending', 'retry'])
            ),
            and(
              eq(runDocumentDeliveries.status, 'processing'),
              or(
                lte(runDocumentDeliveries.lastAttemptAt, staleProcessingThreshold),
                and(
                  isNull(runDocumentDeliveries.lastAttemptAt),
                  lte(runDocumentDeliveries.updatedAt, staleProcessingThreshold)
                )
              )
            )
          )
        )
        .orderBy(asc(runDocumentDeliveries.nextAttemptAt), asc(runDocumentDeliveries.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });

      if (candidates.length === 0) {
        return [];
      }

      const ids = candidates.map((c) => c.id);
      return tx
        .update(runDocumentDeliveries)
        .set({
          status: 'processing',
          lastAttemptAt: now,
          updatedAt: now,
        })
        .where(inArray(runDocumentDeliveries.id, ids))
        .returning();
    });
  }

  /**
   * Mark a delivery job as successfully delivered and append to audit log
   */
  async markDelivered(
    id: string,
    auditEntry: DeliveryAuditLogEntry,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery> {
    const database = this.getDb(tx);
    const now = new Date();

    const [updated] = await database
      .update(runDocumentDeliveries)
      .set({
        status: 'delivered',
        attempts: sql`${runDocumentDeliveries.attempts} + 1`,
        deliveredAt: now,
        lastError: null,
        auditLog: sql`${runDocumentDeliveries.auditLog} || ${JSON.stringify([auditEntry])}::jsonb`,
        updatedAt: now,
      })
      .where(eq(runDocumentDeliveries.id, id))
      .returning();

    if (updated === undefined) {
      throw new Error(`Run document delivery not found: ${id}`);
    }
    return updated;
  }

  /**
   * Mark a delivery job as failed or scheduled for retry with exponential backoff
   */
  async markRetryOrFailed(
    id: string,
    options: MarkRetryOrFailedOptions,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery> {
    const database = this.getDb(tx);
    const now = new Date();
    const truncatedError = options.error.slice(0, MAX_ERROR_LENGTH);
    const isFinal = options.isFinalFailure === true;

    const [updated] = await database
      .update(runDocumentDeliveries)
      .set({
        status: isFinal ? 'failed' : 'retry',
        attempts: sql`${runDocumentDeliveries.attempts} + 1`,
        nextAttemptAt: options.nextAttemptAt ?? now,
        lastError: truncatedError,
        auditLog: sql`${runDocumentDeliveries.auditLog} || ${JSON.stringify([options.auditEntry])}::jsonb`,
        updatedAt: now,
      })
      .where(eq(runDocumentDeliveries.id, id))
      .returning();

    if (updated === undefined) {
      throw new Error(`Run document delivery not found: ${id}`);
    }
    return updated;
  }

  /**
   * Reset a failed delivery job for manual re-try
   */
  async resetForRetry(
    id: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<RunDocumentDelivery | null> {
    const database = this.getDb(tx);
    const now = new Date();

    const [updated] = await database
      .update(runDocumentDeliveries)
      .set({
        status: 'pending',
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(runDocumentDeliveries.id, id),
          eq(runDocumentDeliveries.tenantId, tenantId),
          eq(runDocumentDeliveries.status, 'failed')
        )
      )
      .returning();

    return updated ?? null;
  }
}

export const runDocumentDeliveryRepository = new RunDocumentDeliveryRepository();
