import { sql, eq } from 'drizzle-orm';
import { db } from '../../server/db';
import {
    organizationInvites,
    signatureRequests,
    oauthAuthCodes,
    oauthAccessTokens,
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

    // 3. OAuth Auth Codes (if any)
    console.log("Hashing OAuth auth codes...");
    const authCodes = await db.select({ code: oauthAuthCodes.code }).from(oauthAuthCodes);
    let codeCount = 0;
    for (const authCode of authCodes) {
        if (authCode.code.length !== 64) {
            const hashed = hashToken(authCode.code);
            await db.execute(sql`UPDATE oauth_auth_codes SET code = ${hashed} WHERE code = ${authCode.code}`);
            codeCount++;
        }
    }
    console.log(`Updated ${codeCount} OAuth auth codes.`);

    // 4. OAuth Access Tokens (if any)
    console.log("Hashing OAuth access tokens...");
    const accessTokens = await db.select({ accessToken: oauthAccessTokens.accessToken, refreshToken: oauthAccessTokens.refreshToken }).from(oauthAccessTokens);
    let tokenCount = 0;
    for (const token of accessTokens) {
        let updated = false;
        let newAccess = token.accessToken;
        let newRefresh = token.refreshToken;

        if (token.accessToken.length !== 64) {
            newAccess = hashToken(token.accessToken);
            updated = true;
        }
        if (token.refreshToken && token.refreshToken.length !== 64) {
            newRefresh = hashToken(token.refreshToken);
            updated = true;
        }
        if (updated) {
            await db.execute(sql`
                UPDATE oauth_access_tokens 
                SET access_token = ${newAccess}, refresh_token = ${newRefresh} 
                WHERE access_token = ${token.accessToken}
            `);
            tokenCount++;
        }
    }
    console.log(`Updated ${tokenCount} OAuth access tokens.`);

    // 5. Webhook Secrets
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
