/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { eq, and, desc } from "drizzle-orm";

import { workflowRuns } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
export class PortalService {
    /**
     * List runs accessible to a given email
     * Returns: Run ID, Date, Status, Workflow Title
     * Filters: Completed/In-Progress
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async listRunsForEmail(email: string) {
        try {
            // Find runs associated with this email
            // Either client_email matches OR they created it (if we enforce that, but for now client_email)
            const runs = await db.query.workflowRuns.findMany({
                where: eq(workflowRuns.clientEmail, email),
                orderBy: [desc(workflowRuns.updatedAt)],
                with: {
                    workflow: {
                        columns: {
                            id: true,
                            title: true,
                            name: true, // Legacy/New
                            // publicSettings: true
                        }
                    }
                }
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle query result with nested relations requires any
            return runs.map((run: any) => ({
                id: run.id,
                workflowTitle: run.workflow?.name || run.workflow?.title || "Untitled Workflow",
                status: run.completed ? 'completed' : 'in_progress',
                updatedAt: run.updatedAt,
                completedAt: run.completedAt,
                accessSettings: run.workflow?.accessSettings,
                // Share tokens are stored hashed (share_token_hash); the plaintext
                // token is only returned once at share-creation time and cannot be
                // reconstructed here. Expose only whether a share link exists.
                hasShareToken: Boolean(run.shareTokenHash)
            }));
        } catch (error) {
            logger.error({ error, email }, "Error listing portal runs");
            throw new Error("Failed to list runs");
        }
    }
    /**
     * Verify access to a specific run for a user (email)
     */
    async verifyRunAccess(runId: string, email: string): Promise<boolean> {
        const run = await db.query.workflowRuns.findFirst({
            where: and(
                eq(workflowRuns.id, runId),
                eq(workflowRuns.clientEmail, email)
            )
        });
        return !!run;
    }
}
export const portalService = new PortalService();