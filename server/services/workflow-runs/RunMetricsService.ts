/**
 * RunMetricsService
 *
 * Handles metrics capture and analytics events for workflow runs.
 * Responsibilities:
 * - Capture lifecycle metrics (started, succeeded, failed)
 * - Record analytics events
 * - Trigger aggregation
 * - Get workflow context for metrics
 */

import { logger } from "../../logger";
import { workflowRepository, projectRepository } from "../../repositories";
import { aggregationService } from "../analytics/AggregationService";
import { analyticsService } from "../analytics/AnalyticsService";
import { captureRunLifecycle } from "../metrics";

import type { WorkflowContext } from "./types";
import type { AnalyticsEventInput } from "../analytics/AnalyticsService";
import { withTenant, withVerifiedIdentifier } from '../../utils/rlsContext';
import { workflowTenantResolver } from '../WorkflowTenantResolver';

export class RunMetricsService {
  constructor(
    private workflowRepo = workflowRepository,
    private projectRepo = projectRepository
  ) { }

  /**
   * Record an analytics event, unless the run has no pinned version.
   *
   * `workflow_run_events.version_id` is a NOT NULL uuid column with a foreign
   * key to `workflow_versions` (shared/schema/run.ts) — there is no value that
   * can be written for a versionless run, so the event is skipped rather than
   * attempting an insert that is guaranteed to fail. All three lifecycle
   * capture methods below share this one guard.
   */
  private async recordAnalyticsEvent(
    versionId: string | undefined,
    event: Omit<AnalyticsEventInput, 'versionId'>
  ): Promise<void> {
    if (!versionId) {
      logger.debug(
        { runId: event.runId, type: event.type },
        'Skipping analytics event for versionless run'
      );
      return;
    }

    await analyticsService.recordEvent({ ...event, versionId });
  }

  /**
   * Get tenant and project IDs for a workflow (for metrics)
   */
  async getWorkflowContext(workflowId: string): Promise<WorkflowContext | null> {
    try {
      // RLS-5: `workflows` and `projects` are both covered, and these ran on the
      // bare pool — so under enforcement this returned null and every caller
      // took its "no context, skipping capture" early return. That path logs at
      // DEBUG, so run analytics simply stopped being recorded with nothing in
      // the logs to say so. Resolved under migration 0030's clause because this
      // is reached from run execution, which may carry a run token rather than
      // a session and so may have no ambient tenant of its own.
      const workflow = await withVerifiedIdentifier(
        'app.current_workflow_id',
        workflowId,
        (tx) => this.workflowRepo.findById(workflowId, tx)
      );
      if (!workflow?.projectId) {
        return null;
      }

      const tenantId = await withVerifiedIdentifier(
        'app.current_workflow_id',
        workflowId,
        (tx) => workflowTenantResolver.resolveForWorkflowId(workflowId, tx)
      );
      if (!tenantId) {
        return null;
      }

      const project = await withTenant(tenantId, (tx) =>
        this.projectRepo.findById(workflow.projectId!, tx));
      if (!project?.tenantId) {
        return null;
      }

      return {
        tenantId: project.tenantId,
        projectId: project.id,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get workflow context for metrics');
      return null;
    }
  }

  /**
   * Capture run started metrics
   */
  async captureRunStarted(
    workflowId: string,
    runId: string,
    userId: string | undefined,
    versionId: string | undefined,
    options?: { accessMode?: 'anonymous' | 'token' | 'portal' }
  ): Promise<void> {
    const context = await this.getWorkflowContext(workflowId);

    if (!context) {
      logger.debug({ workflowId, runId }, 'No context for metrics, skipping capture');
      return;
    }

    try {
      // Capture legacy metrics (Stage 11)
      await captureRunLifecycle.started({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId,
        runId,
        createdBy: userId ?? 'anon',
      });

      // Capture new analytics (Stage 15)
      await this.recordAnalyticsEvent(versionId, {
        runId,
        workflowId,
        type: 'run.start',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          accessMode: options?.accessMode ?? 'anonymous'
        }
      });
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to capture run.start metrics');
    }
  }

  /**
   * Capture run succeeded metrics
   */
  async captureRunSucceeded(
    workflowId: string,
    runId: string,
    versionId: string | undefined,
    durationMs: number,
    stepCount: number
  ): Promise<void> {
    const context = await this.getWorkflowContext(workflowId);

    if (!context) {
      return;
    }

    try {
      // Capture legacy metrics (Stage 11)
      await captureRunLifecycle.succeeded({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId,
        runId,
        durationMs,
        stepCount,
      });

      // Capture new analytics (Stage 15)
      await this.recordAnalyticsEvent(versionId, {
        runId,
        workflowId,
        type: 'workflow.complete',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          durationMs,
          stepCount
        }
      });

      // Trigger aggregation (fire and forget)
      void aggregationService.aggregateRun(runId).catch((err: unknown) => {
        logger.error({ error: err, runId }, "Failed to aggregate run metrics");
      });
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to capture run.succeeded metrics');
    }
  }

  /**
   * Capture run failed metrics
   */
  // eslint-disable-next-line max-params -- lifecycle metrics require all context fields
  async captureRunFailed(
    workflowId: string,
    runId: string,
    versionId: string | undefined,
    durationMs: number,
    errorType: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error details can be any shape
    details?: any
  ): Promise<void> {
    const context = await this.getWorkflowContext(workflowId);

    if (!context) {
      return;
    }

    try {
      // Capture legacy metrics (Stage 11)
      await captureRunLifecycle.failed({
        tenantId: context.tenantId,
        projectId: context.projectId,
        workflowId,
        runId,
        durationMs,
        errorType,
      });

      // Capture new analytics (Stage 15)
      await this.recordAnalyticsEvent(versionId, {
        runId,
        workflowId,
        type: 'validation.error',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          errorType,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- error details are dynamic
          details
        }
      });
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to capture run.failed metrics');
    }
  }
}

export const runMetricsService = new RunMetricsService();
