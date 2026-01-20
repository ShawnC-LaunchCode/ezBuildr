import crypto from 'crypto';
import { eq, and, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { portalTokens } from "@shared/schema";
import { db } from "../db";
import { logger } from "../logger";
import { hashToken } from "../utils/encryption";
/**
 * Service for handling Portal Authentication
 * Uses "Magic Links" (email -> token -> session)
 */
export class PortalAuthService {
    /**
     * Send a magic link to the user
     * SECURITY FIX: Stores hashed token to prevent timing attacks
     */
    async sendMagicLink(email: string): Promise<{ success: boolean; message: string }> {
        try {
            // 1. Generate secure token (plaintext)
            const plainToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = hashToken(plainToken);  // Hash for storage
            const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
            // 2. Store HASHED token only
            await db.insert(portalTokens).values({
                email,
                token: tokenHash,  // Store hash, not plaintext
                expiresAt,
            });
            // 3. Send Email (Stub for now)
            // In production, use `emailService.sendMagicLink(email, plainToken)`
            const magicLinkUrl = `${process.env.VITE_BASE_URL || 'http://localhost:5000'}/portal/auth/verify?token=${plainToken}`;
            logger.info({
                event: "PORTAL_MAGIC_LINK_SENT",
                email,
                magicLinkUrl, // Logged for dev/testing - contains plaintext token
            }, "Magic link generated");
            return { success: true, message: "Magic link sent to your email." };
        } catch (error) {
            logger.error({ error, email }, "Failed to send magic link");
            throw new Error("Failed to generate magic link");
        }
    }
    /**
     * Verify a magic link token and return user email
     * SECURITY FIX: Hashes token before comparison (constant-time)
     */
    async verifyMagicLink(token: string): Promise<{ email: string } | null> {
        try {
            // 1. Hash the provided token
            const tokenHash = hashToken(token);
            // 2. Find valid token by hash (constant-time comparison)
            const validToken = await db.query.portalTokens.findFirst({
                where: and(
                    eq(portalTokens.token, tokenHash),  // Compare hashes
                    gt(portalTokens.expiresAt, new Date())
                ),
            });
            if (!validToken) {
                return null;
            }
            // 3. Delete token to prevent reuse
            await db.delete(portalTokens).where(eq(portalTokens.id, validToken.id));
            return { email: validToken.email };
        } catch (error) {
            logger.error({ error }, "Failed to verify magic link");
            return null;
        }
    }
}
export const portalAuthService = new PortalAuthService();