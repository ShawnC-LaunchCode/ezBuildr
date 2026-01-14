/**
 * RunStateService
 *
 * Handles workflow run state transitions and management.
 * Responsibilities:
 * - Update current section
 * - Update progress percentage
 * - Mark run as completed
 * - Manage run status transitions
 * - Handle share tokens
 */

import { randomUUID } from "crypto";

import { eq } from "drizzle-orm";

import { workflowVersions } from "@shared/schema";
import type { WorkflowRun } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";
import { workflowRunRepository, runGeneratedDocumentsRepository } from "../../repositories";

import type { ShareTokenResult, SharedRunDetails } from "./types";

export class RunStateService {
  constructor(
    private runRepo = workflowRunRepository,
    private docsRepo = runGeneratedDocumentsRepository
  ) {}

  /**
   * Update run current section and progress
   */
  async updateProgress(
    runId: string,
    currentSectionId: string | null,
    progress?: number
  ): Promise<void> {
    const updates: Partial<WorkflowRun> = {
      currentSectionId,
    };

    if (progress !== undefined) {
      updates.progress = progress;
    }

    await this.runRepo.update(runId, updates as any);
  }

  /**
   * Mark run as completed
   */
  async markCompleted(runId: string): Promise<WorkflowRun> {
    return this.runRepo.update(runId, {
      completed: true,
      completedAt: new Date(),
      progress: 100,
    });
  }

  /**
   * Check if run is completed
   */
  async isCompleted(runId: string): Promise<boolean> {
    const run = await this.runRepo.findById(runId);
    return run?.completed ?? false;
  }

  /**
   * Generate a share token for a completed run
   */
  async generateShareToken(runId: string, expirationDays: number = 30): Promise<ShareTokenResult> {
    const shareToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    await this.runRepo.update(runId, {
      shareToken,
      shareTokenExpiresAt: expiresAt
    });

    return { shareToken, expiresAt };
  }

  /**
   * Verify share token and get run
   */
  async getRunByShareToken(token: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findByShareToken(token);
    if (!run) {
      throw new Error("Run not found or invalid token");
    }

    if (run.shareTokenExpiresAt && new Date() > run.shareTokenExpiresAt) {
      throw new Error("Share link expired");
    }

    return run;
  }

  /**
   * Get run by portal access key
   */
  async getRunByPortalAccessKey(key: string): Promise<WorkflowRun> {
    const run = await this.runRepo.findByPortalAccessKey(key);
    if (!run) {
      throw new Error("Run not found");
    }
    return run;
  }

  /**
   * Get shared run details including final block config
   */
  async getSharedRunDetails(token: string): Promise<SharedRunDetails> {
    // 1. Get run by token (validates expiration)
    const run = await this.getRunByShareToken(token);

    // Get workflow to get access settings
    const { workflowRepository } = await import('../../repositories');
    const workflow = await workflowRepository.findById(run.workflowId);
    const accessSettings = (workflow as any)?.accessSettings || {
      allow_portal: false,
      allow_resume: true,
      allow_redownload: true
    };

    // 2. Get documents
    const documents = await this.docsRepo.findByRunId(run.id);

    // 3. Get Final Block Config
    let finalBlockConfig: any = null;

    if (run.workflowVersionId) {
      // Fetch version graph
      const [version] = await db
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.id, run.workflowVersionId))
        .limit(1);

      if (version?.graphJson) {
        const graph = version.graphJson as any;
        // Search for 'final' node
        if (graph.nodes && Array.isArray(graph.nodes)) {
          const finalNode = graph.nodes.find((n: any) => n.type === 'final');
          if (finalNode?.data?.config) {
            finalBlockConfig = finalNode.data.config;
          }
        }
      }
    } else {
      // Draft run - fetch from steps table
      const { stepRepository } = await import('../../repositories');
      const allSteps = await stepRepository.findByWorkflowIdWithAliases(run.workflowId);
      const finalStep = allSteps.find(s => s.type === 'final');

      if (finalStep?.options) {
        finalBlockConfig = finalStep.options;
      }
    }

    return {
      run: { ...run, accessSettings },
      documents,
      finalBlockConfig
    };
  }

  /**
   * Get generated documents for a run
   */
  async getGeneratedDocuments(runId: string) {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    return this.docsRepo.findByRunId(runId);
  }

  /**
   * Delete all generated documents for a run
   */
  async deleteGeneratedDocuments(runId: string): Promise<void> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    await this.docsRepo.deleteByRunId(runId);
    logger.info({ runId }, 'Deleted all generated documents for run');
  }
}

export const runStateService = new RunStateService();
