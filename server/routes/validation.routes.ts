import { eq } from "drizzle-orm";
import { Router } from "express";

import { steps, workflows, sections } from "@shared/schema";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validatePage } from "@shared/validation/PageValidator";

import { db } from "../db"; // Correct path: ../db because we are in server/routes/
import { logger } from "../logger"; // Correct path: ../logger
import { requireAssetAccess } from "../utils/ownershipAccess";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const validationRouter = Router();

/**
 * POST /api/workflows/:workflowId/validate-page
 *
 * Validates a page of answers server-side.
 * Payload: { sectionId: string, values: Record<string, any> }
 */
validationRouter.post("/api/workflows/:workflowId/validate-page", hybridAuth, asyncHandler(async (req, res) => {
    const { workflowId } = req.params;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
    const { sectionId, values, allValues } = req.body;

    if (!sectionId || !values) {
        return res.status(400).json({ valid: false, error: "Missing sectionId or values" });
    }

    const userId = (req as AuthRequest).userId;
    if (!userId) {
        return res.status(401).json({ valid: false, error: "Unauthorized" });
    }

    const workflow = await db.query.workflows.findFirst({
        where: eq(workflows.id, workflowId)
    });

    if (!workflow) {
        return res.status(404).json({ valid: false, error: "Workflow not found" });
    }

    try {
        await requireAssetAccess(userId, workflow.ownerType, workflow.ownerUuid, 'workflow');
    } catch (e) {
        return res.status(403).json({ valid: false, error: "Access denied to workflow" });
    }

    try {
        // 0. Verify section belongs to workflow
        const section = await db.query.sections.findFirst({
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
            where: eq(sections.id, sectionId)
        });

        if (!section || section.workflowId !== workflowId) {
            return res.status(404).json({ valid: false, error: "Section not found or does not belong to workflow" });
        }

        // 1. Fetch steps for the section
        const sectionSteps = await db.query.steps.findMany({
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
            where: eq(steps.sectionId, sectionId),

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- HTTP request data is untyped at this route boundary.
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
            if (!step.visibleIf) { return true; }
            if (!allValues) { return true; } // Validate if we can't be sure
            try {
                // evaluateConditionExpression is Isomorphic

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
                const { evaluateConditionExpression } = require("@shared/conditionEvaluator");
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
                return evaluateConditionExpression(step.visibleIf, allValues);
            } catch (e) {
                return true;
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step from database query
        stepsToValidate.forEach((step: any) => {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
            schemas[step.id] = getValidationSchema({
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
                id: step.id,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
                type: step.type,
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
                config: step.config,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
                required: step.required ?? false
            });
        });

        // 3. Run validation
        const result = await validatePage({
            schemas,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
            values, // The values submitted for this page
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
            allValues: allValues || values // Context
        });

        res.json(result);

    } catch (error) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
        logger.error({ error, workflowId, sectionId }, "Server-side validation failed");
        res.status(500).json({ valid: false, error: "Internal validation error" });
    }
}));
