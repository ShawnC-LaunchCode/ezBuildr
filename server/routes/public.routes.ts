/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { eq } from "drizzle-orm";
import { Router, Request, Response } from "express";

import { workflows } from "@shared/schema";

import { db } from "../db";
import { workflowRunRepository } from "../repositories";
import { logger } from "../logger";
import { WebhookDispatcher } from "../lib/webhooks/dispatcher";
import { asyncHandler } from "../utils/asyncHandler";
import { apiLimiter, strictLimiter } from "../middleware/rateLimiter";

const router = Router();

// Get Public Workflow by Slug
router.get("/w/:slug", asyncHandler(async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        // Use workflows table instead of legacy surveys
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workflow query result with dynamic schema
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
        logger.error({ err: error, slug: req.params.slug }, "Public runner error");
        res.status(500).json({ error: "Internal Server Error" });
    }
}));

// Run Workflow (Start Session)
router.post("/w/:slug/run", asyncHandler(async (req: Request, res: Response) => {
    // Return 501 Not Implemented to prevent fake success usage until implemented
    res.status(501).json({ error: "Not Implemented" });
}));

// Complete Workflow (Simulator)
router.post("/w/:slug/complete", apiLimiter, strictLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const { runToken } = req.body;

    try {
        // Find workflow to get workspaceId
        const workflow = await db.query.workflows.findFirst({
            where: eq(workflows.slug, slug)
        });

        // Verify workflow exists
        if (!workflow) {
            return res.status(404).json({ error: "Workflow not found" });
        }
        
        if (!runToken || typeof runToken !== 'string') {
            return res.status(400).json({ error: "Missing or invalid runToken" });
        }

        // Attempt to resolve real run from DB using secure token
        const run = await workflowRunRepository.findByToken(runToken);

        if (!run || run.workflowId !== workflow.id) {
            logger.warn({ slug, tokenLength: runToken?.length }, "Failed token lookup on public complete endpoint");
            return res.status(404).json({ error: "Run not found or invalid for workflow" });
        }

        // Verify token hasn't expired
        if (run.tokenExpiresAt && new Date() > run.tokenExpiresAt) {
            return res.status(401).json({ error: "Run token has expired" });
        }

        // Construct Server-Side Payload from actual database records
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const values = await db.query.stepValues.findMany({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            where: eq(require('@shared/schema').stepValues.runId, run.id)
        });

        const serverPayload = values.reduce((acc, curr) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            acc[curr.stepId] = curr.value;
            return acc;
        }, {} as Record<string, unknown>);

        // Trigger Webhook
        if (workflow.projectId) {
            await WebhookDispatcher.dispatch(workflow.projectId, 'run.completed', {
                event: 'run.completed',
                workflowId: workflow.id,
                runId: run.id,
                data: serverPayload,
                timestamp: new Date().toISOString()
            });
        }

        res.json({ status: "completed" });
    } catch (error) {
        logger.error({ err: error, slug }, "Public complete error");
        res.status(500).json({ error: "Internal Server Error" });
    }
}));

export default router;
