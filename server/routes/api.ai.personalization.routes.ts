
import { eq } from "drizzle-orm";
import { Router } from "express";

import { userPersonalizationSettings, workflowPersonalizationSettings, workflows } from "../../shared/schema";
import { db } from "../db";
import { personalizationService } from "../lib/ai/personalization";
import { createLogger } from '../logger';
import { hybridAuth } from "../middleware/auth";
import { requireAssetAccess } from "../utils/ownershipAccess";
import { asyncHandler } from '../utils/asyncHandler';

const logger = createLogger({ module: 'ai-personalization-routes' });

const router = Router();

// Middleware to get user settings
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- middleware signature requires any for Express compatibility
const getUserContext = asyncHandler(async (req: any, res: any, next: any) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req augmented
        const userId = req.user.id;
        // Get user-specific settings
        const [userSettings] = await db
            .select()
            .from(userPersonalizationSettings)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- userId validated by auth middleware
            .where(eq(userPersonalizationSettings.userId, userId))
            .limit(1);

        // Get workflow-specific settings if workflowId is present
        let workflowSettings: unknown = undefined;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Express req body
        if (req.body.workflowId !== null && req.body.workflowId !== undefined) {
            const workflowId = req.body.workflowId;
            const workflow = await db.query.workflows.findFirst({
                where: eq(workflows.id, workflowId)
            });
            
            if (workflow) {
                // Verify user has access to this workflow
                await requireAssetAccess(userId, workflow.ownerType, workflow.ownerUuid, 'workflow');
                
                const [ws] = await db
                    .select()
                    .from(workflowPersonalizationSettings)
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    .where(eq(workflowPersonalizationSettings.workflowId, workflowId))
                    .limit(1);
                workflowSettings = ws;
            }
        }

        // Default fallback if no settings found
        const defaultSettings = {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- userId validated by auth middleware
            userId: userId,
            readingLevel: 'standard' as const,
            tone: 'neutral' as const,
            verbosity: 'standard' as const,
            language: 'en',
            allowAdaptivePrompts: true,
            allowAIClarification: true
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Express req augmented
        req.personalizationContext = {
            userSettings: userSettings ?? defaultSettings,
            workflowSettings,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
            userAnswers: req.body.userAnswers
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Express middleware signature
        next();
    } catch (error) {
        logger.error({ error }, "Personalization Context Error");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Express response
        res.status(500).json({ error: "Failed to load personalization context" });
    }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with personalizationContext
router.post("/block", hybridAuth, getUserContext, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
        const { block } = req.body;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Express req body validated
        if (block?.text === null || block?.text === undefined) {
            res.status(400).json({ error: "Block data required" });
            return;
        }

        const rewrittenText = await personalizationService.rewriteBlockText(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Express req body validated
            block.text,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- middleware sets personalizationContext
            req.personalizationContext
        );

        res.json({ text: rewrittenText });
    } catch (error) {
        logger.error({ error }, "Personalization Block Error");
        res.status(500).json({ error: "Personalization failed", details: error instanceof Error ? error.message : String(error) });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with personalizationContext
router.post("/help", hybridAuth, getUserContext, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
        const { text } = req.body;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Express req body validated
        if (text === null || text === undefined) {
            res.status(400).json({ error: "Text required" });
            return;
        }

        const helpText = await personalizationService.generateHelpText(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Express req body validated
            text,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- middleware sets personalizationContext
            req.personalizationContext
        );

        res.json({ text: helpText });
    } catch (error) {
        logger.error({ error }, "Personalization Help Error");
        res.status(500).json({ error: "Help generation failed", details: error instanceof Error ? error.message : String(error) });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with personalizationContext
router.post("/clarify", hybridAuth, getUserContext, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
        const { question, answer } = req.body;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Express req body validated
        if (question === null || question === undefined || answer === null || answer === undefined) {
            res.status(400).json({ error: "Question and answer required" });
            return;
        }

        const clarification = await personalizationService.generateClarification(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Express req body validated
            question,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Express req body validated
            answer,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- middleware sets personalizationContext
            req.personalizationContext
        );

        res.json({ clarification });
    } catch (error) {
        logger.error({ error }, "Personalization Clarify Error");
        res.status(500).json({ error: "Clarification generation failed", details: error instanceof Error ? error.message : String(error) });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with personalizationContext
router.post("/followup", hybridAuth, getUserContext, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
        const { question, answer } = req.body;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Express req body and middleware
        const result = await personalizationService.generateFollowUp(question, answer, req.personalizationContext);
        res.json({ followup: result });
    } catch (error) {
        logger.error({ error }, "Personalization Followup Error");
        res.status(500).json({ error: "Followup generation failed", details: error instanceof Error ? error.message : String(error) });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with personalizationContext
router.post("/translate", hybridAuth, getUserContext, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
        const { text, targetLanguage } = req.body;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Express req body validated
        if (text === null || text === undefined || targetLanguage === null || targetLanguage === undefined) {
            res.status(400).json({ error: "Text and targetLanguage required" });
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-argument -- Express req body validated
        const translated = await personalizationService.translateText(text, targetLanguage);
        res.json({ text: translated });
    } catch (error) {
        logger.error({ error }, "Personalization Translate Error");
        res.status(500).json({ error: "Translation failed", details: error instanceof Error ? error.message : String(error) });
    }
}));

// Settings Management
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with user
router.get("/settings", hybridAuth, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- auth middleware sets user
        const [settings] = await db.select().from(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, req.user.id)).limit(1);
        res.json({ settings });
    } catch (err) {
        logger.error({ error: err }, "Personalization Settings Fetch Error");
        res.status(500).json({ error: "Failed to fetch settings", details: err instanceof Error ? err.message : String(err) });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with user
router.post("/settings", hybridAuth, asyncHandler(async (req: any, res) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req body
        const settings = req.body;
        // Upsert
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Express req body validated by Drizzle schema
        await db.insert(userPersonalizationSettings).values({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req body validated
            ...settings,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- auth middleware sets user
            userId: req.user.id
        }).onConflictDoUpdate({
            target: userPersonalizationSettings.userId,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req body validated
            set: settings
        });
        res.json({ success: true });
    } catch (err) {
        logger.error({ error: err }, "Personalization Settings Save Error");
        res.status(500).json({ error: "Failed to save settings", details: err instanceof Error ? err.message : String(err) });
    }
}));

export default router;
