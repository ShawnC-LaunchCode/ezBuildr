import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { logger } from "../logger";
import { authService } from "../services/AuthService";
import { portalAuthService } from "../services/PortalAuthService";
import { portalService } from "../services/PortalService";


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
        const email = req.body?.email || 'unknown';
        return `${req.ip || 'unknown'}:${email}`;
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

// Middleware to check portal token (Bearer Auth)
const requirePortalAuth = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    try {
        const { email } = authService.verifyPortalToken(token);
        (req as any).portalEmail = email;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
};

/**
 * GET /api/portal/auth/csrf-token
 * Deprecated: CSRF removed in favor of Mutation-Strict Bearer Auth
 */
router.get("/auth/csrf-token", (req, res) => {
    res.json({ csrfToken: "deprecated-no-csrf-needed" });
});

/**
 * POST /api/portal/auth/send
 * Send a magic link to the provided email
 */
router.post("/auth/send", ipLimiter, magicLinkLimiter, async (req, res) => {
    try {
        const { email } = sendMagicLinkSchema.parse(req.body);

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
});

/**
 * POST /api/portal/auth/verify
 * Verify a magic link token and return a JWT
 */
router.post("/auth/verify", async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {return res.status(400).json({ error: "Token required" });}

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
});

/**
 * POST /api/portal/auth/logout
 * Stateless - client discards token
 */
router.post("/auth/logout", (req, res) => {
    res.json({ success: true });
});

/**
 * GET /api/portal/runs
 * List runs for the authenticated user
 */
router.get("/runs", requirePortalAuth, async (req, res) => {
    try {
        const email = (req as any).portalEmail;
        const runs = await portalService.listRunsForEmail(email);
        res.json(runs);
    } catch (error) {
        logger.error({ error }, "Error listing portal runs");
        res.status(500).json({ error: "Failed to list runs" });
    }
});

/**
 * GET /api/portal/me
 * Get current portal user
 */
router.get("/me", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            const { email } = authService.verifyPortalToken(token);
            return res.json({ authenticated: true, email });
        } catch {
            // Invalid token
        }
    }
    res.json({ authenticated: false });
});

export default router;
