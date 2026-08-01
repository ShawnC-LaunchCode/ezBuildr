import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { generateTransforms } from "../lib/ai/transformGenerator";
import { reviseTransforms } from "../lib/ai/transformRevision";
import { TransformDebugger } from "../lib/transforms/debugger";
import { alignSchema } from "../lib/transforms/schemaAlign";
import { logger } from '../logger';
import { hybridAuth } from "../middleware/auth";
import { requireBuilder } from "../middleware/rbac";
import { asyncHandler } from '../utils/asyncHandler';

import type { TransformBlock } from "shared/schema";
import type { TransformIssue } from "shared/types/debug";

const router = Router();
const INVALID_REQUEST_ERROR = "Invalid request data";

// Rate Limiter: 10 requests per minute
const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many AI requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Validation Schemas
const transformBlockSchema = z.custom<TransformBlock>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value)
);
const transformIssueSchema = z.custom<TransformIssue>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value)
);

const generateSchema = z.object({
    workflowContext: z.record(z.unknown()).optional().default({}),
    description: z.string().min(1).max(5000),
    currentTransforms: z.array(transformBlockSchema).optional().default([]),
});

const reviseSchema = z.object({
    currentTransforms: z.array(transformBlockSchema).optional().default([]),
    userRequest: z.string().min(1).max(5000),
    workflowContext: z.record(z.unknown()).optional().default({}),
});

router.post("/generate", hybridAuth, requireBuilder, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        // Safe Parse with Zod
        const validation = generateSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                error: INVALID_REQUEST_ERROR,
                details: validation.error.format()
            });
            return;
        }

        const { workflowContext, description, currentTransforms } = validation.data;

        const result = await generateTransforms({
            workflowContext,
            description,
            currentTransforms
        });

        res.json(result);
    } catch (error: unknown) {
        logger.error({ error }, "AI Transform Generation Error");
        res.status(500).json({ error: "Failed to generate transforms" });
    }
}));

router.post("/revise", hybridAuth, requireBuilder, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = reviseSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                error: INVALID_REQUEST_ERROR,
                details: validation.error.format()
            });
            return;
        }

        const { currentTransforms, userRequest, workflowContext } = validation.data;

        const result = await reviseTransforms({
            currentTransforms,
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
    transforms: z.array(transformBlockSchema).optional().default([])
});

router.post("/debug", hybridAuth, requireBuilder, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = debugSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: INVALID_REQUEST_ERROR, details: validation.error.format() });
        }
        
        const { transforms } = validation.data;
        const issues = TransformDebugger.debug(transforms);
        res.json({ issues });
    } catch (error: unknown) {
        logger.error({ error }, "Transform Debug Error");
        res.status(500).json({ error: "Failed to debug transforms" });
    }
}));

const autoFixSchema = z.object({
    transforms: z.array(transformBlockSchema).optional().default([]),
    issues: z.array(transformIssueSchema).optional().default([])
});

router.post("/auto-fix", hybridAuth, requireBuilder, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = autoFixSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: INVALID_REQUEST_ERROR, details: validation.error.format() });
        }

        const { transforms, issues } = validation.data;
        const fixes = await TransformDebugger.autoFix(transforms, issues);
        res.json({ fixes });
    } catch (error: unknown) {
        logger.error({ error }, "Transform Auto-fix Error");
        res.status(500).json({ error: "Failed to generate auto-fixes" });
    }
}));

const schemaAlignSchema = z.object({
    transforms: z.array(transformBlockSchema).optional().default([]),
    documents: z.array(z.unknown()).optional().default([]),
    workflowVariables: z.array(z.unknown()).optional().default([])
});

router.post("/schema-align", hybridAuth, requireBuilder, aiRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = schemaAlignSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: INVALID_REQUEST_ERROR, details: validation.error.format() });
        }

        const { transforms, documents, workflowVariables } = validation.data;
        const result = await alignSchema({
            transforms,
            documents,
            workflowVariables
        });
        res.json(result);
    } catch (error: unknown) {
        logger.error({ error }, "Schema Align Error");
        res.status(500).json({ error: "Failed to align schema" });
    }
}));

export default router;
