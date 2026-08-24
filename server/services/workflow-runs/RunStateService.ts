/**
 * RunStateService
 *
 * Handles workflow run state transitions and management.
 * Responsibilities:
 * - Update current page
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
import {
  workflowRunRepository,
  runGeneratedDocumentsRepository,
  runCompletionJobRepository,
} from "../../repositories";

import { hashToken } from "../../utils/encryption";
import { withCurrentTenant, withTenant, withVerifiedIdentifier } from "../../utils/rlsContext";
import type { WorkflowContentData } from "../WorkflowContentIngestService";
import type { ShareTokenResult, SharedRunDetails } from "./types";

export class RunStateService {
  constructor(
    private runRepo = workflowRunRepository,
    private docsRepo = runGeneratedDocumentsRepository,
    private completionJobRepo = runCompletionJobRepository
  ) {}

  /**
   * Update run current page and progress
   */
  async updateProgress(
    runId: string,
    currentPageId: string | null,
    progress?: number
  ): Promise<WorkflowRun> {
    return withCurrentTenant((tx) =>
      this.runRepo.advanceIfIncomplete(runId, currentPageId, progress, tx));
  }

  /**
   * Mark run as completed (atomic — refuses runs that are already completed)
   */
  async markCompleted(runId: string): Promise<WorkflowRun> {
    return this.runRepo.markComplete(runId);
  }

  /** Atomically submit the run and create all required durable follow-up work. */
  async markCompletedAndEnqueue(
    runId: string
  ): Promise<WorkflowRun> {
    return this.runRepo.transaction(async (tx) => {
      const completedRun = await this.runRepo.markComplete(runId, tx);
      await this.completionJobRepo.enqueue({ runId, kind: 'documents' }, tx);
      return completedRun;
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
      shareTokenHash: hashToken(shareToken),
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

    // Get workflow to get access settings.
    //
    // RLS-5: this route (`GET /api/shared/runs/:token`) mounts NO auth
    // middleware — a share link is the credential — so nothing has put a
    // tenant in the async context. `workflows` and `steps` are both covered,
    // and the failure would have been silent rather than loud: an unscoped
    // read returns no workflow, `accessSettings` falls back to its defaults,
    // and the shared page renders with `allow_portal: false` as though the
    // owner had configured it that way.
    //
    // The share token was already validated above, so `run.workflowId` is a
    // legitimately-established value — pin it as `app.current_workflow_id`
    // (migration 0030) for the resolution, exactly as `runTokenAuth` does,
    // then run the reads scoped to the tenant it yields.
    const tenantId = await withVerifiedIdentifier(
      'app.current_workflow_id',
      run.workflowId,
      async (tx) => {
        const { workflowTenantResolver } = await import('../WorkflowTenantResolver');
        return workflowTenantResolver.resolveForWorkflowId(run.workflowId, tx);
      }
    );
    if (!tenantId) {
      throw new Error("Run not found");
    }
    const { workflowRepository } = await import('../../repositories');
    const workflow = await withTenant(tenantId, (tx) =>
      workflowRepository.findById(run.workflowId, tx));

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Legacy dynamic boundary requires these narrow checks.
    const accessSettings = (workflow as any)?.accessSettings || {
      allow_portal: false,
      allow_resume: true,
      allow_redownload: true
    };

    // 2. Get documents
    const documents = await this.docsRepo.findByRunId(run.id);

    // 3. Get Final Block Config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalBlockConfig: any = null;

    if (run.workflowVersionId) {
      // Fetch the pinned version's serialized content. VersionService.serializeWorkflow
      // emits `pages[].steps[]` (there is no `nodes[]` graph shape anymore — the
      // graph builder was removed), so find the first Final Block step in there,
      // mirroring RunLifecycleService.generateDocuments' 'final'/'final_documents' handling.
      const [version] = await db
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.id, run.workflowVersionId))
        .limit(1);

      if (version?.graphJson) {
        const content = version.graphJson as WorkflowContentData;
        const finalStep = (content.pages ?? [])
          .flatMap(page => page.steps ?? [])
          .find(step => step.type === 'final' || step.type === 'final_documents');
        if (finalStep?.config) {
          finalBlockConfig = finalStep.config;
        }
      }
    } else {
      // Draft run - fetch from steps table
      const { stepRepository } = await import('../../repositories');
      const allSteps = await withTenant(tenantId, (tx) =>
        stepRepository.findByWorkflowIdWithAliases(run.workflowId, tx));
      const finalStep = allSteps.find(s => s.type === 'final');

      if (finalStep?.config) {
        finalBlockConfig = finalStep.config;
      }
    }

    return {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Run state values are dynamically typed at the persistence boundary.
      run: { ...run, accessSettings },
      documents,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Run state values are dynamically typed at the persistence boundary.
      finalBlockConfig
    };
  }

  /**
   * Get generated documents for a run
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getGeneratedDocuments(runId: string) {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const documents = await this.docsRepo.findByRunId(runId);
    return { documents, generationStatus: run.generationStatus };
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
