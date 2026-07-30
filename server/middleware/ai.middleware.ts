/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import rateLimit from "express-rate-limit";

import { LIMITS } from "@shared/limits";

import { createLogger } from "../logger";

import type { AuthRequest } from './auth';
import type { Request, Response, NextFunction } from "express";

const logger = createLogger({ module: 'ai-middleware' });

/**
 * Middleware to validate workflow size in request body
 * Prevents memory issues and API overload from huge workflow objects
 */
export const validateWorkflowSize = (
    maxSections = LIMITS.AI_MAX_SECTIONS,
    maxStepsPerSection = LIMITS.AI_MAX_STEPS_PER_SECTION
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const workflow = req.body.currentWorkflow;

            if (!workflow) {
                // No workflow in body, skip validation
                return next();
            }

            // Check sections count
            if (workflow.sections && workflow.sections.length > maxSections) {
                return res.status(413).json({
                    success: false,
                    message: `Workflow too large: ${workflow.sections.length} sections (max: ${maxSections})`,
                    error: 'workflow_too_large',
                    details: {
                        sectionsCount: workflow.sections.length,
                        maxSections,
                        suggestion: 'Consider breaking this workflow into smaller workflows or using fewer sections.',
                    },
                });
            }

            // Check steps per section
            if (workflow.sections) {
                for (let i = 0; i < workflow.sections.length; i++) {
                    const section = workflow.sections[i];
                    if (section.steps && section.steps.length > maxStepsPerSection) {
                        return res.status(413).json({
                            success: false,
                            message: `Section "${section.title || i}" has too many steps: ${section.steps.length} (max: ${maxStepsPerSection})`,
                            error: 'section_too_large',
                            details: {
                                sectionIndex: i,
                                sectionTitle: section.title,
                                stepsCount: section.steps.length,
                                maxStepsPerSection,
                                suggestion: 'Split this section into multiple smaller sections.',
                            },
                        });
                    }
                }
            }

            // Check total JSON size (rough estimate)
            const jsonSize = JSON.stringify(workflow).length;
            const maxJsonSize = 5 * 1024 * 1024; // 5MB limit

            if (jsonSize > maxJsonSize) {
                return res.status(413).json({
                    success: false,
                    message: `Workflow JSON too large: ${(jsonSize / 1024 / 1024).toFixed(2)}MB (max: 5MB)`,
                    error: 'payload_too_large',
                    details: {
                        jsonSizeMB: (jsonSize / 1024 / 1024).toFixed(2),
                        maxSizeMB: 5,
                        suggestion: 'Reduce the number of sections, steps, or remove unnecessary data.',
                    },
                });
            }

            next();
        } catch (error) {
            logger.error({ error }, 'Error validating workflow size');
            next(error);
        }
    };
};

/**
 * Rate limiting for AI workflow generation endpoints
 * These endpoints are expensive and can consume significant API credits
 */
export const aiWorkflowRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: LIMITS.AI_RATE_LIMIT_PER_MINUTE, // per-tenant AI requests/min (env: AI_TENANT_RPM_LIMIT, default 20)
    message: {
        success: false,
        message: 'Too many AI requests, please try again later.',
        error: 'rate_limit_exceeded',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use tenant ID for rate limiting (authenticated requests only)
    keyGenerator: (req: Request) => {
        const authReq = req as AuthRequest;
        return authReq.tenantId ?? authReq.userId ?? 'anonymous';
    },
    skipFailedRequests: false, // Count failed requests to prevent token burning loops
});

/**
 * Daily budget rate limiting for AI workflow endpoints
 * Prevents a single user/tenant from exhausting the API budget
 */
export const aiDailyRateLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: LIMITS.AI_RATE_LIMIT_PER_DAY, // per-tenant AI requests/day (env: AI_TENANT_DAILY_LIMIT, default 500)
    message: {
        success: false,
        message: 'Daily AI request limit reached. Please try again tomorrow.',
        error: 'daily_rate_limit_exceeded',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const authReq = req as AuthRequest;
        return authReq.tenantId ?? authReq.userId ?? 'anonymous';
    },
    skipFailedRequests: false,
});
