export type LegalIntegrationProvider = 'clio' | 'stripe' | 'docusign';

export type LegalIntegrationStatus =
  | 'not_configured'
  | 'needs_authorization'
  | 'connected'
  | 'configured'
  | 'unavailable';

export interface LegalIntegrationSummary {
  id?: string;
  provider: LegalIntegrationProvider;
  name: string;
  status: LegalIntegrationStatus;
  capabilities: string[];
  lastTestedAt?: string;
  webhookPath?: string;
}

export interface LegalIntegrationsResponse {
  integrations: LegalIntegrationSummary[];
}

export interface ClioSetupResponse {
  integration: LegalIntegrationSummary;
  authorizationUrl: string;
}

export interface StripeSetupResponse {
  integration: LegalIntegrationSummary;
}

export interface ClioContactResult {
  id: number;
  name: string;
  primaryEmailAddress?: string;
}

export interface ClioDocumentResult {
  id: number;
  name: string;
  matterId: number;
}

export interface StripePaymentIntentResult {
  id: string;
  clientSecret: string;
  status: string;
  amount: number;
  currency: string;
}

export interface StripeWebhookResult {
  received: true;
  eventType: string;
  paymentIntentId?: string;
  paymentStatus?: string;
}
