/** E-signature execution, status, return-callback, and provider webhook routes. */

import { Router, type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { optionalHybridAuth, type AuthRequest } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth';
import { workflowRunRepository } from '../repositories/WorkflowRunRepository';
import { EsignProviderFactory } from '../services/esign';
import { SignatureBlockService } from '../services/esign/SignatureBlockService';
import { workflowService } from '../services/WorkflowService';
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

const router = Router();

const executeSignatureBlockSchema = z.object({}).strict();
const callbackSchema = z.object({
  envelopeId: z.string().min(1),
  status: z.enum(['signed', 'declined', 'expired', 'voided']),
  completedAt: z.string().datetime().optional(),
  token: z.string().optional(),
}).passthrough();
const providerQuerySchema = z.object({
  provider: z.enum(['docusign', 'hellosign', 'native']).default('docusign'),
});

async function authorizeRun(
  req: Request,
  res: Response,
  runId: string,
  permission: 'view' | 'edit'
): Promise<boolean> {
  const runAuth = (req as RunAuthRequest).runAuth;
  if (runAuth) {
    if (runAuth.runId !== runId) {
      res.status(403).json({ error: 'Access denied - run mismatch' });
      return false;
    }
    return true;
  }

  const userId = (req as AuthRequest).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  const request = await SignatureBlockService.findSignatureRequestByEnvelope(
    typeof req.params.envelopeId === 'string' ? req.params.envelopeId : ''
  );
  if (request && request.runId !== runId) {
    res.status(403).json({ error: 'Access denied - envelope does not belong to run' });
    return false;
  }

  // The service checks the workflow row; this route only supplies the run's
  // workflow ID for creator authorization when a request already exists.
  if (request) {
    const signatureRun = await workflowRunRepository.findById(request.runId);
    if (!signatureRun) {
      res.status(404).json({ error: 'Run not found' });
      return false;
    }
    await workflowService.verifyAccess(signatureRun.workflowId, userId, permission);
    return true;
  }

  const run = await workflowRunRepository.findById(runId);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return false;
  }
  await workflowService.verifyAccess(run.workflowId, userId, permission);
  return true;
}

router.post(
  '/execute/:runId/:stepId',
  strictLimiter,
  optionalHybridAuth,
  creatorOrRunTokenAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      executeSignatureBlockSchema.parse(req.body ?? {});
      const { runId, stepId } = req.params;
      if (!await authorizeRun(req, res, runId, 'edit')) { return; }

      const configuredBaseUrl = process.env.BASE_URL ?? process.env.PUBLIC_URL;
      const baseUrl = configuredBaseUrl ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`;
      const result = await SignatureBlockService.executeSignatureBlock({
        runId,
        stepId,
        userId: (req as AuthRequest).userId,
        baseUrl,
      });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', errors: error.issues });
        return;
      }
      logger.error({ error, runId: req.params.runId, stepId: req.params.stepId }, 'Error executing signature block');
      const { status, message } = classifyRouteError(error, 'Failed to execute signature block');
      res.status(status).json({ error: message });
    }
  })
);

router.get(
  '/status/:envelopeId',
  optionalHybridAuth,
  creatorOrRunTokenAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const runId = z.string().uuid().parse(req.query.runId);
      if (!await authorizeRun(req, res, runId, 'view')) { return; }
      const signatureRequest = await SignatureBlockService.findSignatureRequestByEnvelope(req.params.envelopeId);
      if (!signatureRequest) {
        res.status(404).json({ error: 'Signature request not found' });
        return;
      }
      const provider = EsignProviderFactory.getProvider(signatureRequest.provider);
      res.json(await provider.getEnvelopeStatus(req.params.envelopeId));
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'runId query parameter must be a UUID' });
        return;
      }
      logger.error({ error, envelopeId: req.params.envelopeId }, 'Error fetching signature status');
      const { status, message } = classifyRouteError(error, 'Failed to fetch signature status');
      res.status(status).json({ error: message });
    }
  })
);

router.post(
  '/callback/:runId/:stepId',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const parsed = callbackSchema.parse(req.body);
      const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
      const bearerToken = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined;
      const token = bearerToken ?? parsed.token ?? queryToken;
      if (!SignatureBlockService.verifyCallbackToken(req.params.runId, req.params.stepId, token)) {
        res.status(401).json({ error: 'Invalid or missing callback token' });
        return;
      }
      await SignatureBlockService.handleSignatureCallback(req.params.runId, req.params.stepId, {
        envelopeId: parsed.envelopeId,
        status: parsed.status,
        eventType: parsed.status,
        completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
        eventData: parsed,
      });
      res.json({ success: true });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid callback payload', errors: error.issues });
        return;
      }
      const { status, message } = classifyRouteError(error, 'Signature callback failed');
      res.status(status).json({ error: message });
    }
  })
);

router.post(
  ['/webhook/docusign', '/callback/docusign'],
  strictLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const provider = EsignProviderFactory.getProvider('docusign');
    const signatureHeader = req.headers['x-docusign-signature-1'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !await provider.verifyWebhookSignature(rawBody, signature ?? '')) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    try {
      const event = await provider.parseWebhookEvent(req.body);
      const terminalStatus = event.type === 'signed' || event.type === 'completed'
        ? 'signed'
        : event.type === 'declined'
          ? 'declined'
          : event.type === 'voided'
            ? 'voided'
            : event.type === 'expired'
              ? 'expired'
              : null;
      if (terminalStatus) {
        await SignatureBlockService.handleSignatureCallback(undefined, undefined, {
          envelopeId: event.envelopeId,
          status: terminalStatus,
          eventType: event.type,
          completedAt: event.timestamp,
          eventData: event.data,
        });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      logger.error({ error }, 'DocuSign webhook processing failed');
      // A 5xx response tells DocuSign Connect to retry delivery.
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  })
);

router.get(
  '/providers',
  optionalHybridAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const role = (req as AuthRequest).userRole;
    if (role !== 'owner' && role !== 'builder') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    res.json({ providers: EsignProviderFactory.getAllProviders() });
  })
);

router.post(
  '/test',
  optionalHybridAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const role = (req as AuthRequest).userRole;
    if (role !== 'owner' && role !== 'builder') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    try {
      const { provider } = providerQuerySchema.parse(req.body);
      const instance = EsignProviderFactory.getProvider(provider);
      res.json({ success: true, provider: instance.name, message: 'Provider is configured and available' });
    } catch (error: unknown) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid provider' });
    }
  })
);

export default router;

export function registerEsignRoutes(app: Express): void {
  app.use('/api/esign', router);
  logger.info('[Routes] E-Signature routes registered at /api/esign');
}
