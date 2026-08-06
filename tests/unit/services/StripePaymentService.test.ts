import crypto from 'crypto';

import { describe, expect, it, vi } from 'vitest';

import type { Connection, ResolvedConnection } from '../../../shared/types';
import { StripePaymentService } from '../../../server/services/integrations/StripePaymentService';

const NOW = 1_800_000_000_000;

function stripeConnection(): Connection {
  return {
    id: 'connection-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    name: 'Stripe Payments',
    type: 'bearer',
    baseUrl: 'https://api.stripe.com',
    authConfig: { provider: 'stripe', tokenRef: 'secretKey' },
    secretRefs: { secretKey: 'stripe-key', webhookSecret: 'stripe-webhook-key' },
    defaultHeaders: {},
    timeoutMs: 8000,
    retries: 2,
    backoffMs: 250,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function resolvedStripe(): ResolvedConnection {
  return { connection: stripeConnection(), secrets: { secretKey: 'sk_test_secret' } };
}

function sign(rawBody: Buffer, secret: string, timestamp = Math.floor(NOW / 1000)): string {
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('StripePaymentService', () => {
  it('creates an idempotent PaymentIntent with project-scoped metadata', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'pi_123',
      client_secret: 'pi_123_secret_abc',
      status: 'requires_payment_method',
      amount: 2500,
      currency: 'usd',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const service = new StripePaymentService({
      resolve: vi.fn().mockResolvedValue(resolvedStripe()),
      request,
      markUsed: vi.fn().mockResolvedValue(undefined),
    });

    const result = await service.createPaymentIntent('project-1', 'connection-1', {
      amount: 2500,
      currency: 'USD',
      idempotencyKey: 'matter-314-payment-1',
      reference: 'matter-314',
    });

    expect(result).toEqual({
      id: 'pi_123',
      clientSecret: 'pi_123_secret_abc',
      status: 'requires_payment_method',
      amount: 2500,
      currency: 'usd',
    });
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/payment_intents');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk_test_secret',
      'Idempotency-Key': 'matter-314-payment-1',
    });
    const form = new URLSearchParams(init.body as string);
    expect(form.get('metadata[project_id]')).toBe('project-1');
    expect(form.get('metadata[reference]')).toBe('matter-314');
    expect(form.get('automatic_payment_methods[enabled]')).toBe('true');
  });

  it('confirms a fresh, project-matched Stripe webhook signature', async () => {
    const rawBody = Buffer.from(JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123', status: 'succeeded', metadata: { project_id: 'project-1' } } },
    }));
    const markUsed = vi.fn().mockResolvedValue(undefined);
    const service = new StripePaymentService({
      findConnection: vi.fn().mockResolvedValue(stripeConnection()),
      getSecret: vi.fn().mockResolvedValue('whsec_secret'),
      markUsed,
      now: () => NOW,
    });

    await expect(service.handleWebhook(
      'connection-1',
      rawBody,
      sign(rawBody, 'whsec_secret'),
    )).resolves.toEqual({
      received: true,
      eventType: 'payment_intent.succeeded',
      paymentIntentId: 'pi_123',
      paymentStatus: 'succeeded',
    });
    expect(markUsed).toHaveBeenCalledWith('connection-1');
  });

  it('rejects invalid, expired, and cross-project webhook events', async () => {
    const rawBody = Buffer.from(JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123', metadata: { project_id: 'other-project' } } },
    }));
    const service = new StripePaymentService({
      findConnection: vi.fn().mockResolvedValue(stripeConnection()),
      getSecret: vi.fn().mockResolvedValue('whsec_secret'),
      markUsed: vi.fn().mockResolvedValue(undefined),
      now: () => NOW,
    });

    await expect(service.handleWebhook('connection-1', rawBody, 't=1,v1=bad'))
      .rejects.toMatchObject({ code: 'stripe_expired_signature', statusCode: 401 });
    await expect(service.handleWebhook('connection-1', rawBody, sign(rawBody, 'wrong-secret')))
      .rejects.toMatchObject({ code: 'stripe_invalid_signature', statusCode: 401 });
    await expect(service.handleWebhook('connection-1', rawBody, sign(rawBody, 'whsec_secret')))
      .rejects.toMatchObject({ code: 'stripe_project_mismatch', statusCode: 403 });
  });

  it('sanitizes upstream Stripe failures', async () => {
    const service = new StripePaymentService({
      resolve: vi.fn().mockResolvedValue(resolvedStripe()),
      request: vi.fn().mockResolvedValue(new Response(
        JSON.stringify({ error: { message: 'secret diagnostic' } }),
        { status: 429 },
      )),
      markUsed: vi.fn(),
    });

    const promise = service.createPaymentIntent('project-1', 'connection-1', {
      amount: 2500,
      currency: 'usd',
      idempotencyKey: 'matter-314-payment-1',
    });
    await expect(promise).rejects.toMatchObject({
      code: 'stripe_request_failed',
      statusCode: 503,
      retryable: true,
    });
    await expect(promise).rejects.not.toThrow('secret diagnostic');
  });
});
