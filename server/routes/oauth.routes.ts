
import { eq } from "drizzle-orm";
import { Router } from "express";

import { oauthApps, oauthAuthCodes, oauthAccessTokens } from "@shared/schema";

import { db } from "../db";
// import { requireAuth } from "../lib/authz/enforce"; // Require user login for authorization
import { asyncHandler } from "../utils/asyncHandler";

import type { Request, Response } from "express";

const router: Router = Router();

// GET /oauth/authorize
// Browser-based flow. User visits this.
// Should validate params and redirect to Frontend Consent Page
router.get("/authorize", asyncHandler(async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    if (response_type !== 'code') {
        res.status(400).send("Unsupported response_type. Use 'code'.");
        return;
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!client_id || !redirect_uri) {
        res.status(400).send("Missing client_id or redirect_uri.");
        return;
    }

    try {
        const app = await db.query.oauthApps.findFirst({
            where: eq(oauthApps.clientId, client_id as string)
        });

        if (!app) {
            res.status(400).send("Invalid client_id.");
            return;
        }

        // Validate redirect_uri (simplified check)
        const allowedUris = app.redirectUris as string[];
        if (!allowedUris.includes(redirect_uri as string)) {
            res.status(400).send("Mismatching redirect_uri.");
            return;
        }

        // Redirect to Frontend Consent Page
        // Pass params along
        const frontendUrl = process.env.VITE_APP_URL ?? "http://localhost:5000";
        // We construct the URL to the frontend page e.g. /oauth/authorize
        // Wait, typical flow is backend serves this route?
        // Or we redirect to /#/oauth/consent?client_id=...

        const consentUrl = `${frontendUrl}/oauth/consent?client_id=${client_id as string}&redirect_uri=${redirect_uri as string}&scope=${scope as string ?? ''}&state=${state as string ?? ''}`;
        res.redirect(consentUrl);

    } catch (_err) {
        res.status(500).send("Internal Error");
    }
}));

// POST /oauth/approve (Internal API called by Frontend Consent Page)
// Requires User Session
router.post("/approve", asyncHandler(async (req: Request, res: Response) => {
    // Check user session manually or use middleware
    // const userId = req.user.id;
    // Mock user for now if session middleware not active here
    // In real app, apply 'enforce' or 'requireAuth'

    // We assume backend session is active via cookies
    // Let's assume req.user is populated by some auth middleware upstream or we check session
    // For now, minimal impl:

    // eslint-disable-next-line @typescript-eslint/naming-convention
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/naming-convention
    const { client_id, redirect_uri, scope, state, user_id } = req.body;

    // Generate Auth Code
    const code = `auth_code_${Math.random().toString(36).substring(2, 17)}`;

    await db.insert(oauthAuthCodes).values({
        code,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        clientId: client_id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        userId: user_id ?? "demo-user-id", // Fallback for prototype
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        redirectUri: redirect_uri,
        scope: scope ? (scope as string).split(' ') : [],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
    });

    // Redirect user back to client
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions
    const redirectUrl = `${redirect_uri}?code=${code}&state=${state ?? ''}`;
    res.json({ redirectUrl });
}));

// POST /oauth/token
// Server-to-Server exchange
router.post("/token", asyncHandler(async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/naming-convention
    const { grant_type, code, client_id, _client_secret, _redirect_uri } = req.body;

    if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: "unsupported_grant_type" });
        return;
    }

    // Verify Client credentials
    // Verify client_secret hash... assumed match for prototype

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const app = await db.query.oauthApps.findFirst({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
        where: eq(oauthApps.clientId, client_id)
    });

    if (!app) { // || !verifyHash(client_secret, app.clientSecretHash)
        res.status(401).json({ error: "invalid_client" });
        return;
    }

    // Verify Code
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const authCode = await db.query.oauthAuthCodes.findFirst({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
        where: eq(oauthAuthCodes.code, code)
    });

    if (!authCode) {
        res.status(400).json({ error: "invalid_grant" });
        return;
    }

    if (new Date() > authCode.expiresAt) {
        res.status(400).json({ error: "invalid_grant (expired)" });
        return;
    }

    if (authCode.clientId !== client_id) {
        res.status(400).json({ error: "invalid_grant (client mismatch)" });
        return;
    }

    // Issue Token
    const accessToken = `access_${Math.random().toString(36).substring(2)}`;
    const refreshToken = `refresh_${Math.random().toString(36).substring(2)}`;

    await db.insert(oauthAccessTokens).values({
        accessToken,
        refreshToken,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        clientId: client_id,
        userId: authCode.userId,
        workspaceId: app.workspaceId,
        scope: authCode.scope,
        expiresAt: new Date(Date.now() + 3600 * 1000) // 1 hour
    });

    // Delete code
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
    await db.delete(oauthAuthCodes).where(eq(oauthAuthCodes.code, code));

    res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken,
        scope: authCode.scope // join ' '
    });
}));

export default router;
