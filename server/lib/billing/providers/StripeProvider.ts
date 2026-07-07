
import crypto from "crypto";
import { createLogger } from "../../../logger";

import { BillingProvider, CreateCustomerParams, CreateSubscriptionParams } from "./BillingProvider";

const logger = createLogger({ module: 'stripe-provider' });

export class StripeProvider implements BillingProvider {
    // In a real implementation, this would use 'stripe' SDK

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async createCustomer(params: CreateCustomerParams) {
        logger.info({ params }, "Stripe: Creating customer");
        return { id: `cus_mock_${crypto.randomUUID().replace(/-/g, '').substring(0, 7)}` };
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async createSubscription(params: CreateSubscriptionParams) {
        logger.info({ params }, "Stripe: Creating subscription");
        return {
            id: `sub_mock_${crypto.randomUUID().replace(/-/g, '').substring(0, 7)}`,
            status: 'active',
            clientSecret: 'seti_mock_secret'
        };
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async cancelSubscription(subscriptionId: string) {
        logger.info({ subscriptionId }, "Stripe: Canceling subscription");
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async updateSubscription(subscriptionId: string, params: { priceId?: string; quantity?: number }) {
        logger.info({ subscriptionId, params }, "Stripe: Updating subscription");
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async getPortalUrl(_customerId: string) {
        return "https://billing.stripe.com/p/session/test";
    }
}
