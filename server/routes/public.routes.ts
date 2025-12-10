import { Router } from "express";
import { db } from "../db";
import { surveys } from "@shared/schema";
import { eq } from "drizzle-orm";
import { WebhookDispatcher } from "../lib/webhooks/dispatcher";

const router = Router();

// Get Public Workflow by Slug
router.get("/w/:slug", async (req, res) => {
    try {
        const { slug } = req.params;

        const workflow = await db.query.surveys.findFirst({
            where: eq(surveys.publicSlug, slug)
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
});

// Run Workflow (Start Session)
router.post("/w/:slug/run", async (req, res) => {
    // Logic to initialize a run (like internal runner but anonymous)
    // Would insert into 'usage_records' if metering enabled
    res.json({ runId: "mock_run_id", status: "started" });
});

// Complete Workflow (Simulator)
router.post("/w/:slug/complete", async (req, res) => {
    const { slug } = req.params;
    const { runId, payload } = req.body;

    // Find workflow to get workspaceId
    const workflow = await db.query.surveys.findFirst({
        where: eq(surveys.publicSlug, slug)
    });

    if (workflow) {
        // Trigger Webhook
        await WebhookDispatcher.dispatch(workflow.workspaceId, 'run.completed', {
            event: 'run.completed',
            workflowId: workflow.id,
            runId: runId,
            data: payload,
            timestamp: new Date().toISOString()
        });
    }

    res.json({ status: "completed" });
});

export default router;
