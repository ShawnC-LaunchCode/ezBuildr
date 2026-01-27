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

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { EsignProviderFactory } from '../services/esign';
import { SignatureBlockService } from '../services/esign/SignatureBlockService';
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
    redirectUrl: z.string().optional(),
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId, stepId } = req.params;
      const parsed = ExecuteSignatureBlockSchema.parse(req.body);

      // Get base URL for callback
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Execute signature block
      const result = await SignatureBlockService.executeSignatureBlock({
        runId,
        stepId,
        config: parsed.config as SignatureBlockConfig,
        variableData: parsed.variableData,
        userId: (req as any).userId, // From auth middleware
        preview: parsed.preview || false,
        baseUrl,
      });

      res.json(result);
    } catch (error) {
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { envelopeId } = req.params;
      const provider = (req.query.provider as string) || 'docusign';

      const providerInstance = EsignProviderFactory.getProvider(provider);
      const status = await providerInstance.getEnvelopeStatus(envelopeId);

      res.json(status);
    } catch (error) {
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
      const { envelopeId, status, completedAt, ...eventData } = req.body;

      await SignatureBlockService.handleSignatureCallback(
        runId,
        stepId,
        {
          envelopeId,
          status,
          completedAt: completedAt ? new Date(completedAt) : undefined,
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
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
      const { runId, stepId } = payload.customFields || {};

      if (!runId || !stepId) {
        logger.warn({ event }, '[Esign] DocuSign webhook missing runId/stepId:');
        res.status(400).json({ error: 'Missing runId or stepId in webhook' });
        return;
      }

      // Handle callback
      await SignatureBlockService.handleSignatureCallback(
        runId,
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
      // Return 200 to prevent DocuSign from retrying
      res.status(200).json({ error: 'Webhook processing failed' });
    }
  })
);

/**
 * GET /api/esign/providers
 * List available e-signature providers
 */
router.get(
  '/providers',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider = 'docusign' } = req.body;

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
export function registerEsignRoutes(app: any): void {
  app.use('/api/esign', router);
  logger.info('[Routes] E-Signature routes registered at /api/esign');
}
