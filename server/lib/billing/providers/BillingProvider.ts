
export interface CreateCustomerParams {
    email: string;
    name: string;
    organizationId: string;
}

export interface CreateSubscriptionParams {
    customerId: string;
    priceId: string;
    quantity?: number;
}

export interface BillingProvider {
    createCustomer(params: CreateCustomerParams): Promise<{ id: string }>;
    createSubscription(params: CreateSubscriptionParams): Promise<{ id: string; status: string; clientSecret?: string }>;
    cancelSubscription(subscriptionId: string): Promise<void>;
    updateSubscription(subscriptionId: string, params: { priceId?: string; quantity?: number }): Promise<void>;
    getPortalUrl(customerId: string): Promise<string>;
}
