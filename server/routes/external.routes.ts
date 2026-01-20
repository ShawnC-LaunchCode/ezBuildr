import { eq } from "drizzle-orm";
import { Router } from "express";
import { workflows, usageRecords, workspaces } from "@shared/schema";
import { db } from "../db";
import { requireExternalAuth, ExternalAuthRequest } from "../lib/authz/externalAuth";
import { createLogger } from "../logger";
import { asyncHandler } from '../utils/asyncHandler';
const logger = createLogger({ module: 'external-routes' });
const router = Router();
// Apply middleware to all external routes
router.use(requireExternalAuth);
// GET /api/external/workflows
router.get("/workflows", asyncHandler(async (req: any, res) => {
    const extReq = req as ExternalAuthRequest;
    try {
        const workspaceId = extReq.externalAuth!.workspaceId;
        // Ensure isolation
        // Only fetch workflows in the authorized workspace (assuming workspaceId maps to projectId for now, or we filter by tenant)
        // Note: This needs verification if workspaceId == projectId.
        const workflowList = await db.query.workflows.findMany({
            where: eq(workflows.projectId, workspaceId)
        });
        res.json({
            data: workflowList.map((w: any) => ({
                id: w.id,
                title: w.name || w.title,
                slug: w.slug,
                isPublic: w.isPublic,
                createdAt: w.createdAt
            }))
        });
    } catch (err) {
        res.status(500).json({ error: "Internal Error" });
    }
}));
// POST /api/external/workflows/:id/runs
router.post("/workflows/:id/runs", asyncHandler(async (req: any, res) => {
    const extReq = req as ExternalAuthRequest;
    try {
        const { id } = req.params;
        const workspaceId = extReq.externalAuth!.workspaceId;
        const body = req.body; // { initialValues, metadata }
        // Verify workflow exists in workspace
        const workflow = await db.query.workflows.findFirst({
            where: (workflows: any, { and, eq }: any) => and(
                eq(workflows.id, id),
                eq(workflows.projectId, workspaceId)
            )
        });
        if (!workflow) {
            res.status(404).json({ error: "Workflow not found" });
            return;
        }
        // Create Run (Mock)
        // In real impl, insert into 'survey_results' or 'workflow_runs'
        const runId = `run_${Math.random().toString(36).substr(2, 9)}`;
        // Resolve organization ID from workspace
        const workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId)
        });
        if (!workspace) {
            res.status(500).json({ error: "Workspace not found" });
            return;
        }
        // Record Usage (Metering)
        await db.insert(usageRecords).values({
            organizationId: workspace.organizationId,
            metric: 'workflow_run',
            quantity: 1,
            workflowId: id,
            metadata: { source: 'api', runId }
        });
        res.json({
            id: runId,
            status: "created",
            url: `http://localhost:5000/run/${runId}` // Or public runner URL
        });
    } catch (err) {
        logger.error({ err }, 'Error creating workflow run');
        res.status(500).json({ error: "Internal Error" });
    }
}));
// GET /api/external/runs/:id
router.get("/runs/:id", asyncHandler(async (req: any, res) => {
    // Implementation to get run status
    res.json({ id: req.params.id, status: "completed", output: {} });
}));
export default router;