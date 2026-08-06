import type { Express, Request, Response } from 'express';

import { logger } from '../logger';
import { hybridAuth } from '../middleware/auth';
import { validateTenantParam } from '../middleware/tenant';
import { documentDeliveryService, sanitizeDeliveryForResponse } from '../services/document/delivery/DocumentDeliveryService';
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

/**
 * Register document delivery routes
 */
export function registerDocumentDeliveryRoutes(app: Express): void {
  /**
   * GET /api/tenants/:tenantId/runs/:runId/deliveries
   * List all delivery records for a specific workflow run
   */
  app.get(
    '/api/tenants/:tenantId/runs/:runId/deliveries',
    hybridAuth,
    validateTenantParam,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId, runId } = req.params;

        const deliveries = await documentDeliveryService.listDeliveriesForRun(runId, tenantId);
        const sanitized = deliveries.map((delivery) => sanitizeDeliveryForResponse(delivery));
        res.json(sanitized);
      } catch (error) {
        logger.error({ error, runId: req.params.runId }, 'Error listing document deliveries for run');
        const { status, message } = classifyRouteError(error, 'Failed to list document deliveries');
        res.status(status).json({ message });
      }
    })
  );

  /**
   * GET /api/tenants/:tenantId/deliveries/:deliveryId
   * Get single delivery record with audit trail
   */
  app.get(
    '/api/tenants/:tenantId/deliveries/:deliveryId',
    hybridAuth,
    validateTenantParam,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId, deliveryId } = req.params;

        const delivery = await documentDeliveryService.getDeliveryForTenant(deliveryId, tenantId);
        res.json(sanitizeDeliveryForResponse(delivery));
      } catch (error) {
        logger.error({ error, deliveryId: req.params.deliveryId }, 'Error fetching document delivery');
        const { status, message } = classifyRouteError(error, 'Failed to fetch document delivery');
        res.status(status).json({ message });
      }
    })
  );

  /**
   * POST /api/tenants/:tenantId/deliveries/:deliveryId/retry
   * Manually retry a failed delivery record
   */
  app.post(
    '/api/tenants/:tenantId/deliveries/:deliveryId/retry',
    hybridAuth,
    validateTenantParam,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId, deliveryId } = req.params;

        const retried = await documentDeliveryService.retryDelivery(deliveryId, tenantId);
        res.json(sanitizeDeliveryForResponse(retried));
      } catch (error) {
        logger.error({ error, deliveryId: req.params.deliveryId }, 'Error retrying document delivery');
        const { status, message } = classifyRouteError(error, 'Failed to retry document delivery');
        res.status(status).json({ message });
      }
    })
  );
}
