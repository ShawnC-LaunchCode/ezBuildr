import { partialTenantBrandingSchema, createTenantDomainSchema } from '@shared/types/branding';

import { createLogger } from '../logger';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateTenantParam } from '../middleware/tenant';
import { brandingService } from '../services/BrandingService';

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
    async (req: Request, res: Response) => {
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
    }
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
    async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;

        // Validate request body
        const validationResult = partialTenantBrandingSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: 'Invalid branding data',
            error: 'validation_error',
            details: validationResult.error.errors,
          });
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
    }
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
    async (req: Request, res: Response) => {
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
    }
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
    async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;

        // Validate request body
        const validationResult = createTenantDomainSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: 'Invalid domain data',
            error: 'validation_error',
            details: validationResult.error.errors,
          });
        }

        const { domain } = validationResult.data;

        // Check if domain is available
        const isAvailable = await brandingService.isDomainAvailable(domain);
        if (!isAvailable) {
          return res.status(409).json({
            message: 'Domain already exists',
            error: 'domain_exists',
          });
        }

        const newDomain = await brandingService.addDomain(tenantId, domain);

        logger.info({ tenantId, domain }, 'Custom domain added');

        res.status(201).json({
          message: 'Domain added successfully',
          domain: newDomain,
        });
      } catch (error: any) {
        if (error.message === 'Domain already exists') {
          return res.status(409).json({
            message: 'Domain already exists',
            error: 'domain_exists',
          });
        }

        logger.error({ error }, 'Failed to add domain');
        res.status(500).json({
          message: 'Failed to add domain',
          error: 'internal_error',
        });
      }
    }
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
    async (req: Request, res: Response) => {
      try {
        const { tenantId, domainId } = req.params;

        const success = await brandingService.removeDomain(tenantId, domainId);

        if (!success) {
          return res.status(404).json({
            message: 'Domain not found',
            error: 'domain_not_found',
          });
        }

        logger.info({ tenantId, domainId }, 'Custom domain removed');

        res.json({
          message: 'Domain removed successfully',
        });
      } catch (error: any) {
        if (error.message === 'Domain does not belong to this tenant') {
          return res.status(403).json({
            message: 'Domain does not belong to this tenant',
            error: 'forbidden',
          });
        }

        logger.error({ error }, 'Failed to remove domain');
        res.status(500).json({
          message: 'Failed to remove domain',
          error: 'internal_error',
        });
      }
    }
  );
}
