
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Router } from "express";

import { userPersonalizationSettings, workflowPersonalizationSettings, workflows } from "../../shared/schema";
import { db } from "../db";
import { personalizationService } from "../lib/ai/personalization";
import { createLogger } from '../logger';
import { hybridAuth } from "../middleware/auth";
import { requireAssetAccess } from "../utils/ownershipAccess";
import { asyncHandler } from '../utils/asyncHandler';
import { strictLimiter } from "../middleware/rateLimiter";

import type { Request } from "express";
import type { AuthRequest } from "../middleware/auth";
import type { UserPersonalizationSettings, WorkflowPersonalizationSettings } from "../../shared/schema";

const logger = createLogger({ module: 'ai-personalization-routes' });

const router = Router();

interface PersonalizationContext {
    userSettings: UserPersonalizationSettings;
    workflowSettings?: WorkflowPersonalizationSettings;
    userAnswers?: Record<string, unknown>;
}

interface PersonalizationRequest extends AuthRequest {
    user?: {
        id?: string;
    };
    personalizationContext?: PersonalizationContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequestBody(req: Request): Record<string, unknown> {
    const body = (req as { body: unknown }).body;
    return isRecord(body) ? body : {};
}

function getAuthenticatedUserId(req: Request): string {
    const authReq = req as PersonalizationRequest;
    const userId = authReq.user?.id ?? authReq.userId;
    if (userId === undefined || userId === "") {
        throw new Error("Authenticated user missing from request");
    }
    return userId;
}

function getAuthenticatedTenantId(req: Request): string {
    const tenantId = (req as PersonalizationRequest).tenantId;
    if (tenantId === undefined || tenantId === "") {
        throw new Error("Authenticated tenant missing from request");
    }
    return tenantId;
}

function getPersonalizationContext(req: Request): PersonalizationContext {
    const context = (req as PersonalizationRequest).personalizationContext;
    if (context === undefined) {
        throw new Error("Personalization context missing from request");
    }
    return context;
}

function setPersonalizationContext(req: Request, context: PersonalizationContext): void {
    (req as PersonalizationRequest).personalizationContext = context;
}

const BlockRequestSchema = z.object({
    block: z.object({
        text: z.string().min(1).max(10000)
    })
});

const HelpRequestSchema = z.object({
    text: z.string().min(1).max(5000)
});

const ClarifyFollowupRequestSchema = z.object({
    question: z.string().min(1).max(5000),
    answer: z.string().min(1).max(5000)
});

const TranslateRequestSchema = z.object({
    text: z.string().min(1).max(10000),
    targetLanguage: z.string().min(2).max(10)
});

// Middleware to get user settings
const getUserContext = asyncHandler(async (req, res, next) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const body = getRequestBody(req);
        // Get user-specific settings
        const [userSettings] = await db
            .select()
            .from(userPersonalizationSettings)
            .where(eq(userPersonalizationSettings.userId, userId))
            .limit(1);

        // Get workflow-specific settings if workflowId is present
        let workflowSettings: WorkflowPersonalizationSettings | undefined;
        const workflowId = body.workflowId;
        if (typeof workflowId === "string" && workflowId !== "") {
            const workflow = await db.query.workflows.findFirst({
                where: eq(workflows.id, workflowId)
            });
            
            if (workflow) {
                // Verify user has access to this workflow
                await requireAssetAccess(userId, workflow.ownerType, workflow.ownerUuid, 'workflow');
                
                const [ws] = await db
                    .select()
                    .from(workflowPersonalizationSettings)
                    .where(eq(workflowPersonalizationSettings.workflowId, workflowId))
                    .limit(1);
                workflowSettings = ws;
            }
        }

        // Default fallback if no settings found
        const defaultSettings = {
            userId: userId,
            readingLevel: 'standard' as const,
            tone: 'neutral' as const,
            verbosity: 'standard' as const,
            language: 'en',
            allowAdaptivePrompts: true,
            allowAIClarification: true
        };

        setPersonalizationContext(req, {
            userSettings: userSettings ?? defaultSettings,
            workflowSettings,
            userAnswers: isRecord(body.userAnswers) ? body.userAnswers : undefined
        });
        next();
    } catch (error) {
        logger.error({ error }, "Personalization Context Error");
        res.status(500).json({ error: "Failed to load personalization context" });
    }
});

router.post("/block", hybridAuth, strictLimiter, getUserContext, asyncHandler(async (req, res) => {
    try {
        const { block } = BlockRequestSchema.parse(getRequestBody(req));

        const rewrittenText = await personalizationService.rewriteBlockText(
            block.text,
            getPersonalizationContext(req),
            getAuthenticatedTenantId(req)
        );

        res.json({ text: rewrittenText });
    } catch (error) {
        logger.error({ error }, "Personalization Block Error");
        res.status(500).json({ error: "Personalization failed" });
    }
}));

router.post("/help", hybridAuth, strictLimiter, getUserContext, asyncHandler(async (req, res) => {
    try {
        const { text } = HelpRequestSchema.parse(getRequestBody(req));

        const helpText = await personalizationService.generateHelpText(
            text,
            getPersonalizationContext(req),
            getAuthenticatedTenantId(req)
        );

        res.json({ text: helpText });
    } catch (error) {
        logger.error({ error }, "Personalization Help Error");
        res.status(500).json({ error: "Help generation failed" });
    }
}));

router.post("/clarify", hybridAuth, strictLimiter, getUserContext, asyncHandler(async (req, res) => {
    try {
        const { question, answer } = ClarifyFollowupRequestSchema.parse(getRequestBody(req));

        const clarification = await personalizationService.generateClarification(
            question,
            answer,
            getPersonalizationContext(req),
            getAuthenticatedTenantId(req)
        );

        res.json({ clarification });
    } catch (error) {
        logger.error({ error }, "Personalization Clarify Error");
        res.status(500).json({ error: "Clarification generation failed" });
    }
}));

router.post("/followup", hybridAuth, strictLimiter, getUserContext, asyncHandler(async (req, res) => {
    try {
        const { question, answer } = ClarifyFollowupRequestSchema.parse(getRequestBody(req));
        const result = await personalizationService.generateFollowUp(
            question,
            answer,
            getPersonalizationContext(req),
            getAuthenticatedTenantId(req)
        );
        res.json({ followup: result });
    } catch (error) {
        logger.error({ error }, "Personalization Followup Error");
        res.status(500).json({ error: "Followup generation failed" });
    }
}));

router.post("/translate", hybridAuth, strictLimiter, getUserContext, asyncHandler(async (req, res) => {
    try {
        const { text, targetLanguage } = TranslateRequestSchema.parse(getRequestBody(req));

        const translated = await personalizationService.translateText(
            text,
            targetLanguage,
            getAuthenticatedTenantId(req)
        );
        res.json({ text: translated });
    } catch (error) {
        logger.error({ error }, "Personalization Translate Error");
        res.status(500).json({ error: "Translation failed" });
    }
}));

// Settings Management
router.get("/settings", hybridAuth, asyncHandler(async (req, res) => {
    try {
        const [settings] = await db.select().from(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, getAuthenticatedUserId(req))).limit(1);
        res.json({ settings });
    } catch (err) {
        logger.error({ error: err }, "Personalization Settings Fetch Error");
        res.status(500).json({ error: "Failed to fetch settings", details: err instanceof Error ? err.message : String(err) });
    }
}));

const settingsSchema = z.object({
    readingLevel: z.enum(["simple", "standard", "professional"]).optional(),
    tone: z.enum(["friendly", "neutral", "formal"]).optional(),
    verbosity: z.enum(["brief", "standard", "detailed"]).optional(),
    language: z.string().optional(),
    allowAdaptivePrompts: z.boolean().optional(),
    allowAIClarification: z.boolean().optional()
});

router.post("/settings", hybridAuth, asyncHandler(async (req, res) => {
    try {
        const parseResult = settingsSchema.safeParse(getRequestBody(req));
        if (!parseResult.success) {
            return res.status(400).json({ error: "Invalid settings format", details: parseResult.error });
        }
        
        const settings = parseResult.data;
        // Upsert
        await db.insert(userPersonalizationSettings).values({
            ...settings,
            userId: getAuthenticatedUserId(req)
        }).onConflictDoUpdate({
            target: userPersonalizationSettings.userId,
            set: settings
        });
        res.json({ success: true });
    } catch (err) {
        logger.error({ error: err }, "Personalization Settings Save Error");
        res.status(500).json({ error: "Failed to save settings", details: err instanceof Error ? err.message : String(err) });
    }
}));

export default router;
