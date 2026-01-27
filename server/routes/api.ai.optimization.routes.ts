import { Router } from "express";

import { AnalyzeWorkflowSchema, ApplyFixesSchema } from "@shared/types/optimization";

import { logger } from '../logger';
import { workflowOptimizationService } from "../services/ai/WorkflowOptimizationService";
import { asyncHandler } from '../utils/asyncHandler';
const router = Router();
// POST /api/ai/workflows/optimize/analyze
router.post("/analyze", asyncHandler(async (req, res) => {
    try {
        const { workflow, workflowId, ...options } = req.body;
        // Basic validation
        // Note: Zod schema usage might be tricky with "any" for workflow, so simplistic check
        if (!workflow) {
            res.status(400).json({ error: "Missing workflow data" });
            return;
        }
        const result = await workflowOptimizationService.analyze(workflow, options);
        res.json(result);
    } catch (error) {
        logger.error({ error }, "Optimization Analysis Error");
        res.status(500).json({ error: "Failed to analyze workflow" });
    }
}));
// POST /api/ai/workflows/optimize/apply
router.post("/apply", asyncHandler(async (req, res) => {
    try {
        const { workflow, fixes } = req.body;
        if (!workflow || !fixes || !Array.isArray(fixes)) {
            res.status(400).json({ error: "Invalid request format" });
            return;
        }
        const result = await workflowOptimizationService.applyFixes(workflow, fixes);
        res.json(result);
    } catch (error) {
        logger.error({ error }, "Apply Fixes Error");
        res.status(500).json({ error: "Failed to apply fixes" });
    }
}));
export default router;