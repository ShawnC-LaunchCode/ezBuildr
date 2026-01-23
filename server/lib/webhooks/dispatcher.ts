import { eq, and } from "drizzle-orm";
import { webhookSubscriptions, webhookEvents } from "@shared/schema";
import { db } from "../../db";
// import fetch from "node-fetch"; // Node 18+ has built-in fetch
export class WebhookDispatcher {
    /**
     * Dispatch an event to all subscribed listeners in a workspace
     */
    static async dispatch(workspaceId: string, event: string, payload: any) {
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
            const relevantSubs = subs.filter((sub: any) => {
                const events = sub.events as string[];
                return events.includes(event) || events.includes('*');
            });
            if (relevantSubs.length === 0) { return; }
            // 2. Create Delivery Events
            for (const sub of relevantSubs) {
                // Insert event log
                const [eventRecord] = await db.insert(webhookEvents).values({
                    subscriptionId: sub.id,
                    event,
                    payload,
                    status: 'pending'
                }).returning();
                // 3. Trigger Async Delivery (Fire and forget or queue)
                void this.deliver(eventRecord.id, sub.targetUrl, sub.secret, event, payload);
            }
        } catch (err) {
            console.error("Webhook Dispatch Error", err);
        }
    }
    /**
     * Deliver a single webhook event
     */
    static async deliver(eventId: string, url: string, secret: string, event: string, payload: any) {
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
            console.error(`Webhook Delivery Failed to ${url}`, err);
            // Update status failed
            await db.update(webhookEvents)
                .set({ status: 'failed', lastAttemptAt: new Date(), attempts: 1 })
                .where(eq(webhookEvents.id, eventId));
        }
    }
    static signPayload(payload: any, secret: string): string {
        const crypto = require('crypto');
        return crypto.createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }
}