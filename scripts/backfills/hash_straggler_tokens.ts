import { eq } from 'drizzle-orm';
import { db } from '../../server/db';
import {
    organizationInvites,
    signatureRequests,
    webhookSubscriptions
} from '../../shared/schema';
import { hashToken, encrypt } from '../../server/utils/encryption';

async function main() {
    console.log("Starting straggler tokens backfill...");

    // 1. Organization Invites
    console.log("Hashing organization invite tokens...");
    const invites = await db.select({ id: organizationInvites.id, token: organizationInvites.token }).from(organizationInvites);
    let inviteCount = 0;
    for (const invite of invites) {
        if (invite.token.length !== 64) { // SHA-256 hex is 64 chars
            const hashed = hashToken(invite.token);
            await db.update(organizationInvites).set({ token: hashed }).where(eq(organizationInvites.id, invite.id));
            inviteCount++;
        }
    }
    console.log(`Updated ${inviteCount} organization invites.`);

    // 2. Signature Requests
    console.log("Hashing signature request tokens...");
    const requests = await db.select({ id: signatureRequests.id, token: signatureRequests.token }).from(signatureRequests);
    let requestCount = 0;
    for (const request of requests) {
        if (request.token.length !== 64) {
            const hashed = hashToken(request.token);
            await db.update(signatureRequests).set({ token: hashed }).where(eq(signatureRequests.id, request.id));
            requestCount++;
        }
    }
    console.log(`Updated ${requestCount} signature requests.`);

    // NOTE: OAuth auth codes and access tokens are stored hash-only
    // (oauth_auth_codes.code_hash / oauth_access_tokens.access_token_hash) — the
    // columns were migrated by rename, so there is no in-place plaintext to
    // backfill for those tables. Nothing to do here.

    // 3. Webhook Secrets
    console.log("Encrypting webhook secrets...");
    const webhooks = await db.select({ id: webhookSubscriptions.id, secret: webhookSubscriptions.secret }).from(webhookSubscriptions);
    let webhookCount = 0;
    for (const webhook of webhooks) {
        if (!webhook.secret.includes('=')) {
            const encrypted = encrypt(webhook.secret);
            await db.update(webhookSubscriptions).set({ secret: encrypted }).where(eq(webhookSubscriptions.id, webhook.id));
            webhookCount++;
        }
    }
    console.log(`Updated ${webhookCount} webhook secrets.`);

    console.log("Backfill complete!");
    process.exit(0);
}

main().catch(err => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
