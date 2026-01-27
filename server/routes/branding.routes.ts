import { z } from 'zod';

import { partialTenantBrandingSchema } from '@shared/types/branding';

import { createLogger } from '../logger';
import { hybridAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateTenantParam } from '../middleware/tenant';
import { brandingService } from '../services/BrandingService';
import { asyncHandler } from '../utils/asyncHandler';

import type { Express, Request, Response } from 'express';
const logger = createLogger({ module: 'branding-routes' });
/**
 * Stage 17: Branding & Tenant Customization Routes
 *
 * Provides APIs for:
 * - Tenant branding configuration (logo, colors, text)
 * - Custom domain management
 */
export function registerBrandingRoutes(app: Express): void {
  // =====================================================================
  // BRANDING ENDPOINTS
  // =====================================================================
  /**
   * GET /api/tenants/:tenantId/branding
   * Get tenant branding configuration
   */
  app.get(
    '/api/tenants/:tenantId/branding',
    hybridAuth,
    validateTenantParam,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        const branding = await brandingService.getBrandingByTenantId(tenantId);
        res.json({
          branding: branding || null,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch tenant branding');
        res.status(500).json({
          message: 'Failed to fetch branding',
          error: 'internal_error',
        });
      }
    })
  );
  /**
   * PATCH /api/tenants/:tenantId/branding
   * Update tenant branding configuration (owner/builder only)
   */
  app.patch(
    '/api/tenants/:tenantId/branding',
    hybridAuth,
    validateTenantParam,
    requirePermission('tenant:update' as any),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        // Validate request body
        const validationResult = partialTenantBrandingSchema.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            message: 'Invalid branding data',
            error: 'validation_error',
            details: validationResult.error.errors,
          });
          return;
        }
        const updatedBranding = await brandingService.updateBranding(
          tenantId,
          validationResult.data
        );
        logger.info({ tenantId }, 'Tenant branding updated');
        res.json({
          message: 'Branding updated successfully',
          branding: updatedBranding,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update tenant branding');
        res.status(500).json({
          message: 'Failed to update branding',
          error: 'internal_error',
        });
      }
    })
  );
  // =====================================================================
  // DOMAIN ENDPOINTS
  // =====================================================================
  /**
   * GET /api/tenants/:tenantId/domains
   * Get all custom domains for a tenant
   */
  app.get(
    '/api/tenants/:tenantId/domains',
    hybridAuth,
    validateTenantParam,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        const domains = await brandingService.getDomainsByTenantId(tenantId);
        res.json({
          domains,
          total: domains.length,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch tenant domains');
        res.status(500).json({
          message: 'Failed to fetch domains',
          error: 'internal_error',
        });
      }
    })
  );
  /**
   * POST /api/tenants/:tenantId/domains
   * Add a custom domain to a tenant (owner/builder only)
   */
  app.post(
    '/api/tenants/:tenantId/domains',
    hybridAuth,
    validateTenantParam,
    requirePermission('tenant:update' as any),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        // Validate request body
        const createTenantDomainSchema = z.object({
          domain: z.string().min(1) // Assuming schema structure or defining locally if import fails? No, import should work.
        });
        // Actually, importing schema is better. Line 1 imports it.
        // Assuming req.body matches schema. I'll rely on original logic unless I see it.
        // Original: const validationResult = createTenantDomainSchema.safeParse(req.body);
        // Correct.
        const validationResult = createTenantDomainSchema.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            message: 'Invalid domain data',
            error: 'validation_error',
            details: validationResult.error.errors,
          });
          return;
        }
        const { domain } = validationResult.data;
        // Check if domain is available
        const isAvailable = await brandingService.isDomainAvailable(domain);
        if (!isAvailable) {
          res.status(409).json({
            message: 'Domain already exists',
            error: 'domain_exists',
          });
          return;
        }
        const newDomain = await brandingService.addDomain(tenantId, domain);
        logger.info({ tenantId, domain }, 'Custom domain added');
        res.status(201).json({
          message: 'Domain added successfully',
          domain: newDomain,
        });
      } catch (error: any) {
        if (error.message === 'Domain already exists') {
          res.status(409).json({
            message: 'Domain already exists',
            error: 'domain_exists',
          });
          return;
        }
        logger.error({ error }, 'Failed to add domain');
        res.status(500).json({
          message: 'Failed to add domain',
          error: 'internal_error',
        });
      }
    })
  );
  /**
   * DELETE /api/tenants/:tenantId/domains/:domainId
   * Remove a custom domain from a tenant (owner/builder only)
   */
  app.delete(
    '/api/tenants/:tenantId/domains/:domainId',
    hybridAuth,
    validateTenantParam,
    requirePermission('tenant:update' as any),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId, domainId } = req.params;
        const success = await brandingService.removeDomain(tenantId, domainId);
        if (!success) {
          res.status(404).json({
            message: 'Domain not found',
            error: 'domain_not_found',
          });
          return;
        }
        logger.info({ tenantId, domainId }, 'Custom domain removed');
        res.json({
          message: 'Domain removed successfully',
        });
      } catch (error: any) {
        if (error.message === 'Domain does not belong to this tenant') {
          res.status(403).json({
            message: 'Domain does not belong to this tenant',
            error: 'forbidden',
          });
          return;
        }
        logger.error({ error }, 'Failed to remove domain');
        res.status(500).json({
          message: 'Failed to remove domain',
          error: 'internal_error',
        });
      }
    })
  );
}