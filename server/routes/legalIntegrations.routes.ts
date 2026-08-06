import type { Express, Request, Response } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireProjectRole } from '../middleware/aclAuth';
import { hybridAuth } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';
import {
  clioIntegrationService,
  LegalIntegrationError,
  legalIntegrationService,
  stripePaymentService,
} from '../services/integrations';
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

const clioSetupSchema = z.object({
  name: z.string().trim().min(1).max(255).default('Clio Manage'),
  clientId: z.string().trim().min(1).max(500),
  clientSecret: z.string().trim().min(1).max(2000),
  region: z.enum(['us', 'eu', 'ca', 'au']).default('us'),
}).strict();

const personContactSchema = z.object({
  type: z.literal('Person'),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().min(1).max(255),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(3).max(50).optional(),
}).strict();

const companyContactSchema = z.object({
  type: z.literal('Company'),
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(3).max(50).optional(),
}).strict();

const clioContactSchema = z.discriminatedUnion('type', [
  personContactSchema,
  companyContactSchema,
]);

const clioDocumentSchema = z.object({
  fileName: z.string().trim().min(1).max(255).regex(/^[^\\/:*?"<>|]+$/),
  contentType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]),
  contentBase64: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
}).strict();

const stripeSetupSchema = z.object({
  name: z.string().trim().min(1).max(255).default('Stripe Payments'),
  secretKey: z.string().trim().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/),
  webhookSecret: z.string().trim().regex(/^whsec_[A-Za-z0-9]+$/),
}).strict();

const stripePaymentIntentSchema = z.object({
  amount: z.number().int().min(50).max(99_999_999),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toLowerCase()),
  idempotencyKey: z.string().trim().min(8).max(255),
  description: z.string().trim().max(500).optional(),
  receiptEmail: z.string().trim().email().optional(),
  reference: z.string().trim().max(100).optional(),
}).strict();

function applicationBaseUrl(req: Request): string {
  const configured = process.env.BASE_URL ?? process.env.PUBLIC_URL;
  return (configured ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`).replace(/\/$/, '');
}

function sendRouteError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: 'Invalid input', errors: error.issues });
    return;
  }
  if (error instanceof LegalIntegrationError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      retryable: error.retryable,
    });
    return;
  }
  if (error instanceof Error && error.message.includes('already exists')) {
    res.status(409).json({ message: error.message });
    return;
  }
  const classified = classifyRouteError(error, fallback);
  res.status(classified.status).json({ message: classified.message });
}

export function registerLegalIntegrationRoutes(app: Express): void {
  app.get(
    '/api/projects/:projectId/integrations',
    hybridAuth,
    requireProjectRole('view'),
    asyncHandler(async (req, res) => {
      try {
        res.json({ integrations: await legalIntegrationService.list(req.params.projectId) });
      } catch (error: unknown) {
        logger.error({ error, projectId: req.params.projectId }, 'Failed to list legal integrations');
        sendRouteError(res, error, 'Failed to list integrations');
      }
    }),
  );

  app.post(
    '/api/projects/:projectId/integrations/clio',
    hybridAuth,
    requireProjectRole('edit'),
    asyncHandler(async (req, res) => {
      try {
        const input = clioSetupSchema.parse(req.body);
        const result = await legalIntegrationService.setupClio(
          req.params.projectId,
          input,
          applicationBaseUrl(req),
        );
        res.status(201).json(result);
      } catch (error: unknown) {
        logger.error({ error, projectId: req.params.projectId }, 'Failed to configure Clio integration');
        sendRouteError(res, error, 'Failed to configure Clio');
      }
    }),
  );

  app.post(
    '/api/projects/:projectId/integrations/clio/:connectionId/contacts',
    hybridAuth,
    requireProjectRole('edit'),
    asyncHandler(async (req, res) => {
      try {
        const input = clioContactSchema.parse(req.body);
        const contact = await clioIntegrationService.createContact(
          req.params.projectId,
          req.params.connectionId,
          input,
        );
        res.status(201).json({ contact });
      } catch (error: unknown) {
        logger.error({
          error,
          projectId: req.params.projectId,
          connectionId: req.params.connectionId,
        }, 'Failed to create Clio contact');
        sendRouteError(res, error, 'Failed to create Clio contact');
      }
    }),
  );

  app.post(
    '/api/projects/:projectId/integrations/clio/:connectionId/authorize',
    hybridAuth,
    requireProjectRole('edit'),
    asyncHandler(async (req, res) => {
      try {
        const result = await legalIntegrationService.authorizeClio(
          req.params.projectId,
          req.params.connectionId,
          applicationBaseUrl(req),
        );
        res.json(result);
      } catch (error: unknown) {
        logger.error({
          error,
          projectId: req.params.projectId,
          connectionId: req.params.connectionId,
        }, 'Failed to restart Clio authorization');
        sendRouteError(res, error, 'Failed to authorize Clio');
      }
    }),
  );

  app.post(
    '/api/projects/:projectId/integrations/clio/:connectionId/matters/:matterId/documents',
    hybridAuth,
    requireProjectRole('edit'),
    asyncHandler(async (req, res) => {
      try {
        const matterId = z.coerce.number().int().positive().parse(req.params.matterId);
        const input = clioDocumentSchema.parse(req.body);
        const document = await clioIntegrationService.fileMatterDocument(
          req.params.projectId,
          req.params.connectionId,
          { matterId, ...input },
        );
        res.status(201).json({ document });
      } catch (error: unknown) {
        logger.error({
          error,
          projectId: req.params.projectId,
          connectionId: req.params.connectionId,
        }, 'Failed to file Clio matter document');
        sendRouteError(res, error, 'Failed to file Clio matter document');
      }
    }),
  );

  app.post(
    '/api/projects/:projectId/integrations/stripe',
    hybridAuth,
    requireProjectRole('edit'),
    asyncHandler(async (req, res) => {
      try {
        const input = stripeSetupSchema.parse(req.body);
        const result = await legalIntegrationService.setupStripe(req.params.projectId, input);
        res.status(201).json(result);
      } catch (error: unknown) {
        logger.error({ error, projectId: req.params.projectId }, 'Failed to configure Stripe integration');
        sendRouteError(res, error, 'Failed to configure Stripe');
      }
    }),
  );

  app.post(
    '/api/projects/:projectId/integrations/stripe/:connectionId/payment-intents',
    hybridAuth,
    requireProjectRole('edit'),
    asyncHandler(async (req, res) => {
      try {
        const input = stripePaymentIntentSchema.parse(req.body);
        const paymentIntent = await stripePaymentService.createPaymentIntent(
          req.params.projectId,
          req.params.connectionId,
          input,
        );
        res.status(201).json({ paymentIntent });
      } catch (error: unknown) {
        logger.error({
          error,
          projectId: req.params.projectId,
          connectionId: req.params.connectionId,
        }, 'Failed to create Stripe PaymentIntent');
        sendRouteError(res, error, 'Failed to create payment');
      }
    }),
  );

  app.post(
    '/api/integrations/stripe/webhook/:connectionId',
    strictLimiter,
    asyncHandler(async (req, res) => {
      try {
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        const signature = req.get('stripe-signature');
        if (!rawBody || !signature) {
          throw new LegalIntegrationError(
            'Missing Stripe webhook signature.',
            401,
            'stripe_missing_signature',
          );
        }
        const result = await stripePaymentService.handleWebhook(
          req.params.connectionId,
          rawBody,
          signature,
        );
        res.json(result);
      } catch (error: unknown) {
        logger.warn({ error, connectionId: req.params.connectionId }, 'Stripe webhook rejected');
        sendRouteError(res, error, 'Stripe webhook failed');
      }
    }),
  );
}
