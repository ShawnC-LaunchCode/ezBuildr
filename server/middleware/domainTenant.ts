import { createLogger } from '../logger';
import { brandingService } from '../services/BrandingService';

import type { Request, Response, NextFunction } from 'express';

const logger = createLogger({ module: 'domainTenant-middleware' });

/**
 * Stage 17: Domain Tenant Lookup Middleware
 *
 * This middleware checks if the incoming request's host matches a custom tenant domain.
 * If a match is found, it injects `req.tenantOverrideId` for use in downstream handlers.
 *
 * Use this middleware in:
 * - Intake portal routes
 * - Email preview routes
 * - Public frontend assets
 *
 * The middleware does NOT authenticate - it only identifies the tenant from the domain.
 */

// Extend Express Request type to include tenantOverrideId
declare global {
  namespace Express {
    interface Request {
      tenantOverrideId?: string;
      tenantBranding?: any; // TenantBranding from @shared/types/branding
    }
  }
}

/**
 * Domain tenant lookup middleware
 *
 * Checks if request host matches a custom domain and injects tenantOverrideId
 */
export async function domainTenantLookup(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract host from request
    const host = req.hostname || req.get('host')?.split(':')[0];

    if (!host) {
      logger.debug('No host found in request');
      return next();
    }

    // Skip domain lookup for common development/production hosts
    const skipHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      process.env.BASE_URL ? new URL(process.env.BASE_URL).hostname : null,
    ].filter(Boolean) as string[];

    if (skipHosts.includes(host)) {
      logger.debug({ host }, 'Skipping domain lookup for standard host');
      return next();
    }

    // Look up tenant by domain
    logger.debug({ host }, 'Looking up tenant for custom domain');
    const result = await brandingService.getBrandingForDomain(host);

    if (result) {
      // Inject tenant ID and branding into request
      req.tenantOverrideId = result.tenantId;
      req.tenantBranding = result.branding;

      logger.info(
        { host, tenantId: result.tenantId },
        'Custom domain matched - tenant override injected'
      );
    } else {
      logger.debug({ host }, 'No custom domain match found');
    }

    next();
  } catch (error) {
    // Log error but don't block the request
    logger.error({ error, host: req.hostname }, 'Error during domain tenant lookup');
    next();
  }
}

/**
 * Require domain tenant middleware
 *
 * Use this after domainTenantLookup to REQUIRE that a tenant was resolved from the domain.
 * Returns 404 if no tenant override was found.
 */
export function requireDomainTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.tenantOverrideId) {
    logger.warn({ host: req.hostname }, 'Domain tenant required but not found');
    res.status(404).json({
      message: 'Custom domain not configured',
      error: 'domain_not_found',
    });
    return;
  }

  next();
}
