/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { Router } from "express";

import { AnalyzeWorkflowSchema, ApplyFixesSchema } from "@shared/types/optimization";

import { logger } from '../logger';
import { workflowOptimizationService } from "../services/ai/WorkflowOptimizationService";
import { asyncHandler } from '../utils/asyncHandler';
import { hybridAuth } from "../middleware/auth";
import { rateLimit } from 'express-rate-limit';

const router = Router();

const optimizeRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many optimization requests" }
});

// POST /api/ai/workflows/optimize/analyze
router.post("/analyze", hybridAuth, optimizeRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = AnalyzeWorkflowSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: "Invalid request format", details: validation.error.format() });
            return;
        }
        
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- workflowId may be used in future
        const { workflow, workflowId, ...options } = validation.data;
        const result = await workflowOptimizationService.analyze(workflow, options);
        res.json(result);
    } catch (error) {
        logger.error({ error }, "Optimization Analysis Error");
        res.status(500).json({ error: "Failed to analyze workflow" });
    }
}));
// POST /api/ai/workflows/optimize/apply
router.post("/apply", hybridAuth, optimizeRateLimit, asyncHandler(async (req, res) => {
    try {
        const validation = ApplyFixesSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: "Invalid request format", details: validation.error.format() });
            return;
        }
        
        const { workflow, fixes } = validation.data;
        const result = await workflowOptimizationService.applyFixes(workflow, fixes);
        res.json(result);
    } catch (error) {
        logger.error({ error }, "Apply Fixes Error");
        res.status(500).json({ error: "Failed to apply fixes" });
    }
}));
export default router;