import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { generateTransforms } from "../lib/ai/transformGenerator";
import { reviseTransforms } from "../lib/ai/transformRevision";
import { TransformDebugger } from "../lib/transforms/debugger";
import { alignSchema } from "../lib/transforms/schemaAlign";
import { hybridAuth } from "../middleware/auth";

const router = Router();

// Rate Limiter: 10 requests per minute
const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many AI requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Validation Schemas
const generateSchema = z.object({
    workflowContext: z.record(z.unknown()).optional().default({}),
    description: z.string().min(1).max(5000),
    currentTransforms: z.array(z.unknown()).optional().default([]),
});

const reviseSchema = z.object({
    currentTransforms: z.array(z.unknown()).optional().default([]),
    userRequest: z.string().min(1).max(5000),
    workflowContext: z.record(z.unknown()).optional().default({}),
});

router.post("/generate", hybridAuth, aiRateLimit, async (req, res) => {
    try {
        // Safe Parse with Zod
        const validation = generateSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: "Invalid request data",
                details: validation.error.format()
            });
        }

        const { workflowContext, description, currentTransforms } = validation.data;

        const result = await generateTransforms({
            workflowContext,
            description,
            currentTransforms: currentTransforms as any[]
        });

        res.json(result);
    } catch (error: any) {
        console.error("AI Transform Generation Error:", error);
        res.status(500).json({ error: error.message || "Failed to generate transforms" });
    }
});

router.post("/revise", hybridAuth, aiRateLimit, async (req, res) => {
    try {
        const validation = reviseSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: "Invalid request data",
                details: validation.error.format()
            });
        }

        const { currentTransforms, userRequest, workflowContext } = validation.data;

        const result = await reviseTransforms({
            currentTransforms: currentTransforms as any[],
            userRequest,
            workflowContext
        });

        res.json(result);
    } catch (error: any) {
        console.error("AI Transform Revision Error:", error);
        res.status(500).json({ error: error.message || "Failed to revise transforms" });
    }
});

router.post("/debug", hybridAuth, async (req, res) => {
    try {
        const { transforms } = req.body;
        const issues = TransformDebugger.debug(transforms || []);
        res.json({ issues });
    } catch (error: any) {
        console.error("Transform Debug Error:", error);
        res.status(500).json({ error: error.message || "Failed to debug transforms" });
    }
});

router.post("/auto-fix", hybridAuth, async (req, res) => {
    try {
        const { transforms, issues } = req.body;
        const fixes = await TransformDebugger.autoFix(transforms || [], issues || []);
        res.json({ fixes });
    } catch (error: any) {
        console.error("Transform Auto-fix Error:", error);
        res.status(500).json({ error: error.message || "Failed to generate auto-fixes" });
    }
});

router.post("/schema-align", hybridAuth, async (req, res) => {
    try {
        const { transforms, documents, workflowVariables } = req.body;
        const result = await alignSchema({
            transforms: transforms || [],
            documents: documents || [],
            workflowVariables: workflowVariables || []
        });
        res.json(result);
    } catch (error: any) {
        console.error("Schema Align Error:", error);
        res.status(500).json({ error: error.message || "Failed to align schema" });
    }
});

export default router;
