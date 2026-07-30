/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { eq, and, gt } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { invalidatedTokens } from "@shared/schema/auth";

import { db } from "../db";
import { logger } from "../logger";
import { authService } from "../services/AuthService";
import { portalAuthService } from "../services/PortalAuthService";
import { portalService } from "../services/PortalService";
import { asyncHandler } from "../utils/asyncHandler";


const router = Router();

// SECURITY FIX: Rate limiting for magic link generation
const magicLinkLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // Limit to 3 requests per 15 minutes per IP+email
    message: { error: "Too many magic link requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req, _res) => {
        const emailRaw = String(req.body?.email ?? 'unknown');
        const email = emailRaw.toLowerCase().split('@').map((p, i) => i === 0 ? p.split('+')[0] : p).join('@');
        return `${req.ip ?? 'unknown'}:${email}`;
    },
    validate: false,
});

// IP-based rate limit to prevent mass enumeration
const ipLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Max 10 magic links per hour per IP
    message: { error: "Too many requests from this IP address." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Validation Schemas
const sendMagicLinkSchema = z.object({
    email: z.string().email(),
});
const portalRunParamsSchema = z.object({
    runId: z.string().uuid(),
});

// Middleware to check portal token (Bearer Auth)

const requirePortalAuth = asyncHandler(async (req: Request, res: Response, next: (...args: unknown[]) => unknown) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    
    // Check DB for invalidated token
    const revoked = await db.query.invalidatedTokens.findFirst({
        where: and(eq(invalidatedTokens.token, token), gt(invalidatedTokens.expiresAt, new Date()))
    });
    
    if (revoked) {
        return res.status(401).json({ error: "Token has been invalidated" });
    }

    try {
        const { email } = authService.verifyPortalToken(token);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express augmentation for portal auth
        (req as any).portalEmail = email;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
});

/**
 * GET /api/portal/auth/csrf-token
 * Deprecated: CSRF removed in favor of Mutation-Strict Bearer Auth
 */
router.get("/auth/csrf-token", (req, res) => {
    res.status(410).json({ error: "endpoint_deprecated", message: "CSRF protection has been migrated to stateless Bearer tokens" });
});

/**
 * POST /api/portal/auth/send
 * Send a magic link to the provided email
 */
router.post("/auth/send", ipLimiter, magicLinkLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
        const { email: rawEmail } = sendMagicLinkSchema.parse(req.body);
        const email = rawEmail.toLowerCase().split('@').map((p, i) => i === 0 ? p.split('+')[0] : p).join('@');

        // Add artificial delay to prevent timing-based enumeration
        await new Promise(resolve => setTimeout(resolve, 500));

        await portalAuthService.sendMagicLink(email);

        // Return same response whether email exists or not (prevent enumeration)
        res.json({
            success: true,
            message: "If this email is registered, you will receive a magic link."
        });
    } catch (error) {
        logger.error({ error }, "Error sending magic link");
        res.status(400).json({ error: "Invalid request" });
    }
}));

/**
 * POST /api/portal/auth/verify
 * Verify a magic link token and return a JWT
 */
router.post("/auth/verify", asyncHandler(async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) { return res.status(400).json({ error: "Token required" }); }

        const user = await portalAuthService.verifyMagicLink(token);
        if (!user) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        // Generate Stateless Portal Token
        const portalToken = authService.createPortalToken(user.email);

        res.json({ success: true, email: user.email, token: portalToken });
    } catch (error) {
        logger.error({ error }, "Error verifying token");
        res.status(500).json({ error: "Verification failed" });
    }
}));

/**
 * POST /api/portal/auth/logout
 * Stateless - client discards token
 */
router.post("/auth/logout", asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.decode(token) as { exp?: number } | null;
            const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24*60*60*1000);
            await db.insert(invalidatedTokens).values({ token, expiresAt }).onConflictDoNothing();
        } catch (e) {
            // Ignore errors
        }
    }
    res.json({ success: true });
}));

/**
 * GET /api/portal/runs
 * List runs for the authenticated user
 */
router.get("/runs", requirePortalAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express augmentation for portal auth
        const email = (req as any).portalEmail;
        const runs = await portalService.listRunsForEmail(email);
        res.json(runs);
    } catch (error) {
        logger.error({ error }, "Error listing portal runs");
        res.status(500).json({ error: "Failed to list runs" });
    }
}));

router.post("/runs/:runId/access-token", requirePortalAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
        const { runId } = portalRunParamsSchema.parse(req.params);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express augmentation for portal auth
        const email = String((req as any).portalEmail);
        const access = await portalService.issueRunAccessToken(runId, email);
        res.json({ success: true, data: access });
    } catch (error) {
        logger.error({ error, runId: req.params.runId }, "Error issuing portal run access");
        res.status(404).json({ success: false, error: "Run not found" });
    }
}));

/**
 * GET /api/portal/me
 * Get current portal user
 */
router.get("/me", asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const revoked = await db.query.invalidatedTokens.findFirst({
            where: and(eq(invalidatedTokens.token, token), gt(invalidatedTokens.expiresAt, new Date()))
        });
        if (!revoked) {
            try {
                const { email } = authService.verifyPortalToken(token);
                return res.json({ authenticated: true, email });
            } catch {
                // Ignore and fall through to false
            }
        }
    }
    res.json({ authenticated: false });
}));

export default router;
