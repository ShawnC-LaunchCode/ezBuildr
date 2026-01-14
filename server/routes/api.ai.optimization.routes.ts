
import { Router } from "express";
import { z } from "zod";

import { AnalyzeWorkflowSchema, ApplyFixesSchema } from "@shared/types/optimization";

import { workflowOptimizationService } from "../services/ai/WorkflowOptimizationService";

const router = Router();

// POST /api/ai/workflows/optimize/analyze
router.post("/analyze", async (req, res) => {
    try {
        const { workflow, workflowId, ...options } = req.body;

        // Basic validation
        // Note: Zod schema usage might be tricky with "any" for workflow, so simplistic check
        if (!workflow) {
            return res.status(400).json({ error: "Missing workflow data" });
        }

        const result = await workflowOptimizationService.analyze(workflow, options);
        return res.json(result);
    } catch (error) {
        console.error("Optimization Analysis Error:", error);
        return res.status(500).json({ error: "Failed to analyze workflow" });
    }
});

// POST /api/ai/workflows/optimize/apply
router.post("/apply", async (req, res) => {
    try {
        const { workflow, fixes } = req.body;

        if (!workflow || !fixes || !Array.isArray(fixes)) {
            return res.status(400).json({ error: "Invalid request format" });
        }

        const result = await workflowOptimizationService.applyFixes(workflow, fixes);
        return res.json(result);
    } catch (error) {
        console.error("Apply Fixes Error:", error);
        return res.status(500).json({ error: "Failed to apply fixes" });
    }
});

export default router;
