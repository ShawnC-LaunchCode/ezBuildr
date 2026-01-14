
import { createLogger } from "../../../logger";

import { BillingProvider, CreateCustomerParams, CreateSubscriptionParams } from "./BillingProvider";

const logger = createLogger({ module: 'stripe-provider' });

export class StripeProvider implements BillingProvider {
    // In a real implementation, this would use 'stripe' SDK

    async createCustomer(params: CreateCustomerParams) {
        logger.info({ params }, "Stripe: Creating customer");
        return { id: `cus_mock_${Math.random().toString(36).substring(7)}` };
    }

    async createSubscription(params: CreateSubscriptionParams) {
        logger.info({ params }, "Stripe: Creating subscription");
        return {
            id: `sub_mock_${Math.random().toString(36).substring(7)}`,
            status: 'active',
            clientSecret: 'seti_mock_secret'
        };
    }

    async cancelSubscription(subscriptionId: string) {
        logger.info({ subscriptionId }, "Stripe: Canceling subscription");
    }

    async updateSubscription(subscriptionId: string, params: any) {
        logger.info({ subscriptionId, params }, "Stripe: Updating subscription");
    }

    async getPortalUrl(customerId: string) {
        return "https://billing.stripe.com/p/session/test";
    }
}
