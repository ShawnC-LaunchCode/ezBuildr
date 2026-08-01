/**
 * E-Signature API Routes
 * Handles signature block execution and callbacks
 *
 * Routes:
 * POST /api/esign/execute/:runId/:stepId - Execute signature block
 * GET  /api/esign/status/:envelopeId - Get envelope status
 * POST /api/esign/callback/:runId/:stepId - Provider callback (webhook)
 * POST /api/esign/callback/docusign - DocuSign Connect webhook
 *
 * @version 1.0.0 - Prompt 11 (E-Signature Integration)
 * @date December 2025
 */

import { eq } from 'drizzle-orm';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { workflowRuns } from '@shared/schema';

import { db } from '../db';
import { logger } from '../logger';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';
import { EsignProviderFactory } from '../services/esign';
import { SignatureBlockService } from '../services/esign/SignatureBlockService';
import { workflowService } from '../services/WorkflowService';
import { asyncHandler } from '../utils/asyncHandler';

import type { SignatureBlockConfig } from '../../shared/types/stepConfigs';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const ExecuteSignatureBlockSchema = z.object({
  config: z.object({
    signerRole: z.string(),
    routingOrder: z.number(),
    documents: z.array(z.object({
      id: z.string(),
      documentId: z.string(),
      mapping: z.record(z.object({
        type: z.literal('variable'),
        source: z.string(),
      })).optional(),
    })),
    provider: z.enum(['docusign', 'hellosign', 'native']).optional(),
    markdownHeader: z.string().optional(),
    allowDecline: z.boolean().optional(),
    expiresInDays: z.number().optional(),
    signerEmail: z.string().optional(),
    signerName: z.string().optional(),
    message: z.string().optional(),
    redirectUrl: z.string().url().refine(val => {
      try {
        const url = new URL(val);
        if (!['http:', 'https:'].includes(url.protocol)) {return false;}
        
        const allowedHosts = ['localhost', 'ezbuildr.com'];
        if (process.env.PUBLIC_URL) {
          try { allowedHosts.push(new URL(process.env.PUBLIC_URL).hostname); } catch {
            // Ignore invalid PUBLIC_URL values during redirect allow-list construction.
          }
        }
        return allowedHosts.includes(url.hostname);
      } catch {
        return false;
      }
    }, 'Must be a valid HTTP/HTTPS URL from an allowed host').optional(),
  }),
  variableData: z.record(z.any()),
  preview: z.boolean().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/esign/execute/:runId/:stepId
 * Execute a signature block
 *
 * Body:
 * - config: SignatureBlockConfig
 * - variableData: Record<string, any>
 * - preview?: boolean
 */
router.post(
  '/execute/:runId/:stepId',
  strictLimiter,
  hybridAuth,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId, stepId } = req.params;
      const parsed = ExecuteSignatureBlockSchema.parse(req.body);

      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Verify run ownership
      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
      if (run === undefined) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      
      await workflowService.verifyAccess(run.workflowId, userId, 'edit');

      // Get base URL for callback
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Execute signature block
      const result = await SignatureBlockService.executeSignatureBlock({
        runId,
        stepId,
        config: parsed.config as SignatureBlockConfig,
        variableData: parsed.variableData,
        userId,
        preview: parsed.preview ?? false,
        baseUrl,
      });

      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      next(error);
    }
  })
);

/**
 * GET /api/esign/status/:envelopeId
 * Get envelope status
 *
 * Query params:
 * - provider: string (default: docusign)
 */
router.get(
  '/status/:envelopeId',
  hybridAuth,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { envelopeId } = req.params;
      const provider = (req.query.provider as string) || 'docusign';
      const runId = req.query.runId as string;

      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      if (!runId) {
        res.status(400).json({ error: "runId query parameter is required for authorization" });
        return;
      }

      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
      if (run === undefined) {
        res.status(404).json({ error: "Run not found" });
        return;
      }

      await workflowService.verifyAccess(run.workflowId, userId, 'view');

      // Security check: Verify envelopeId belongs to this run (if DB is implemented)
      const sigReq = await SignatureBlockService.findSignatureRequestByEnvelope(envelopeId);
      if (sigReq && sigReq.runId !== runId) {
        res.status(403).json({ error: "Access denied: envelope does not belong to run" });
        return;
      }

      const providerInstance = EsignProviderFactory.getProvider(provider);
      const status = await providerInstance.getEnvelopeStatus(envelopeId);

      res.json(status);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      next(error);
    }
  })
);

/**
 * POST /api/esign/callback/:runId/:stepId
 * Generic callback endpoint for signature completion
 *
 * Body:
 * - envelopeId: string
 * - status: 'signed' | 'declined' | 'expired' | 'voided'
 * - completedAt?: string (ISO date)
 */
router.post(
  '/callback/:runId/:stepId',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId, stepId } = req.params;

      // SECURITY: authenticate the callback with the signed token
      // The token should be passed in the Authorization header as a Bearer token or in the body
      const authHeader = req.headers.authorization;
      let token: string | undefined;
      
      if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
      } else if (req.body && typeof req.body.token === 'string') {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
          token = req.body.token;
      }
      
      if (!SignatureBlockService.verifyCallbackToken(runId, stepId, token)) {
        logger.warn({ runId, stepId }, '[Esign] Rejected signature callback with missing/invalid token');
        res.status(401).json({ error: 'Invalid or missing callback token' });
        return;
      }

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
      const { envelopeId, status, completedAt, ...eventData } = req.body;

      await SignatureBlockService.handleSignatureCallback(
        runId,
        stepId,
        {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
          envelopeId,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
          status,
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
          completedAt: completedAt ? new Date(completedAt) : undefined,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
          eventData,
        }
      );

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  })
);

/**
 * POST /api/esign/callback/docusign
 * DocuSign Connect webhook endpoint
 *
 * DocuSign will POST XML or JSON payloads here on envelope events
 */
router.post(
  '/callback/docusign',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
      const payload = req.body;
      const signature = req.headers['x-docusign-signature-1'] as string;

      // Get provider
      const provider = EsignProviderFactory.getProvider('docusign');

      // Verify signature
      const isValid = await provider.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Parse event
      const event = await provider.parseWebhookEvent(payload);

      // Extract runId and stepId from event metadata
      // (These should have been stored when creating the envelope)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
      const { runId, stepId } = payload.customFields || {};

      if (!runId || !stepId) {
        logger.warn({ event }, '[Esign] DocuSign webhook missing runId/stepId:');
        res.status(400).json({ error: 'Missing runId or stepId in webhook' });
        return;
      }

      // Handle callback
      await SignatureBlockService.handleSignatureCallback(
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
        runId,
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
        stepId,
        {
          envelopeId: event.envelopeId,
          status: event.type === 'signed' || event.type === 'completed' ? 'signed' :
            event.type === 'declined' ? 'declined' :
              event.type === 'voided' ? 'voided' : 'expired',
          completedAt: event.timestamp,
          eventData: event.data,
        }
      );

      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, '[Esign] DocuSign webhook error:');
      // Return 500 so DocuSign retries the event delivery
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  })
);

/**
 * GET /api/esign/providers
 * List available e-signature providers
 */
router.get(
  '/providers',
  hybridAuth,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userRole = (req as AuthRequest).userRole;
      if (userRole !== 'owner' && userRole !== 'builder') {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }

      const providers = EsignProviderFactory.getAllProviders();
      res.json({ providers });
    } catch (error) {
      next(error);
    }
  })
);

/**
 * POST /api/esign/test
 * Test e-signature provider configuration
 *
 * Body:
 * - provider: string
 */
router.post(
  '/test',
  hybridAuth,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const userRole = (req as AuthRequest).userRole;
      if (userRole !== 'owner' && userRole !== 'builder') {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
      const { provider = 'docusign' } = req.body;

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
      const providerInstance = EsignProviderFactory.getProvider(provider);

      res.json({
        success: true,
        provider: providerInstance.name,
        message: 'Provider is configured and available',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

export default router;

/**
 * Register esign routes on Express app
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerEsignRoutes(app: any): void {
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
  app.use('/api/esign', router);
  logger.info('[Routes] E-Signature routes registered at /api/esign');
}
