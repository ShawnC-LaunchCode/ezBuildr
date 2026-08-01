
import crypto from "crypto";

import { eq, and } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { webhookSubscriptions } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { requireExternalAuth, ExternalAuthRequest } from "../lib/authz/externalAuth";
import { asyncHandler } from "../utils/asyncHandler";
import { encrypt, decrypt } from "../utils/encryption";
import { validateSafeUrl } from "../utils/ssrfValidator";

function tryDecrypt(value: string): string {
    try {
        return decrypt(value);
    } catch {
        return value;
    }
}

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

type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
type WebhookSubscriptionUpdate = Partial<Pick<typeof webhookSubscriptions.$inferInsert, "targetUrl" | "events" | "enabled">>;

const webhookCreateSchema = z.object({
    url: z.string().url(),
    events: z.array(z.string()).min(1),
    secret: z.string().min(1).optional(),
});

const webhookUpdateSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(z.string()).min(1).optional(),
    enabled: z.boolean().optional(),
});

function firstSubscription(rows: WebhookSubscription[]): WebhookSubscription | undefined {
    return rows.length > 0 ? rows[0] : undefined;
}

// GET /api/webhooks
router.get("/", asyncHandler(async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;
        const subs = await db.query.webhookSubscriptions.findMany({
            where: eq(webhookSubscriptions.workspaceId, workspaceId)
        });
        const decryptedSubs = subs.map(sub => ({
            ...sub,
            secret: tryDecrypt(sub.secret)
        }));
        res.json({ data: decryptedSubs });
    } catch (err) {
        res.status(500).json({ error: "Internal Error" });
    }
}));

// POST /api/webhooks
router.post("/", asyncHandler(async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;
        const { url, events, secret } = webhookCreateSchema.parse(req.body);

        const isSafe = await validateSafeUrl(url);
        if (!isSafe) {
            return res.status(400).json({ error: "Invalid or unsafe webhook URL" });
        }

        const [sub] = await db.insert(webhookSubscriptions).values({
            workspaceId,
            targetUrl: url,
            events,
            secret: encrypt(secret ?? generateWebhookSecret()),
            enabled: true
        }).returning();

        res.json({ data: { ...sub, secret: tryDecrypt(sub.secret) } });

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

// PATCH /api/webhooks/:id
router.patch("/:id", asyncHandler(async (req: ExternalAuthRequest, res) => {
    try {
        const workspaceId = req.externalAuth!.workspaceId;
        const { id } = req.params;
        const { url, events, enabled } = webhookUpdateSchema.parse(req.body);

        if (url !== undefined) {
            const isSafe = await validateSafeUrl(url);
            if (!isSafe) {
                return res.status(400).json({ error: "Invalid or unsafe webhook URL" });
            }
        }

        const updateData: WebhookSubscriptionUpdate = {};
        if (url !== undefined) {updateData.targetUrl = url;}
        if (events !== undefined) {updateData.events = events;}
        if (enabled !== undefined) {updateData.enabled = enabled;}

        const updatedRows = await db.update(webhookSubscriptions)
            .set(updateData)
            .where(and(
                eq(webhookSubscriptions.id, id),
                eq(webhookSubscriptions.workspaceId, workspaceId)
            ))
            .returning();
        const sub = firstSubscription(updatedRows);

        if (sub === undefined) {
            return res.status(404).json({ error: "Webhook not found" });
        }

        res.json({ data: { ...sub, secret: tryDecrypt(sub.secret) } });
    } catch (err) {
        res.status(500).json({ error: "Internal Error" });
    }
}));

export default router;
