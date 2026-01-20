import { eq } from "drizzle-orm";
import { Router, Request, Response } from "express";

import { workflows } from "@shared/schema";

import { db } from "../db";
import { WebhookDispatcher } from "../lib/webhooks/dispatcher";
import { asyncHandler } from "../utils/asyncHandler";


const router = Router();

// Get Public Workflow by Slug
router.get("/w/:slug", asyncHandler(async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        // Use workflows table instead of legacy surveys
        const workflow: any = await db.query.workflows.findFirst({
            where: eq(workflows.slug, slug)
        });

        if (!workflow) {
            return res.status(404).json({ error: "Workflow not found" });
        }

        if (!workflow.isPublic) {
            return res.status(404).json({ error: "Workflow not found" }); // Hide private
        }

        // Logic for 'domain_restricted' or 'link_only' would go here
        // For 'link_only', getting it by slug is technically fine (link IS the slug)
        // For 'domain_restricted', we might need to start an email verif flow, but omitting for initial loop.

        // Clean sensitive data
        const safeWorkflow = {
            id: workflow.id,
            title: workflow.title,
            description: workflow.description,
            publicSettings: workflow.publicSettings,
            // Logic to fetch pages/blocks would be needed here too
        };

        res.json(safeWorkflow);

    } catch (error) {
        console.error("Public Runner Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));

// Run Workflow (Start Session)
router.post("/w/:slug/run", asyncHandler(async (req: Request, res: Response) => {
    // Logic to initialize a run (like internal runner but anonymous)
    // Would insert into 'usage_records' if metering enabled
    res.json({ runId: "mock_run_id", status: "started" });
}));

// Complete Workflow (Simulator)
router.post("/w/:slug/complete", asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const { runId, payload } = req.body;

    // Find workflow to get workspaceId
    const workflow = await db.query.workflows.findFirst({
        where: eq(workflows.slug, slug)
    });

    if (workflow) {
        // Trigger Webhook
        if (workflow.projectId) {
            await WebhookDispatcher.dispatch(workflow.projectId, 'run.completed', {
                event: 'run.completed',
                workflowId: workflow.id,
                runId: runId,
                data: payload,
                timestamp: new Date().toISOString()
            });
        }
    }

    res.json({ status: "completed" });
}));

export default router;
