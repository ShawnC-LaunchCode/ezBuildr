import { eq } from "drizzle-orm";
import { Router } from "express";

import { workflows, workspaces } from "@shared/schema";

import { db } from "../db";
import { requireExternalAuth, type ExternalAuthRequest } from "../lib/authz/externalAuth";
import { createLogger } from "../logger";
import { asyncHandler } from '../utils/asyncHandler';
import { withCurrentTenant } from "../utils/rlsContext";

import type { Router as RouterType } from "express";
const logger = createLogger({ module: 'external-routes' });
const router: RouterType = Router();
// Apply middleware to all external routes
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.use(requireExternalAuth);
// GET /api/external/workflows
router.get("/workflows", asyncHandler(async (req, res) => {
    const extReq = req as ExternalAuthRequest;
    try {
        const workspaceId = extReq.externalAuth!.workspaceId;
        // Ensure isolation
        // Only fetch workflows in the authorized workspace (assuming workspaceId maps to projectId for now, or we filter by tenant)
        // Note: This needs verification if workspaceId == projectId.
        // RLS-5: `workflows` is covered. `requireExternalAuth` binds this
        // workspace's tenant into the async context, so read inside the scoped
        // transaction — unscoped this silently returns an empty list.
        const workflowList = await withCurrentTenant((tx) => tx.query.workflows.findMany({
            where: eq(workflows.projectId, workspaceId)
        }));
        res.json({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: workflowList.map((w: any) => ({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                id: w.id,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                title: w.name ?? w.title,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                slug: w.slug,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                isPublic: w.isPublic,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                createdAt: w.createdAt
            }))
        });
    } catch (_err) {
        res.status(500).json({ error: "Internal Error" });
    }
}));
// POST /api/external/workflows/:id/runs
router.post("/workflows/:id/runs", asyncHandler(async (req, res) => {
    const extReq = req as ExternalAuthRequest;
    try {
        const { id } = req.params;
        const workspaceId = extReq.externalAuth!.workspaceId;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const _body = req.body; // { initialValues, metadata }
        // Verify workflow exists in workspace

        const workflow = await withCurrentTenant((tx) => tx.query.workflows.findFirst({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            where: (workflows: any, { and, eq }: any) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
                and(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    eq(workflows.id, id),
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    eq(workflows.projectId, workspaceId)
                )
        }));
        if (!workflow) {
            res.status(404).json({ error: "Workflow not found" });
            return;
        }

        // Gate: Only allow runs on 'active' workflows
        if (workflow.status !== 'active') {
            res.status(403).json({ error: "Workflow is not active" });
            return;
        }

        // Create Run (Mock)
        // In real impl, insert into 'survey_results' or 'workflow_runs'
        // Resolve organization ID from workspace
        const workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId)
        });
        if (!workspace) {
            res.status(500).json({ error: "Workspace not found" });
            return;
        }
        // SEC-001: Run execution via external API is not yet fully implemented.
        // Returning 501 to prevent billing logic from writing usage records for fake runs.
        return res.status(501).json({
          success: false,
          error: "Run execution via external API is currently under construction."
        });
    } catch (err) {
        logger.error({ err }, 'Error creating workflow run');
        res.status(500).json({ error: "Internal Error" });
    }
}));
// GET /api/external/runs/:id
router.get("/runs/:id", asyncHandler(async (req, res) => {
    // SEC-002: Getting run status via external API is not yet fully implemented.
    return res.status(501).json({
        success: false,
        error: "Fetching run status via external API is currently under construction."
    });
}));
export default router;
