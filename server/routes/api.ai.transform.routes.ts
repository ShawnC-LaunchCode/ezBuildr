/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { generateTransforms } from "../lib/ai/transformGenerator";
import { reviseTransforms } from "../lib/ai/transformRevision";
import { TransformDebugger } from "../lib/transforms/debugger";
import { alignSchema } from "../lib/transforms/schemaAlign";
import { logger } from '../logger';
import { hybridAuth } from "../middleware/auth";
import { asyncHandler } from '../utils/asyncHandler';

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

router.post("/generate", hybridAuth, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        // Safe Parse with Zod
        const validation = generateSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                error: "Invalid request data",
                details: validation.error.format()
            });
            return;
        }

        const { workflowContext, description, currentTransforms } = validation.data;

        const result = await generateTransforms({
            workflowContext,
            description,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- transform type is complex
            currentTransforms: currentTransforms as any[]
        });

        res.json(result);
    } catch (error: unknown) {
        logger.error({ error }, "AI Transform Generation Error");
        res.status(500).json({ error: "Failed to generate transforms" });
    }
}));

router.post("/revise", hybridAuth, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = reviseSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                error: "Invalid request data",
                details: validation.error.format()
            });
            return;
        }

        const { currentTransforms, userRequest, workflowContext } = validation.data;

        const result = await reviseTransforms({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- transform type is complex
            currentTransforms: currentTransforms as any[],
            userRequest,
            workflowContext
        });

        res.json(result);
    } catch (error: unknown) {
        logger.error({ error }, "AI Transform Revision Error");
        res.status(500).json({ error: "Failed to revise transforms" });
    }
}));

const debugSchema = z.object({
    transforms: z.array(z.unknown()).optional().default([])
});

router.post("/debug", hybridAuth, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = debugSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: "Invalid request data", details: validation.error.format() });
        }
        
        const { transforms } = validation.data;
        const issues = TransformDebugger.debug(transforms as any[]);
        res.json({ issues });
    } catch (error: unknown) {
        logger.error({ error }, "Transform Debug Error");
        res.status(500).json({ error: "Failed to debug transforms" });
    }
}));

const autoFixSchema = z.object({
    transforms: z.array(z.unknown()).optional().default([]),
    issues: z.array(z.unknown()).optional().default([])
});

router.post("/auto-fix", hybridAuth, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = autoFixSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: "Invalid request data", details: validation.error.format() });
        }

        const { transforms, issues } = validation.data;
        const fixes = await TransformDebugger.autoFix(transforms as any[], issues as any[]);
        res.json({ fixes });
    } catch (error: unknown) {
        logger.error({ error }, "Transform Auto-fix Error");
        res.status(500).json({ error: "Failed to generate auto-fixes" });
    }
}));

const schemaAlignSchema = z.object({
    transforms: z.array(z.unknown()).optional().default([]),
    documents: z.array(z.unknown()).optional().default([]),
    workflowVariables: z.array(z.unknown()).optional().default([])
});

router.post("/schema-align", hybridAuth, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = schemaAlignSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: "Invalid request data", details: validation.error.format() });
        }

        const { transforms, documents, workflowVariables } = validation.data;
        const result = await alignSchema({
            transforms: transforms as any[],
            documents: documents as any[],
            workflowVariables: workflowVariables as any[]
        });
        res.json(result);
    } catch (error: unknown) {
        logger.error({ error }, "Schema Align Error");
        res.status(500).json({ error: "Failed to align schema" });
    }
}));

export default router;
