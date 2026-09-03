import { randomUUID } from "crypto";

import { eq } from "drizzle-orm";

import { workflowVersions } from "@shared/schema";
import type { WorkflowRun } from "@shared/schema";

import { db } from "../../db";
import {
    workflowRunRepository,
    workflowRepository,
    runGeneratedDocumentsRepository,
    stepRepository,
} from "../../repositories";
import { hashToken } from "../../utils/encryption";
import { brandingService } from "../BrandingService";
import { RunAuthResolver } from "../runs/RunAuthResolver";

/**
 * Service for handling workflow run sharing and public access
 */
export class RunShareService {
    constructor(
        private runRepo: typeof workflowRunRepository,
        private workflowRepo: typeof workflowRepository,
        private docsRepo: typeof runGeneratedDocumentsRepository,
        private stepRepo: typeof stepRepository,
        private authResolver: RunAuthResolver
    ) { }

    /**
     * Generate a share token for a completed run
     */
    async shareRun(
        runId: string,
        userId: string | undefined,
        authType: 'creator' | 'runToken',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authContext: any
    ): Promise<{ shareToken: string; expiresAt: Date | null }> {
        // Check auth
        if (authType === 'creator') {
            if (!userId) { throw new Error("Unauthorized"); }
            const { run, access } = await this.authResolver.resolveRun(runId, userId);
            if (!run || access === 'none') { throw new Error("Run not found or access denied"); }
        } else {
            // RunToken
            const run = await this.runRepo.findById(runId);
            if (!run) { throw new Error("Run not found"); }
            // Stored run token is a SHA-256 hash; match the hash of the presented
            // plaintext, or the raw value for legacy un-hashed rows.
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Shared run data is dynamically typed at the persistence boundary.
            const presented = authContext.runToken as string;
            const matches = run.runToken === hashToken(presented) || run.runToken === presented;
            if (!matches) { throw new Error("Access denied"); }
        }

        // Note: share tokens are now hashed at rest (SEC-120).
        // findByShareToken hashes incoming tokens to match the stored `shareTokenHash`.
        const shareToken = randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days default expiration

        await this.runRepo.update(runId, {
            shareTokenHash: hashToken(shareToken),
            shareTokenExpiresAt: expiresAt
        });

        return { shareToken, expiresAt };
    }

    /**
     * Get public run execution by share token
     */
    async getRunByShareToken(token: string): Promise<WorkflowRun> {
        const run = await this.runRepo.findByShareToken(token);
        if (!run) { throw new Error("Run not found or invalid token"); }

        if (run.shareTokenExpiresAt && new Date() > run.shareTokenExpiresAt) {
            throw new Error("Share link expired");
        }
        return run;
    }

    /**
     * Get shared run details including final block config
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async getSharedRunDetails(token: string) {
        // 1. Get run by token (validates expiration)
        const run = await this.getRunByShareToken(token);
        const workflow = await this.workflowRepo.findById(run.workflowId);

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Legacy dynamic boundary requires these narrow checks.
        const accessSettings = (workflow as any)?.accessSettings || { allow_portal: false, allow_resume: true, allow_redownload: true };

        // 2. Get documents
        const documents = await this.docsRepo.findByRunId(run.id);

        // 3. Get Final Block Config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let finalBlockConfig: any = null;

        if (run.workflowVersionId) {
            // Fetch version graph
            const [version] = await db
                .select()
                .from(workflowVersions)
                .where(eq(workflowVersions.id, run.workflowVersionId))
                .limit(1);

            if (version?.graphJson) {

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- Legacy dynamic boundary requires these narrow checks.
                const graph = version.graphJson as any;
                // Search for 'final' node
                // Graph structure: { nodes: [], edges: [] }
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Shared run data is dynamically typed at the persistence boundary.
                if (graph.nodes && Array.isArray(graph.nodes)) {

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Legacy dynamic boundary requires these narrow checks.
                    const finalNode = graph.nodes.find((n: any) => n.type === 'final');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Shared run data is dynamically typed at the persistence boundary.
                    if (finalNode?.data?.config) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Shared run data is dynamically typed at the persistence boundary.
                        finalBlockConfig = finalNode.data.config;
                    }
                }
            }
        } else {
            // Draft run - fetch from steps table
            // Look for the final-documents step in the current workflow definition.
            // This searched for the retired 'final' alias until STB-21; after the
            // canonicalization backfill that type no longer exists, so the draft-run
            // path found nothing at all.
            const allSteps = await this.stepRepo.findByWorkflowIdWithAliases(run.workflowId);
            const finalStep = allSteps.find(s => s.type === 'final_documents');

            if (finalStep?.config) {
                finalBlockConfig = finalStep.config;
            }
        }

        // The share screen is a participant surface, so it renders the same
        // resolved branding as the runner (GH-158).
        const branding = await brandingService.resolveForWorkflow(run.workflowId, workflow?.settings);

        return {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Shared run data is dynamically typed at the persistence boundary.
            run: { ...run, accessSettings },
            documents,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Shared run data is dynamically typed at the persistence boundary.
            finalBlockConfig,
            branding
        };
    }
}
