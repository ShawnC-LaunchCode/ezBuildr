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
          branding: branding ?? null,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    requirePermission('tenant:update' as any),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        // Validate request body
        const createTenantDomainSchema = z.object({
          domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid hostname format")
        });
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
        const challenge = brandingService.buildDomainChallenge(domain, newDomain.verificationToken ?? '');
        logger.info({ tenantId, domain }, 'Custom domain added');
        res.status(201).json({
          message: 'Domain added successfully. Please verify ownership.',
          domain: newDomain,
          verification: { host: challenge.host, type: 'TXT', value: challenge.value },
          verificationInstructions: `Create a DNS TXT record at "${challenge.host}" with value "${challenge.value}", then POST to the verify endpoint.`,
        });
      } catch (error: unknown) {
        // `isDomainAvailable` above is a tenant-scoped advisory check, so the
        // authoritative "taken by another tenant" answer arrives here as the
        // global unique constraint firing. Drizzle wraps pg errors, so the
        // SQLSTATE lives on `.cause`, not on the thrown error itself — reading
        // `error.code` finds undefined and would 500 on a plain conflict.
        const pgCode = (error as { cause?: { code?: string } })?.cause?.code;
        if (
          pgCode === '23505'
          || (error instanceof Error && error.message === 'Domain already exists')
        ) {
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
   * POST /api/tenants/:tenantId/domains/:domainId/verify
   * Verify domain ownership via the DNS TXT challenge (owner/builder only).
   * Until verified, the domain does not resolve branding (SEC-026).
   */
  app.post(
    '/api/tenants/:tenantId/domains/:domainId/verify',
    hybridAuth,
    validateTenantParam,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    requirePermission('tenant:update' as any),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tenantId, domainId } = req.params;
        const result = await brandingService.verifyDomain(tenantId, domainId);
        if (!result.verified) {
          res.status(400).json({
            message: 'Domain verification failed',
            error: 'verification_failed',
            reason: result.reason,
          });
          return;
        }
        logger.info({ tenantId, domainId }, 'Custom domain verified');
        res.json({ message: 'Domain verified successfully', verified: true });
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Domain does not belong to this tenant') {
          res.status(403).json({ message: 'Domain does not belong to this tenant', error: 'forbidden' });
          return;
        }
        if (error instanceof Error && error.message === 'Domain not found') {
          res.status(404).json({ message: 'Domain not found', error: 'domain_not_found' });
          return;
        }
        logger.error({ error }, 'Failed to verify domain');
        res.status(500).json({ message: 'Failed to verify domain', error: 'internal_error' });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
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
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Domain does not belong to this tenant') {
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