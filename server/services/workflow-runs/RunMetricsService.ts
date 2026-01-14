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

export class RunMetricsService {
  constructor(
    private workflowRepo = workflowRepository,
    private projectRepo = projectRepository
  ) {}

  /**
   * Get tenant and project IDs for a workflow (for metrics)
   */
  async getWorkflowContext(workflowId: string): Promise<WorkflowContext | null> {
    try {
      const workflow = await this.workflowRepo.findById(workflowId);
      if (!workflow?.projectId) {
        return null;
      }

      const project = await this.projectRepo.findById(workflow.projectId);
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
        createdBy: userId || 'anon',
      });

      // Capture new analytics (Stage 15)
      await analyticsService.recordEvent({
        runId,
        workflowId,
        versionId: versionId || 'draft',
        type: 'run.start',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          accessMode: options?.accessMode || 'anonymous'
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
      await analyticsService.recordEvent({
        runId,
        workflowId,
        versionId: versionId || 'draft',
        type: 'workflow.complete',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          durationMs,
          stepCount
        }
      });

      // Trigger aggregation (fire and forget)
      aggregationService.aggregateRun(runId).catch(err => {
        logger.error({ error: err, runId }, "Failed to aggregate run metrics");
      });
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to capture run.succeeded metrics');
    }
  }

  /**
   * Capture run failed metrics
   */
  async captureRunFailed(
    workflowId: string,
    runId: string,
    versionId: string | undefined,
    durationMs: number,
    errorType: string,
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
      await analyticsService.recordEvent({
        runId,
        workflowId,
        versionId: versionId || 'draft',
        type: 'validation.error',
        timestamp: new Date().toISOString(),
        isPreview: false,
        payload: {
          errorType,
          details
        }
      });
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to capture run.failed metrics');
    }
  }
}

export const runMetricsService = new RunMetricsService();
