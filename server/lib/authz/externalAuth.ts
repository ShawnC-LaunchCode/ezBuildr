
import crypto from 'crypto';

import { eq } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import { oauthAccessTokens, apiKeys } from "@shared/schema";

import { db } from "../../db";
// import { verify } from "drizzle-orm/mysql-core"; // Not needed if manual compare
// Ideally use a crypto lib for generic hash compare if bcrypt was used. 
// Assuming simple string match for mock or using crypto for hash verification.

export interface ExternalAuthRequest extends Request {
    externalAuth?: {
        type: 'oauth' | 'api_key';
        workspaceId: string;
        scopes: string[];
        clientId?: string; // for oauth
        apiKeyId?: string; // for api key
        userId?: string; // for oauth (if user-context)
    }
}

export async function requireExternalAuth(req: ExternalAuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    if (authHeader?.startsWith('Bearer ')) {
        // OAuth Flow
        const token = authHeader.split(' ')[1];
        try {
            const accessToken = await db.query.oauthAccessTokens.findFirst({
                where: eq(oauthAccessTokens.accessToken, token)
            });

            if (!accessToken) {
                return res.status(401).json({ error: "Invalid Access Token" });
            }

            if (new Date() > accessToken.expiresAt) {
                return res.status(401).json({ error: "Access Token Expired" });
            }

            req.externalAuth = {
                type: 'oauth',
                workspaceId: accessToken.workspaceId,
                scopes: accessToken.scope as string[],
                clientId: accessToken.clientId,
                userId: accessToken.userId || undefined
            };
            return next();

        } catch (err) {
            console.error("OAuth Auth Error", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    } else if (apiKeyHeader) {
        // API Key Flow
        // Key format: vlk_live_PREFIX_SECRET
        if (!apiKeyHeader.startsWith('vlk_live_')) {
            return res.status(401).json({ error: "Invalid API Key Format" });
        }

        try {
            // Extract prefix (first 8 chars after vlk_live_)
            const prefix = apiKeyHeader.substring(9, 17); // simple slice

            const keyRecord = await db.query.apiKeys.findFirst({
                where: eq(apiKeys.prefix, prefix)
            });

            if (!keyRecord) {
                return res.status(401).json({ error: "Invalid API Key" });
            }

            // Verify Hash (Mock comparison for now)
            if (keyRecord.keyHash !== apiKeyHeader) {
                return res.status(401).json({ error: "Invalid API Key Credentials" });
            }

             // Update last used (async, don't await)
             /* await */ db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyRecord.id));

            req.externalAuth = {
                type: 'api_key',
                workspaceId: (keyRecord as any).workspaceId,
                scopes: keyRecord.scopes,
                apiKeyId: keyRecord.id
            };
            return next();

        } catch (err) {
            console.error("API Key Auth Error", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    return res.status(401).json({ error: "Unauthorized: Missing API Key or OAuth Token" });
}
