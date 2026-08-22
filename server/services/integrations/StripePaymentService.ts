import crypto from 'crypto';

import type {
  ResolvedConnection,
  StripePaymentIntentResult,
  StripeWebhookResult,
} from '@shared/types';

import { logger } from '../../logger';
import {
  getConnectionById,
  markConnectionUsed,
  resolveConnection,
} from '../connections';
import { getSecretValue } from '../secrets';
import { runWithTenantContext } from '../../utils/rlsContext';
import { safeFetch } from '../../utils/safeFetch';

import { LegalIntegrationError, providerFailureMessage } from './errors';

type IntegrationHttpClient = (url: string, init?: RequestInit) => Promise<Response>;

interface CreatePaymentIntentInput {
  amount: number;
  currency: string;
  idempotencyKey: string;
  description?: string;
  receiptEmail?: string;
  reference?: string;
}

interface StripeDependencies {
  resolve: (projectId: string, connectionId: string) => Promise<ResolvedConnection>;
  findConnection: typeof getConnectionById;
  getSecret: typeof getSecretValue;
  request: IntegrationHttpClient;
  markUsed: (connectionId: string) => Promise<void>;
  now: () => number;
}

interface StripeEventPayload {
  type?: unknown;
  data?: { object?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePaymentIntent(payload: unknown): StripePaymentIntentResult {
  if (!isRecord(payload)) {
    throw new LegalIntegrationError(
      'Stripe returned an unexpected response. Try again or contact support.',
      502,
      'stripe_invalid_response',
    );
  }
  const id = payload.id;
  const clientSecret = payload['client_secret'];
  const status = payload.status;
  const amount = payload.amount;
  const currency = payload.currency;
  if (
    typeof id !== 'string'
    || typeof clientSecret !== 'string'
    || typeof status !== 'string'
    || typeof amount !== 'number'
    || typeof currency !== 'string'
  ) {
    throw new LegalIntegrationError(
      'Stripe returned an incomplete PaymentIntent. Try again or contact support.',
      502,
      'stripe_invalid_response',
    );
  }
  return {
    id,
    clientSecret,
    status,
    amount,
    currency,
  };
}

function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
  const values = header.split(',').map((part) => part.trim().split('=', 2));
  const timestamp = Number(values.find(([key]) => key === 't')?.[1]);
  const signatures = values
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new LegalIntegrationError('Invalid Stripe webhook signature.', 401, 'stripe_invalid_signature');
  }
  return { timestamp, signatures };
}

function signaturesMatch(expected: string, candidates: string[]): boolean {
  const expectedBytes = Buffer.from(expected, 'hex');
  return candidates.some((candidate) => {
    try {
      const candidateBytes = Buffer.from(candidate, 'hex');
      return candidateBytes.length === expectedBytes.length
        && crypto.timingSafeEqual(candidateBytes, expectedBytes);
    } catch {
      return false;
    }
  });
}

export class StripePaymentService {
  private readonly dependencies: StripeDependencies;

  constructor(dependencies: Partial<StripeDependencies> = {}) {
    this.dependencies = {
      resolve: dependencies.resolve ?? resolveConnection,
      findConnection: dependencies.findConnection ?? getConnectionById,
      getSecret: dependencies.getSecret ?? getSecretValue,
      request: dependencies.request ?? safeFetch,
      markUsed: dependencies.markUsed ?? markConnectionUsed,
      now: dependencies.now ?? Date.now,
    };
  }

  async createPaymentIntent(
    projectId: string,
    connectionId: string,
    input: CreatePaymentIntentInput,
  ): Promise<StripePaymentIntentResult> {
    const resolved = await this.resolveStripeConnection(projectId, connectionId);
    const secretKey = resolved.secrets.secretKey;
    if (!secretKey) {
      throw new LegalIntegrationError(
        'Stripe credentials are missing. Reconfigure the integration and try again.',
        409,
        'stripe_credentials_missing',
      );
    }

    const form = new URLSearchParams({
      amount: String(input.amount),
      currency: input.currency.toLowerCase(),
      'automatic_payment_methods[enabled]': 'true',
      'metadata[project_id]': projectId,
    });
    if (input.description) { form.set('description', input.description); }
    if (input.receiptEmail) { form.set('receipt_email', input.receiptEmail); }
    if (input.reference) { form.set('metadata[reference]', input.reference); }

    const response = await this.dependencies.request('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(resolved.connection.timeoutMs),
    });
    if (!response.ok) {
      logger.warn({
        provider: 'stripe',
        connectionId,
        operation: 'create payment intent',
        status: response.status,
        requestId: response.headers.get('request-id'),
      }, 'Stripe integration request failed');
      throw new LegalIntegrationError(
        providerFailureMessage('Stripe', response.status),
        response.status === 429 ? 503 : 502,
        'stripe_request_failed',
        response.status === 429 || response.status >= 500,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json() as unknown;
    } catch {
      throw new LegalIntegrationError(
        'Stripe returned an unreadable response. Try again or contact support.',
        502,
        'stripe_invalid_response',
      );
    }
    const paymentIntent = parsePaymentIntent(payload);
    await this.dependencies.markUsed(connectionId);
    return paymentIntent;
  }

  async handleWebhook(
    connectionId: string,
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<StripeWebhookResult> {
    const connection = await this.dependencies.findConnection(connectionId);
    if (!connection || connection.authConfig.provider !== 'stripe') {
      throw new LegalIntegrationError('Stripe integration not found.', 404, 'stripe_not_found');
    }
    const webhookSecretRef = connection.secretRefs.webhookSecret;
    const webhookSecret = webhookSecretRef
      ? await this.dependencies.getSecret(connection.projectId, webhookSecretRef)
      : null;
    if (!webhookSecret) {
      throw new LegalIntegrationError(
        'Stripe webhook signing is not configured.',
        503,
        'stripe_webhook_not_configured',
      );
    }

    this.verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
    let event: StripeEventPayload;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as StripeEventPayload;
    } catch {
      throw new LegalIntegrationError('Invalid Stripe webhook payload.', 400, 'stripe_invalid_payload');
    }
    if (typeof event.type !== 'string') {
      throw new LegalIntegrationError('Invalid Stripe webhook payload.', 400, 'stripe_invalid_payload');
    }

    const paymentIntent = isRecord(event.data?.object) ? event.data.object : undefined;
    const metadata = isRecord(paymentIntent?.metadata) ? paymentIntent.metadata : undefined;
    if (event.type.startsWith('payment_intent.') && metadata?.project_id !== connection.projectId) {
      throw new LegalIntegrationError(
        'Stripe webhook does not belong to this project.',
        403,
        'stripe_project_mismatch',
      );
    }

    // A webhook carries no session, so there is no ambient tenant to scope this
    // write with — `getConnectionById` above ran on migration 0034's
    // single-row self-identification clause precisely to learn one. Pin it now:
    // `connections` is RLS-covered, and without this the UPDATE matches zero
    // rows and `lastUsedAt` silently never advances (no error — an UPDATE whose
    // USING clause filters everything out is not an error in Postgres).
    await runWithTenantContext(connection.tenantId, () =>
      this.dependencies.markUsed(connectionId));
    return {
      received: true,
      eventType: event.type,
      paymentIntentId: typeof paymentIntent?.id === 'string' ? paymentIntent.id : undefined,
      paymentStatus: typeof paymentIntent?.status === 'string' ? paymentIntent.status : undefined,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, secret: string): void {
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
    const ageSeconds = Math.abs(Math.floor(this.dependencies.now() / 1000) - timestamp);
    if (ageSeconds > 300) {
      throw new LegalIntegrationError('Expired Stripe webhook signature.', 401, 'stripe_expired_signature');
    }
    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    if (!signaturesMatch(expected, signatures)) {
      throw new LegalIntegrationError('Invalid Stripe webhook signature.', 401, 'stripe_invalid_signature');
    }
  }

  private async resolveStripeConnection(
    projectId: string,
    connectionId: string,
  ): Promise<ResolvedConnection> {
    const resolved = await this.dependencies.resolve(projectId, connectionId);
    if (resolved.connection.authConfig.provider !== 'stripe') {
      throw new LegalIntegrationError('Stripe integration not found.', 404, 'stripe_not_found');
    }
    return resolved;
  }
}

export const stripePaymentService = new StripePaymentService();
