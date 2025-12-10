
import { Router } from "express";
import { db } from "../db";
import { surveys, usageRecords, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireExternalAuth, ExternalAuthRequest } from "../lib/authz/externalAuth";
import { TenantContext } from "../lib/tenancy/tenantContext";

const router = Router();

// Apply middleware to all external routes
router.use(requireExternalAuth);

// GET /api/external/workflows
router.get("/workflows", async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;

        // Ensure isolation
        // Only fetch workflows in the authorized workspace
        const workflows = await db.query.surveys.findMany({
            where: eq(surveys.workspaceId, workspaceId)
        });

        res.json({
            data: workflows.map((w: any) => ({
                id: w.id,
                title: w.title,
                slug: w.publicSlug,
                isPublic: w.isPublic,
                createdAt: w.createdAt
            }))
        });

    } catch (err) {
        res.status(500).json({ error: "Internal Error" });
    }
});

// POST /api/external/workflows/:id/runs
router.post("/workflows/:id/runs", async (req: ExternalAuthRequest, res) => {
    try {
        const { id } = req.params;
        const workspaceId = req.externalAuth!.workspaceId;
        const body = req.body; // { initialValues, metadata }

        // Verify workflow exists in workspace
        const workflow = await db.query.surveys.findFirst({
            where: (surveys: any, { and, eq }: any) => and(
                eq(surveys.id, id),
                eq(surveys.workspaceId, workspaceId)
            )
        });

        if (!workflow) {
            return res.status(404).json({ error: "Workflow not found" });
        }

        // Create Run (Mock)
        // In real impl, insert into 'survey_results' or 'workflow_runs'
        const runId = "run_" + Math.random().toString(36).substr(2, 9);

        // Record Usage (Metering)
        await db.insert(usageRecords).values({
            organizationId: "ed328704-586b-4b10-911d-2947118ae320", // TODO: Resolve Org from Workspace
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
        console.error(err);
        res.status(500).json({ error: "Internal Error" });
    }
});

// GET /api/external/runs/:id
router.get("/runs/:id", async (req: ExternalAuthRequest, res) => {
    // Implementation to get run status
    res.json({ id: req.params.id, status: "completed", output: {} });
});

export default router;
