import { Request, Response, NextFunction } from "express";

import { UsageAggregator } from "../metering/usageAggregator";

import { METRIC_LIMITS } from "./billingConfig";
import { SubscriptionService } from "./SubscriptionService";
/**
 * Middleware to enforce plan limits.
 * Checks if the organization has exceeded the quota for a specific metric.
 * 
 * @param metric The metric to check (e.g. 'workflow_run', 'document_generated')
 * @param quantity The amount being consumed (default 1)
 */
export function enforceQuota(metric: keyof typeof METRIC_LIMITS, quantity: number = 1) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const organizationId = (req as any).organizationId || (req.user as any)?.tenantId; // Adapt to auth context
        if (!organizationId) {
            // If no org context, we arguably should block or skip. 
            // For safety in SaaS transition, let's log error and allow (fail open) till migration complete.
            console.warn("Quota Enforcement Skipped: No Organization Context");
            return next();
        }
        try {
            // 1. Get Plan Limits
            const limits = await SubscriptionService.getPlanLimits(organizationId);
            const limitKey = METRIC_LIMITS[metric];
            const maxLimit = limits[limitKey]; // e.g. limits['runs']
            // If limit is -1, it's unlimited
            if (maxLimit === -1) {
                return next();
            }
            // 2. Get Current Usage (Month to Date)
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            // This is slightly expensive for middleware. Ideally cached in Redis.
            const usage = await UsageAggregator.getPeriodUsage(organizationId, startOfMonth, now);
            const currentUsage = usage[metric] || 0;
            // 3. Check Quota
            if (currentUsage + quantity > maxLimit) {
                return res.status(402).json({
                    error: "Quota Exceeded",
                    message: `You have reached your limit for ${metric}. Please upgrade your plan.`,
                    code: 'quota_exceeded',
                    metric,
                    limit: maxLimit,
                    current: currentUsage
                });
            }
            next();
        } catch (error) {
            console.error("Quota Check Failed:", error);
            // Fail open to avoid blocking legitimate traffic on error
            next();
        }
    };
}
/**
 * Middleware to enforce feature access
 */
export function requireFeature(feature: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const organizationId = (req as any).organizationId || (req.user as any)?.tenantId;
        if (!organizationId) {
            console.warn("Feature Check Skipped: No Organization Context");
            return next();
        }
        try {
            const features = await SubscriptionService.getPlanFeatures(organizationId);
            if (!features[feature]) {
                return res.status(403).json({
                    error: "Feature Not Available",
                    message: `This feature (${feature}) is not available on your current plan.`,
                    code: 'feature_locked'
                });
            }
            next();
        } catch (error) {
            console.error("Feature Check Failed:", error);
            next();
        }
    };
}