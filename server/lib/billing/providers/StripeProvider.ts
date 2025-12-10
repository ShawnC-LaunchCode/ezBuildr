
import { BillingProvider, CreateCustomerParams, CreateSubscriptionParams } from "./BillingProvider";

export class StripeProvider implements BillingProvider {
    // In a real implementation, this would use 'stripe' SDK

    async createCustomer(params: CreateCustomerParams) {
        console.log("Stripe: Creating customer", params);
        return { id: `cus_mock_${Math.random().toString(36).substring(7)}` };
    }

    async createSubscription(params: CreateSubscriptionParams) {
        console.log("Stripe: Creating subscription", params);
        return {
            id: `sub_mock_${Math.random().toString(36).substring(7)}`,
            status: 'active',
            clientSecret: 'seti_mock_secret'
        };
    }

    async cancelSubscription(subscriptionId: string) {
        console.log("Stripe: Canceling subscription", subscriptionId);
    }

    async updateSubscription(subscriptionId: string, params: any) {
        console.log("Stripe: Updating subscription", subscriptionId, params);
    }

    async getPortalUrl(customerId: string) {
        return "https://billing.stripe.com/p/session/test";
    }
}
