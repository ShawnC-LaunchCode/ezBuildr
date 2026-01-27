
import { Router } from "express";

import { requireWorkspace } from "../lib/authz/enforce";
import { StripeProvider } from "../lib/billing/providers/StripeProvider";
import { SubscriptionService } from "../lib/billing/SubscriptionService";
import { UsageAggregator } from "../lib/metering/usageAggregator";
import { logger } from '../logger';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const provider = new StripeProvider();

// All billing routes require workspace context/auth
router.use(requireWorkspace);

// Get Current Subscription & Usage
router.get("/subscription", asyncHandler(async (req, res) => {
    try {
        const organizationId = (req as any).organizationId || (req as any).workspaceId; // Assuming 1:1 for now or resolved upstream

        // Mock resolution of org from workspace if they are different tables
        // In this implementation plan we conflated them slightly or need a lookup
        // For now, let's assume specific Logic to get Org ID
        const finalOrgId = organizationId;

        const sub = await SubscriptionService.getSubscription(finalOrgId);
        const limits = await SubscriptionService.getPlanLimits(finalOrgId);

        // Get generic MTD usage
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const usage = await UsageAggregator.getPeriodUsage(finalOrgId, startOfMonth, now);

        res.json({
            subscription: sub,
            limits,
            usage,
            features: sub.plan.features
        });
    } catch (e: any) {
        logger.error({ error: e }, "Billing Error");
        res.status(500).json({ error: e.message });
    }
}));

// Create Stripe Portal Session
router.post("/portal", asyncHandler(async (req, res) => {
    const organizationId = (req as any).workspaceId;
    // Look up customer ID ... 
    // Simplified:
    const url = await provider.getPortalUrl("mock_cus_id");
    res.json({ url });
}));

export const registerBillingRoutes = (app: any) => {
    app.use("/api/billing", router);
};
