/**
 * Metrics Service - Event Capture for Analytics & SLIs
 *
 * Captures runtime events for analytics, SLI tracking, and observability.
 * Events are stored in metrics_events table and aggregated by rollup jobs.
 */

import { db } from '../db';
import { metricsEvents, type InsertMetricsEvent } from '../../shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import logger from '../logger';

export interface MetricsEventInput {
  type: 'run_started' | 'run_succeeded' | 'run_failed' | 'pdf_succeeded' | 'pdf_failed' | 'docx_succeeded' | 'docx_failed' | 'queue_enqueued' | 'queue_dequeued';
  tenantId: string;
  projectId: string;
  workflowId?: string;
  runId?: string;
  ts?: Date;
  durationMs?: number;
  payload?: Record<string, any>;
}

/**
 * Emit a metrics event
 * Records the event in the database for later aggregation
 */
export async function emit(event: MetricsEventInput): Promise<void> {
  try {
    // Redact sensitive fields from payload
    const sanitizedPayload = event.payload ? redactPayload(event.payload) : {};

    const insertData: InsertMetricsEvent = {
      type: event.type,
      tenantId: event.tenantId,
      projectId: event.projectId,
      workflowId: event.workflowId || null,
      runId: event.runId || null,
      ts: event.ts || new Date(),
      durationMs: event.durationMs || null,
      payload: sanitizedPayload,
    };

    await db.insert(metricsEvents).values(insertData);

    logger.debug({
      type: event.type,
      projectId: event.projectId,
      workflowId: event.workflowId,
      runId: event.runId,
    }, 'Metrics event emitted');
  } catch (error) {
    // Don't throw - metrics failures should not break application flow
    logger.error({ error, event }, 'Failed to emit metrics event');
  }
}

/**
 * Capture run lifecycle events
 * Helper to emit events at key points in workflow run execution
 */
export const captureRunLifecycle = {
  /**
   * Emit run_started event when a run begins
   */
  async started(params: {
    tenantId: string;
    projectId: string;
    workflowId: string;
    runId: string;
    createdBy?: string;
  }): Promise<void> {
    await emit({
      type: 'run_started',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      payload: {
        createdBy: params.createdBy,
      },
    });
  },

  /**
   * Emit run_succeeded event when a run completes successfully
   */
  async succeeded(params: {
    tenantId: string;
    projectId: string;
    workflowId: string;
    runId: string;
    durationMs: number;
    stepCount?: number;
  }): Promise<void> {
    await emit({
      type: 'run_succeeded',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: params.durationMs,
      payload: {
        stepCount: params.stepCount,
      },
    });
  },

  /**
   * Emit run_failed event when a run fails
   */
  async failed(params: {
    tenantId: string;
    projectId: string;
    workflowId: string;
    runId: string;
    durationMs: number;
    errorType?: string;
  }): Promise<void> {
    await emit({
      type: 'run_failed',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: params.durationMs,
      payload: {
        errorType: params.errorType,
      },
    });
  },
};

/**
 * Capture document generation events (PDF/DOCX)
 */
export const captureDocumentGeneration = {
  /**
   * Emit pdf_succeeded event
   */
  async pdfSucceeded(params: {
    tenantId: string;
    projectId: string;
    workflowId?: string;
    runId?: string;
    durationMs?: number;
    fileSize?: number;
  }): Promise<void> {
    await emit({
      type: 'pdf_succeeded',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: params.durationMs,
      payload: {
        fileSize: params.fileSize,
      },
    });
  },

  /**
   * Emit pdf_failed event
   */
  async pdfFailed(params: {
    tenantId: string;
    projectId: string;
    workflowId?: string;
    runId?: string;
    durationMs?: number;
    errorType?: string;
  }): Promise<void> {
    await emit({
      type: 'pdf_failed',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: params.durationMs,
      payload: {
        errorType: params.errorType,
      },
    });
  },

  /**
   * Emit docx_succeeded event
   */
  async docxSucceeded(params: {
    tenantId: string;
    projectId: string;
    workflowId?: string;
    runId?: string;
    durationMs?: number;
    fileSize?: number;
  }): Promise<void> {
    await emit({
      type: 'docx_succeeded',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: params.durationMs,
      payload: {
        fileSize: params.fileSize,
      },
    });
  },

  /**
   * Emit docx_failed event
   */
  async docxFailed(params: {
    tenantId: string;
    projectId: string;
    workflowId?: string;
    runId?: string;
    durationMs?: number;
    errorType?: string;
  }): Promise<void> {
    await emit({
      type: 'docx_failed',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      runId: params.runId,
      durationMs: params.durationMs,
      payload: {
        errorType: params.errorType,
      },
    });
  },
};

/**
 * Capture queue events (if using job queue)
 */
export const captureQueue = {
  /**
   * Emit queue_enqueued event when a job is added to queue
   */
  async enqueued(params: {
    tenantId: string;
    projectId: string;
    workflowId?: string;
    jobType?: string;
  }): Promise<void> {
    await emit({
      type: 'queue_enqueued',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      payload: {
        jobType: params.jobType,
      },
    });
  },

  /**
   * Emit queue_dequeued event when a job is processed from queue
   */
  async dequeued(params: {
    tenantId: string;
    projectId: string;
    workflowId?: string;
    jobType?: string;
    durationMs?: number;
  }): Promise<void> {
    await emit({
      type: 'queue_dequeued',
      tenantId: params.tenantId,
      projectId: params.projectId,
      workflowId: params.workflowId,
      durationMs: params.durationMs,
      payload: {
        jobType: params.jobType,
      },
    });
  },
};

/**
 * Get recent events for a project or workflow
 */
export async function getRecentEvents(params: {
  projectId: string;
  workflowId?: string;
  limit?: number;
  since?: Date;
}): Promise<typeof metricsEvents.$inferSelect[]> {
  const conditions = [eq(metricsEvents.projectId, params.projectId)];

  if (params.workflowId) {
    conditions.push(eq(metricsEvents.workflowId, params.workflowId));
  }

  if (params.since) {
    conditions.push(gte(metricsEvents.ts, params.since));
  }

  return await db
    .select()
    .from(metricsEvents)
    .where(and(...conditions))
    .orderBy(desc(metricsEvents.ts))
    .limit(params.limit || 100);
}

/**
 * Redact sensitive fields from payload
 * Prevents secrets, PII, and other sensitive data from being logged
 */
function redactPayload(payload: Record<string, any>): Record<string, any> {
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'privateKey',
    'private_key',
    'credential',
    'auth',
    'authorization',
  ];

  const redacted: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some((field) => lowerKey.includes(field));

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively redact nested objects
      redacted[key] = redactPayload(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Export all metrics service functions
 */
export default {
  emit,
  captureRunLifecycle,
  captureDocumentGeneration,
  captureQueue,
  getRecentEvents,
};
