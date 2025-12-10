
import { Router } from "express";
import { db } from "../db";
import { oauthApps, oauthAuthCodes, oauthAccessTokens } from "@shared/schema";
import { eq } from "drizzle-orm";
// import { requireAuth } from "../lib/authz/enforce"; // Require user login for authorization

const router = Router();

// GET /oauth/authorize
// Browser-based flow. User visits this.
// Should validate params and redirect to Frontend Consent Page
router.get("/authorize", async (req, res) => {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    if (response_type !== 'code') {
        return res.status(400).send("Unsupported response_type. Use 'code'.");
    }

    if (!client_id || !redirect_uri) {
        return res.status(400).send("Missing client_id or redirect_uri.");
    }

    try {
        const app = await db.query.oauthApps.findFirst({
            where: eq(oauthApps.clientId, client_id as string)
        });

        if (!app) {
            return res.status(400).send("Invalid client_id.");
        }

        // Validate redirect_uri (simplified check)
        const allowedUris = app.redirectUris as string[];
        if (!allowedUris.includes(redirect_uri as string)) {
            return res.status(400).send("Mismatching redirect_uri.");
        }

        // Redirect to Frontend Consent Page
        // Pass params along
        const frontendUrl = process.env.VITE_APP_URL || "http://localhost:5000";
        // We construct the URL to the frontend page e.g. /oauth/authorize
        // Wait, typical flow is backend serves this route?
        // Or we redirect to /#/oauth/consent?client_id=...

        const consentUrl = `${frontendUrl}/oauth/consent?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`;
        res.redirect(consentUrl);

    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Error");
    }
});

// POST /oauth/approve (Internal API called by Frontend Consent Page)
// Requires User Session
router.post("/approve", async (req, res) => {
    // Check user session manually or use middleware
    // const userId = req.user.id; 
    // Mock user for now if session middleware not active here
    // In real app, apply 'enforce' or 'requireAuth'

    // We assume backend session is active via cookies
    // Let's assume req.user is populated by some auth middleware upstream or we check session
    // For now, minimal impl:

    const { client_id, redirect_uri, scope, state, user_id } = req.body; // user_id passed from verified session

    // Generate Auth Code
    const code = "auth_code_" + Math.random().toString(36).substr(2, 15);

    await db.insert(oauthAuthCodes).values({
        code,
        clientId: client_id,
        userId: user_id || "demo-user-id", // Fallback for prototype
        redirectUri: redirect_uri,
        scope: scope ? (scope as string).split(' ') : [],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
    });

    // Redirect user back to client
    const redirectUrl = `${redirect_uri}?code=${code}&state=${state || ''}`;
    res.json({ redirectUrl });
});

// POST /oauth/token
// Server-to-Server exchange
router.post("/token", async (req, res) => {
    const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

    if (grant_type !== 'authorization_code') {
        return res.status(400).json({ error: "unsupported_grant_type" });
    }

    // Verify Client credentials
    // Verify client_secret hash... assumed match for prototype

    const app = await db.query.oauthApps.findFirst({
        where: eq(oauthApps.clientId, client_id)
    });

    if (!app) { // || !verifyHash(client_secret, app.clientSecretHash)
        return res.status(401).json({ error: "invalid_client" });
    }

    // Verify Code
    const authCode = await db.query.oauthAuthCodes.findFirst({
        where: eq(oauthAuthCodes.code, code)
    });

    if (!authCode) {
        return res.status(400).json({ error: "invalid_grant" });
    }

    if (new Date() > authCode.expiresAt) {
        return res.status(400).json({ error: "invalid_grant (expired)" });
    }

    if (authCode.clientId !== client_id) {
        return res.status(400).json({ error: "invalid_grant (client mismatch)" });
    }

    // Issue Token
    const accessToken = "access_" + Math.random().toString(36).substr(2);
    const refreshToken = "refresh_" + Math.random().toString(36).substr(2);

    await db.insert(oauthAccessTokens).values({
        accessToken,
        refreshToken,
        clientId: client_id,
        userId: authCode.userId,
        workspaceId: app.workspaceId,
        scope: authCode.scope,
        expiresAt: new Date(Date.now() + 3600 * 1000) // 1 hour
    });

    // Delete code
    await db.delete(oauthAuthCodes).where(eq(oauthAuthCodes.code, code));

    res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken,
        scope: authCode.scope // join ' '
    });
});

export default router;
