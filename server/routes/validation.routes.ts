/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */

import { eq } from "drizzle-orm";
import { Router } from "express";

import { steps } from "@shared/schema";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validatePage } from "@shared/validation/PageValidator";

import { db } from "../db"; // Correct path: ../db because we are in server/routes/
import { logger } from "../logger"; // Correct path: ../logger
import { asyncHandler } from "../utils/asyncHandler";

export const validationRouter = Router();

/**
 * POST /api/workflows/:workflowId/validate-page
 * 
 * Validates a page of answers server-side.
 * Payload: { sectionId: string, values: Record<string, any> }
 */
validationRouter.post("/api/workflows/:workflowId/validate-page", asyncHandler(async (req, res) => {
    const { workflowId } = req.params;
    const { sectionId, values, allValues } = req.body;

    if (!sectionId || !values) {
        return res.status(400).json({ valid: false, error: "Missing sectionId or values" });
    }

    try {
        // 1. Fetch steps for the section
        const sectionSteps = await db.query.steps.findMany({
            where: eq(steps.sectionId, sectionId),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle orderBy callback types
            orderBy: (steps: any, { asc }: any) => [asc(steps.order)],
        });

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!sectionSteps || sectionSteps.length === 0) {
            return res.json({ valid: true, blockErrors: {} });
        }

        // 2. Build Schemas
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic validation schemas
        const schemas: Record<string, any> = {};

        // Server-side visibility check attempt
        // If allValues not provided, we might over-validate or skip visibility check
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step from database query
        const stepsToValidate = sectionSteps.filter((step: any) => {
            if (!step.visibleIf) { return true; }
            if (!allValues) { return true; } // Validate if we can't be sure
            try {
                // evaluateConditionExpression is Isomorphic
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { evaluateConditionExpression } = require("@shared/conditionEvaluator");
                return evaluateConditionExpression(step.visibleIf, allValues);
            } catch (e) {
                return true;
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step from database query
        stepsToValidate.forEach((step: any) => {
            schemas[step.id] = getValidationSchema({
                id: step.id,
                type: step.type,
                config: step.config,
                required: step.required ?? false
            });
        });

        // 3. Run validation
        const result = await validatePage({
            schemas,
            values, // The values submitted for this page
            allValues: allValues || values // Context
        });

        res.json(result);

    } catch (error) {
        logger.error({ error, workflowId, sectionId }, "Server-side validation failed");
        res.status(500).json({ valid: false, error: "Internal validation error" });
    }
}));
