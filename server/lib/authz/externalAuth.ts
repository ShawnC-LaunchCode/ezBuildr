
import { eq } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import { oauthAccessTokens, apiKeys } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";
import { hashToken, verifyToken } from "../../utils/encryption";

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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function requireExternalAuth(req: ExternalAuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    if (authHeader?.startsWith('Bearer ')) {
        // OAuth Flow
        const token = authHeader.split(' ')[1];
        try {
            const tokenHash = hashToken(token);
            const accessToken = await db.query.oauthAccessTokens.findFirst({
                where: eq(oauthAccessTokens.accessTokenHash, tokenHash)
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
                userId: accessToken.userId ?? undefined
            };
            return next();

        } catch (err) {
            logger.error({ err }, "OAuth auth error");
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

            // SECURITY: verify the presented key against the stored SHA-256 hash using a
            // constant-time comparison. Previously this did a plaintext `keyHash !== apiKeyHeader`
            // check, which both assumed the raw key was stored (defeating hashing-at-rest) and
            // leaked timing information. keyHash must store hashToken(fullKey).
            if (!verifyToken(apiKeyHeader, keyRecord.keyHash)) {
                return res.status(401).json({ error: "Invalid API Key Credentials" });
            }

             // Update last used (async, don't await)
             // eslint-disable-next-line @typescript-eslint/no-floating-promises
             /* await */ db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyRecord.id));

            req.externalAuth = {
                type: 'api_key',
                workspaceId: (keyRecord as Record<string, unknown>).workspaceId as string,
                scopes: keyRecord.scopes,
                apiKeyId: keyRecord.id
            };
            return next();

        } catch (err) {
            logger.error({ err }, "API key auth error");
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    return res.status(401).json({ error: "Unauthorized: Missing API Key or OAuth Token" });
}
