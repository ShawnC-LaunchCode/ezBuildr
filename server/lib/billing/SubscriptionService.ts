import { eq, and } from "drizzle-orm";

import {  billingPlans, subscriptions, customerBillingInfo } from "@shared/schema";

import { db } from "../../db";

import { PLAN_TIERS, DEFAULT_PLANS } from "./billingConfig";
import { StripeProvider } from "./providers/StripeProvider";
const billingProvider = new StripeProvider();
export class SubscriptionService {
    /**
     * Get the current active subscription for an organization.
     * If no subscription exists, returns a virtual 'FREE' plan.
     */
    static async getSubscription(organizationId: string) {
        const sub = await db.query.subscriptions.findFirst({
            where: and(
                eq(subscriptions.organizationId, organizationId),
                eq(subscriptions.status, 'active')
            ),
            with: {
                plan: true
            }
        });
        if (sub) {
            return sub;
        }
        // Fallback to default Free plan logic if no record exists
        // In reality we should probably create a DB record on org creation, but being safe here.
        const freePlan = DEFAULT_PLANS.find(p => p.type === PLAN_TIERS.FREE)!;
        return {
            status: 'active',
            plan: freePlan,
            seatQuantity: 1,
            organizationId
        };
    }
    /**
     * Resolve the effective feature limits for an organization
     */
    static async getPlanLimits(organizationId: string) {
        const sub = await SubscriptionService.getSubscription(organizationId);
        return sub.plan.limits as Record<string, number>;
    }
    /**
     * Resolve effective features
     */
    static async getPlanFeatures(organizationId: string) {
        const sub = await SubscriptionService.getSubscription(organizationId);
        return sub.plan.features as Record<string, boolean>;
    }
    /**
     * Initialize billing for a new organization (Create Customer + Free Sub)
     */
    static async initializeOrganizationBilling(organizationId: string, email: string, name: string) {
        const customer = await billingProvider.createCustomer({ email, name, organizationId });
        await db.insert(customerBillingInfo).values({
            organizationId,
            stripeCustomerId: customer.id,
            billingEmail: email
        });
        // Find Free Plan ID from DB (assuming we seeded it)
        // For this implementation, let's assume we find it or create it dynamic
        let freePlan = await db.query.billingPlans.findFirst({
            where: eq(billingPlans.type, PLAN_TIERS.FREE)
        });
        if (!freePlan) {
            // Self-healing: Create default plans if missing
            const defaultFree = DEFAULT_PLANS.find(p => p.type === PLAN_TIERS.FREE)!;
            [freePlan] = await db.insert(billingPlans).values(defaultFree).returning();
        }
        await db.insert(subscriptions).values({
            organizationId,
            planId: freePlan.id,
            status: 'active',
            seatQuantity: 1
        });
    }
    /**
     * Upgrade Plan
     */
    static async upgradePlan(organizationId: string, planType: string) {
        // Validation logic...
        // Call provider...
        // Update DB...
    }
}