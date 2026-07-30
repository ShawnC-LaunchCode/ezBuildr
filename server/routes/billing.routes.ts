/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

import { Router } from "express";

import { requireWorkspace } from "../lib/authz/enforce";
import { StripeProvider } from "../lib/billing/providers/StripeProvider";
import { SubscriptionService } from "../lib/billing/SubscriptionService";
import { UsageAggregator } from "../lib/metering/usageAggregator";
import { logger } from '../logger';
import { asyncHandler } from '../utils/asyncHandler';
import { hybridAuth, type AuthRequest } from "../middleware/auth";

const router = Router();
const provider = new StripeProvider();

// All billing routes require authentication and workspace context
router.use(hybridAuth);
router.use(requireWorkspace);

// Get Current Subscription & Usage
router.get("/subscription", asyncHandler(async (req, res) => {
    try {
        const authReq = req as AuthRequest;
        // The middleware sets tenantId securely from the DB/token, not the client header.
        const finalOrgId = authReq.tenantId;

        if (!finalOrgId) {
            return res.status(403).json({ error: "No organization associated with this account" });
        }

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
    } catch (e: unknown) {
        logger.error({ error: e }, "Billing Error");
        res.status(500).json({ error: "Internal Server Error" });
    }
}));

// Create Stripe Portal Session
router.post("/portal", asyncHandler(async (req, res) => {
    try {
        const authReq = req as AuthRequest;
        const finalOrgId = authReq.tenantId;

        if (!finalOrgId) {
            return res.status(403).json({ error: "No organization associated with this account" });
        }

        // Look up customer ID ... 
        // Simplified:
        const url = await provider.getPortalUrl("mock_cus_id");
        res.json({ url });
    } catch (e: unknown) {
        logger.error({ error: e }, "Billing Portal Error");
        res.status(500).json({ error: "Internal Server Error" });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
export const registerBillingRoutes = (app: any) => {
    app.use("/api/billing", router);
};
