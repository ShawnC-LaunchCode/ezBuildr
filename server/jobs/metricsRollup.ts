/**
 * Metrics Rollup Job
 *
 * Aggregates raw metrics events into time-bucketed rollups for faster analytics queries.
 * Runs periodically to compute metrics for 1m, 5m, 1h, and 1d buckets.
 */

import { db } from '../db';
import {
  metricsEvents,
  metricsRollups,
  type InsertMetricsRollup,
} from '../../shared/schema';
import { sql, and, gte, lt, eq, or, isNull } from 'drizzle-orm';
import logger from '../logger';
import sli from '../services/sli';

export type BucketSize = '1m' | '5m' | '1h' | '1d';

interface RollupParams {
  bucketSize: BucketSize;
  since?: Date;
  until?: Date;
}

/**
 * Run metrics rollup for all buckets
 */
export async function runRollup(params?: {
  bucketSize?: BucketSize;
  since?: Date;
  until?: Date;
}): Promise<void> {
  const buckets: BucketSize[] = params?.bucketSize ? [params.bucketSize] : ['1m', '5m', '1h', '1d'];

  for (const bucket of buckets) {
    try {
      await rollupBucket({
        bucketSize: bucket,
        since: params?.since,
        until: params?.until,
      });
    } catch (error) {
      logger.error({ err: error, bucket }, 'Rollup failed for bucket');
    }
  }

  logger.info('Metrics rollup completed', { buckets });
}

/**
 * Rollup a specific bucket size
 */
async function rollupBucket(params: RollupParams): Promise<void> {
  const bucketMs = getBucketMilliseconds(params.bucketSize);
  const now = new Date();

  // Default to last 2 buckets if not specified
  const until = params.until || now;
  const since = params.since || new Date(now.getTime() - bucketMs * 2);

  // Get bucket boundaries
  const buckets = getBucketBoundaries(since, until, bucketMs);

  logger.debug('Rolling up metrics', {
    bucketSize: params.bucketSize,
    bucketCount: buckets.length,
    since,
    until,
  });

  for (const bucket of buckets) {
    await rollupSingleBucket({
      bucketSize: params.bucketSize,
      bucketStart: bucket.start,
      bucketEnd: bucket.end,
    });
  }
}

/**
 * Rollup a single time bucket
 */
async function rollupSingleBucket(params: {
  bucketSize: BucketSize;
  bucketStart: Date;
  bucketEnd: Date;
}): Promise<void> {
  // Query all events in this bucket, grouped by tenant/project/workflow
  const query = sql`
    SELECT
      tenant_id,
      project_id,
      workflow_id,
      COUNT(*) FILTER (WHERE type = 'run_started') as runs_count,
      COUNT(*) FILTER (WHERE type = 'run_succeeded') as runs_success,
      COUNT(*) FILTER (WHERE type = 'run_failed') as runs_error,
      PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE type IN ('run_succeeded', 'run_failed') AND duration_ms IS NOT NULL) as dur_p50,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE type IN ('run_succeeded', 'run_failed') AND duration_ms IS NOT NULL) as dur_p95,
      COUNT(*) FILTER (WHERE type = 'pdf_succeeded') as pdf_success,
      COUNT(*) FILTER (WHERE type = 'pdf_failed') as pdf_error,
      COUNT(*) FILTER (WHERE type = 'docx_succeeded') as docx_success,
      COUNT(*) FILTER (WHERE type = 'docx_failed') as docx_error,
      COUNT(*) FILTER (WHERE type = 'queue_enqueued') as queue_enqueued,
      COUNT(*) FILTER (WHERE type = 'queue_dequeued') as queue_dequeued
    FROM metrics_events
    WHERE ts >= ${params.bucketStart} AND ts < ${params.bucketEnd}
    GROUP BY tenant_id, project_id, workflow_id
  `;

  const results = await db.execute(query);

  // Upsert rollups for each group
  for (const row of results.rows as any[]) {
    const rollupData: InsertMetricsRollup = {
      tenantId: row.tenant_id,
      projectId: row.project_id,
      workflowId: row.workflow_id,
      bucketStart: params.bucketStart,
      bucket: params.bucketSize,
      runsCount: parseInt(row.runs_count) || 0,
      runsSuccess: parseInt(row.runs_success) || 0,
      runsError: parseInt(row.runs_error) || 0,
      durP50: row.dur_p50 ? Math.round(parseFloat(row.dur_p50)) : null,
      durP95: row.dur_p95 ? Math.round(parseFloat(row.dur_p95)) : null,
      pdfSuccess: parseInt(row.pdf_success) || 0,
      pdfError: parseInt(row.pdf_error) || 0,
      docxSuccess: parseInt(row.docx_success) || 0,
      docxError: parseInt(row.docx_error) || 0,
      queueEnqueued: parseInt(row.queue_enqueued) || 0,
      queueDequeued: parseInt(row.queue_dequeued) || 0,
    };

    // Upsert rollup
    await db
      .insert(metricsRollups)
      .values(rollupData)
      .onConflictDoUpdate({
        target: [
          metricsRollups.projectId,
          sql`COALESCE(${metricsRollups.workflowId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
          metricsRollups.bucketStart,
          metricsRollups.bucket,
        ],
        set: {
          runsCount: rollupData.runsCount,
          runsSuccess: rollupData.runsSuccess,
          runsError: rollupData.runsError,
          durP50: rollupData.durP50,
          durP95: rollupData.durP95,
          pdfSuccess: rollupData.pdfSuccess,
          pdfError: rollupData.pdfError,
          docxSuccess: rollupData.docxSuccess,
          docxError: rollupData.docxError,
          queueEnqueued: rollupData.queueEnqueued,
          queueDequeued: rollupData.queueDequeued,
          updatedAt: new Date(),
        },
      });
  }

  logger.debug('Bucket rollup completed', {
    bucketSize: params.bucketSize,
    bucketStart: params.bucketStart,
    groupCount: results.rows.length,
  });
}

/**
 * Compute and save SLI windows after rollup
 */
export async function computeAndSaveSLIs(): Promise<void> {
  // Get all unique project/workflow combinations from recent rollups
  const query = sql`
    SELECT DISTINCT
      tenant_id,
      project_id,
      workflow_id
    FROM metrics_rollups
    WHERE bucket_start >= NOW() - INTERVAL '30 days'
  `;

  const results = await db.execute(query);

  for (const row of results.rows as any[]) {
    try {
      const sliResult = await sli.computeSLI({
        projectId: row.project_id,
        workflowId: row.workflow_id,
        window: '7d',
      });

      await sli.saveSLIWindow({
        tenantId: row.tenant_id,
        projectId: row.project_id,
        workflowId: row.workflow_id,
        sli: sliResult,
      });
    } catch (error) {
      logger.error({
        err: error,
        projectId: row.project_id,
        workflowId: row.workflow_id,
      }, 'Failed to compute SLI');
    }
  }

  logger.info('SLI windows computed and saved');
}

/**
 * Get bucket boundaries for a time range
 */
function getBucketBoundaries(
  start: Date,
  end: Date,
  bucketMs: number
): Array<{ start: Date; end: Date }> {
  const buckets: Array<{ start: Date; end: Date }> = [];

  // Align start to bucket boundary
  const alignedStart = new Date(Math.floor(start.getTime() / bucketMs) * bucketMs);

  let current = alignedStart;
  while (current < end) {
    const bucketEnd = new Date(current.getTime() + bucketMs);
    buckets.push({
      start: new Date(current),
      end: bucketEnd,
    });
    current = bucketEnd;
  }

  return buckets;
}

/**
 * Get bucket size in milliseconds
 */
function getBucketMilliseconds(bucket: BucketSize): number {
  switch (bucket) {
    case '1m':
      return 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
  }
}

/**
 * Start rollup worker (runs periodically)
 */
export function startRollupWorker(intervalMs: number = 60000): NodeJS.Timeout {
  logger.info('Starting metrics rollup worker', { intervalMs });

  const interval = setInterval(async () => {
    try {
      await runRollup();

      // Compute SLIs every 5 minutes
      if (Date.now() % (5 * 60 * 1000) < intervalMs) {
        await computeAndSaveSLIs();
      }
    } catch (error) {
      logger.error({ err: error }, 'Rollup worker error');
    }
  }, intervalMs);

  // Run immediately on start
  runRollup().catch((error) => {
    logger.error({ err: error }, 'Initial rollup failed');
  });

  return interval;
}

/**
 * Export rollup functions
 */
export default {
  runRollup,
  computeAndSaveSLIs,
  startRollupWorker,
};
