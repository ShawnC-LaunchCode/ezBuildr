
import { eq } from "drizzle-orm";
import { Router } from "express";

import { userPersonalizationSettings, workflowPersonalizationSettings } from "../../shared/schema";
import { db } from "../db";
import { personalizationService } from "../lib/ai/personalization";
import { hybridAuth } from "../middleware/auth";

const router = Router();

// Middleware to get user settings
const getUserContext = async (req: any, res: any, next: any) => {
    try {
        const userId = req.user.id;
        // Get user-specific settings
        const [userSettings] = await db
            .select()
            .from(userPersonalizationSettings)
            .where(eq(userPersonalizationSettings.userId, userId))
            .limit(1);

        // Get workflow-specific settings if workflowId is present
        let workflowSettings = undefined;
        if (req.body.workflowId) {
            const [ws] = await db
                .select()
                .from(workflowPersonalizationSettings)
                .where(eq(workflowPersonalizationSettings.workflowId, req.body.workflowId))
                .limit(1);
            workflowSettings = ws;
        }

        // Default fallback if no settings found
        const defaultSettings = {
            userId: userId,
            readingLevel: 'standard',
            tone: 'neutral',
            verbosity: 'standard',
            language: 'en',
            allowAdaptivePrompts: true,
            allowAIClarification: true
        };

        req.personalizationContext = {
            userSettings: userSettings || defaultSettings,
            workflowSettings,
            userAnswers: req.body.userAnswers
        };
        next();
    } catch (error) {
        console.error("Personalization Context Error:", error);
        res.status(500).json({ error: "Failed to load personalization context" });
    }
};

router.post("/block", hybridAuth, getUserContext, async (req: any, res) => {
    try {
        const { block } = req.body;
        if (!block?.text) { return res.status(400).json({ error: "Block data required" }); }

        const rewrittenText = await personalizationService.rewriteBlockText(
            block.text,
            req.personalizationContext
        );

        res.json({ text: rewrittenText });
    } catch (error) {
        console.error("Personalization Block Error:", error);
        res.status(500).json({ error: "Personalization failed", details: error instanceof Error ? error.message : String(error) });
    }
});

router.post("/help", hybridAuth, getUserContext, async (req: any, res) => {
    try {
        const { text } = req.body;
        if (!text) { return res.status(400).json({ error: "Text required" }); }

        const helpText = await personalizationService.generateHelpText(
            text,
            req.personalizationContext
        );

        res.json({ text: helpText });
    } catch (error) {
        console.error("Personalization Help Error:", error);
        res.status(500).json({ error: "Help generation failed", details: error instanceof Error ? error.message : String(error) });
    }
});

router.post("/clarify", hybridAuth, getUserContext, async (req: any, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) { return res.status(400).json({ error: "Question and answer required" }); }

        const clarification = await personalizationService.generateClarification(
            question,
            answer,
            req.personalizationContext
        );

        res.json({ clarification });
    } catch (error) {
        console.error("Personalization Clarify Error:", error);
        res.status(500).json({ error: "Clarification generation failed", details: error instanceof Error ? error.message : String(error) });
    }
});

router.post("/followup", hybridAuth, getUserContext, async (req: any, res) => {
    try {
        const { question, answer } = req.body;
        const result = await personalizationService.generateFollowUp(question, answer, req.personalizationContext);
        res.json({ followup: result });
    } catch (error) {
        console.error("Personalization Followup Error:", error);
        res.status(500).json({ error: "Followup generation failed", details: error instanceof Error ? error.message : String(error) });
    }
});

router.post("/translate", hybridAuth, getUserContext, async (req: any, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text || !targetLanguage) { return res.status(400).json({ error: "Text and targetLanguage required" }); }

        const translated = await personalizationService.translateText(text, targetLanguage);
        res.json({ text: translated });
    } catch (error) {
        console.error("Personalization Translate Error:", error);
        res.status(500).json({ error: "Translation failed", details: error instanceof Error ? error.message : String(error) });
    }
});

// Settings Management
router.get("/settings", hybridAuth, async (req: any, res) => {
    try {
        const [settings] = await db.select().from(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, req.user.id)).limit(1);
        res.json({ settings });
    } catch (err) {
        console.error("Personalization Settings Fetch Error:", err);
        res.status(500).json({ error: "Failed to fetch settings", details: err instanceof Error ? err.message : String(err) });
    }
});

router.post("/settings", hybridAuth, async (req: any, res) => {
    try {
        const settings = req.body;
        // Upsert
        await db.insert(userPersonalizationSettings).values({
            ...settings,
            userId: req.user.id
        }).onConflictDoUpdate({
            target: userPersonalizationSettings.userId,
            set: settings
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Personalization Settings Save Error:", err);
        res.status(500).json({ error: "Failed to save settings", details: err instanceof Error ? err.message : String(err) });
    }
});

export default router;
