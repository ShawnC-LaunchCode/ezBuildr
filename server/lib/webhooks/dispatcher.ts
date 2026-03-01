import crypto from "crypto";

import { eq, and } from "drizzle-orm";

import { webhookSubscriptions, webhookEvents } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";
export class WebhookDispatcher {
    /**
     * Dispatch an event to all subscribed listeners in a workspace
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    static async dispatch(workspaceId: string, event: string, payload: unknown) {
        try {
            // 1. Find Subscriptions
            // We need to match workspaceId and verify if 'event' is in the subscription's events array
            // Drizzle JSON array query is tricky. We'll fetch all for workspace and filter in memory for prototype.
            // Or assume SQL optimization later.
            const subs = await db.query.webhookSubscriptions.findMany({
                where: and(
                    eq(webhookSubscriptions.workspaceId, workspaceId),
                    eq(webhookSubscriptions.enabled, true)
                )
            });
            // Filter relevant subs
            const relevantSubs = subs.filter((sub) => {
                const events = sub.events as string[];
                return events.includes(event) || events.includes('*');
            });
            if (relevantSubs.length === 0) { return; }
            // 2. Create Delivery Events (batch insert)
            const insertedEvents = await db.insert(webhookEvents)
                .values(relevantSubs.map(sub => ({
                    subscriptionId: sub.id,
                    event,
                    payload,
                    status: 'pending' as const,
                })))
                .returning();
            // Map by subscriptionId for pairing
            const eventBySub = new Map(insertedEvents.map(e => [e.subscriptionId, e]));
            // 3. Trigger Async Delivery (Fire and forget or queue)
            for (const sub of relevantSubs) {
                const eventRecord = eventBySub.get(sub.id);
                if (eventRecord) {
                    void this.deliver(eventRecord.id, sub.targetUrl, sub.secret, event, payload);
                }
            }
        } catch (err) {
            logger.error({ err, workspaceId, event }, "Webhook dispatch error");
        }
    }
    /**
     * Deliver a single webhook event
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    static async deliver(eventId: string, url: string, secret: string, event: string, payload: unknown) {
        try {
            // Sign payload
            const signature = this.signPayload(payload, secret);
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-ezBuildr-Event': event,
                    'X-ezBuildr-Signature': signature
                },
                body: JSON.stringify(payload)
            });
            const status = res.ok ? 'success' : 'failed';
            // Update status
            await db.update(webhookEvents)
                .set({ status, lastAttemptAt: new Date(), attempts: 1 })
                .where(eq(webhookEvents.id, eventId));
        } catch (err) {
            logger.error({ err, url, eventId }, "Webhook delivery failed");
            // Update status failed
            await db.update(webhookEvents)
                .set({ status: 'failed', lastAttemptAt: new Date(), attempts: 1 })
                .where(eq(webhookEvents.id, eventId));
        }
    }
    static signPayload(payload: unknown, secret: string): string {
        return crypto.createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }
}