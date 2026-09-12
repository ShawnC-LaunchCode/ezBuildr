import rateLimit from "express-rate-limit";

import { LIMITS } from "@shared/limits";

import { createLogger } from "../logger";

import type { AuthRequest } from './auth';
import type { Request, Response, NextFunction } from "express";

const logger = createLogger({ module: 'ai-middleware' });

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * Middleware to validate workflow size in request body
 * Prevents memory issues and API overload from huge workflow objects
 */
export const validateWorkflowSize = (
    maxPages = LIMITS.AI_MAX_PAGES,
    maxStepsPerPage = LIMITS.AI_MAX_STEPS_PER_PAGE
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const requestBody: unknown = req.body;
            const workflow = isRecord(requestBody) && isRecord(requestBody.currentWorkflow)
                ? requestBody.currentWorkflow
                : undefined;

            if (!workflow) {
                // No workflow in body, skip validation
                return next();
            }

            // Check pages count
            const pages = Array.isArray(workflow.pages)
                ? workflow.pages as unknown[]
                : undefined;
            if (pages && pages.length > maxPages) {
                return res.status(413).json({
                    success: false,
                    message: `Workflow too large: ${pages.length} pages (max: ${maxPages})`,
                    error: 'workflow_too_large',
                    details: {
                        pagesCount: pages.length,
                        maxPages,
                        suggestion: 'Consider breaking this workflow into smaller workflows or using fewer pages.',
                    },
                });
            }

            // Check steps per page
            if (pages) {
                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    if (!isRecord(page)) {
                        continue;
                    }
                    const steps = Array.isArray(page.steps) ? page.steps : undefined;
                    if (steps && steps.length > maxStepsPerPage) {
                        const pageTitle = typeof page.title === 'string' ? page.title : String(i);
                        return res.status(413).json({
                            success: false,
                            message: `Page "${pageTitle}" has too many steps: ${steps.length} (max: ${maxStepsPerPage})`,
                            error: 'page_too_large',
                            details: {
                                pageIndex: i,
                                pageTitle,
                                stepsCount: steps.length,
                                maxStepsPerPage,
                                suggestion: 'Split this page into multiple smaller pages.',
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
                        suggestion: 'Reduce the number of pages, steps, or remove unnecessary data.',
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
