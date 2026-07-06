
import crypto from "crypto";

import { eq, and } from "drizzle-orm";
import { Router } from "express";

import { webhookSubscriptions } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { requireExternalAuth, ExternalAuthRequest } from "../lib/authz/externalAuth";
import { asyncHandler } from "../utils/asyncHandler";
import { validateSafeUrl } from "../utils/ssrfValidator";

/**
 * Generate a cryptographically secure webhook signing secret.
 * (Previously used Math.random(), which is non-cryptographic and low-entropy.)
 */
function generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

const router = Router();
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.use(requireExternalAuth);

// GET /api/webhooks
router.get("/", asyncHandler(async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;
        const subs = await db.query.webhookSubscriptions.findMany({
            where: eq(webhookSubscriptions.workspaceId, workspaceId)
        });
        res.json({ data: subs });
    } catch (err) {
        res.status(500).json({ error: "Internal Error" });
    }
}));

// POST /api/webhooks
router.post("/", asyncHandler(async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { url, events, secret } = req.body;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!url || !events) {
            return res.status(400).json({ error: "Missing url or events" });
        }

        const isSafe = await validateSafeUrl(url as string);
        if (!isSafe) {
            return res.status(400).json({ error: "Invalid or unsafe webhook URL" });
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const [sub] = await db.insert(webhookSubscriptions).values({
            workspaceId,
            targetUrl: url, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            events: events, // array // eslint-disable-line @typescript-eslint/no-unsafe-assignment
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/strict-boolean-expressions
            secret: secret || generateWebhookSecret(),
            enabled: true
        }).returning();

        res.json({ data: sub });

    } catch (err) {
        logger.error({ err }, "Webhook subscription creation error");
        res.status(500).json({ error: "Internal Error" });
    }
}));

// DELETE /api/webhooks/:id
router.delete("/:id", asyncHandler(async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;
        const { id } = req.params;

        await db.delete(webhookSubscriptions).where(and(
            eq(webhookSubscriptions.id, id),
            eq(webhookSubscriptions.workspaceId, workspaceId)
        ));

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Internal Error" });
    }
}));

export default router;
