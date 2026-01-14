import { createLogger } from '../logger';

import type { AuthRequest } from './auth';
import type { Request, Response, NextFunction } from 'express';

const logger = createLogger({ module: 'tenant-middleware' });

/**
 * Tenant Middleware
 * Ensures every request has a valid tenantId bound and validates tenant access
 *
 * This middleware should be used after authentication middleware to ensure
 * tenant isolation and prevent cross-tenant data access.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;

  // Check if user has a tenant
  if (!authReq.tenantId) {
    logger.warn({
      userId: authReq.userId,
      path: req.path,
    }, 'User does not have an associated tenant');

    res.status(403).json({
      message: 'Tenant required',
      error: 'no_tenant',
      details: 'Your account is not associated with any tenant. Please contact support.',
    });
    return;
  }

  logger.debug({
    userId: authReq.userId,
    tenantId: authReq.tenantId,
    path: req.path,
  }, 'Tenant validation successful');

  next();
}

/**
 * Validate Tenant Access for Resource
 * Ensures that the user's tenantId matches the resource's tenantId
 *
 * @param resourceTenantId - The tenantId of the resource being accessed
 * @param req - Express request object
 * @returns true if access is allowed, false otherwise
 */
export function validateTenantAccess(resourceTenantId: string | null, req: Request): boolean {
  const authReq = req as AuthRequest;

  // If resource has no tenant, allow access (for backward compatibility)
  if (!resourceTenantId) {
    logger.debug('Resource has no tenant, allowing access');
    return true;
  }

  // If user has no tenant, deny access
  if (!authReq.tenantId) {
    logger.warn({
      userId: authReq.userId,
      resourceTenantId,
    }, 'User has no tenant, denying access');
    return false;
  }

  // Check if tenants match
  const accessAllowed = authReq.tenantId === resourceTenantId;

  if (!accessAllowed) {
    logger.warn({
      userId: authReq.userId,
      userTenantId: authReq.tenantId,
      resourceTenantId,
    }, 'Tenant mismatch, denying access');
  }

  return accessAllowed;
}

/**
 * Tenant Isolation Middleware for Request Parameters
 * Validates that route parameters like :tenantId match the authenticated user's tenant
 *
 * Usage: app.get('/api/tenants/:tenantId/projects', hybridAuth, validateTenantParam, handler)
 */
export function validateTenantParam(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  const paramTenantId = req.params.tenantId;

  // If no tenant ID in params, skip validation
  if (!paramTenantId) {
    next();
    return;
  }

  // Validate that param tenant matches user's tenant
  if (!authReq.tenantId) {
    logger.warn({
      userId: authReq.userId,
      paramTenantId,
      path: req.path,
    }, 'User has no tenant, cannot access tenant-specific route');

    res.status(403).json({
      message: 'Tenant access denied',
      error: 'no_tenant',
    });
    return;
  }

  if (authReq.tenantId !== paramTenantId) {
    logger.warn({
      userId: authReq.userId,
      userTenantId: authReq.tenantId,
      paramTenantId,
      path: req.path,
    }, 'Tenant ID mismatch in route parameter');

    res.status(403).json({
      message: 'Access denied',
      error: 'tenant_mismatch',
      details: 'You do not have access to this tenant',
    });
    return;
  }

  logger.debug({
    userId: authReq.userId,
    tenantId: authReq.tenantId,
    path: req.path,
  }, 'Tenant parameter validation successful');

  next();
}

/**
 * Optional Tenant Header Middleware
 * Allows clients to specify tenant via x-tenant-id header (for API clients)
 * This does NOT override the user's tenant, only validates it matches
 */
export function validateTenantHeader(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  const headerTenantId = req.headers['x-tenant-id'] as string | undefined;

  // If no tenant header, skip validation
  if (!headerTenantId) {
    next();
    return;
  }

  // Validate that header tenant matches user's tenant
  if (!authReq.tenantId) {
    logger.warn({
      userId: authReq.userId,
      headerTenantId,
      path: req.path,
    }, 'User has no tenant, cannot use x-tenant-id header');

    res.status(403).json({
      message: 'Tenant header not allowed',
      error: 'no_tenant',
    });
    return;
  }

  if (authReq.tenantId !== headerTenantId) {
    logger.warn({
      userId: authReq.userId,
      userTenantId: authReq.tenantId,
      headerTenantId,
      path: req.path,
    }, 'Tenant ID mismatch in header');

    res.status(403).json({
      message: 'Tenant mismatch',
      error: 'tenant_mismatch',
      details: 'x-tenant-id header does not match your tenant',
    });
    return;
  }

  logger.debug({
    userId: authReq.userId,
    tenantId: authReq.tenantId,
    path: req.path,
  }, 'Tenant header validation successful');

  next();
}

/**
 * Get tenant ID from request (utility function)
 */
export function getTenantId(req: Request): string | undefined {
  const authReq = req as AuthRequest;
  return authReq.tenantId;
}

/**
 * Ensure Tenant Middleware
 * Combines authentication and tenant validation in one middleware
 * Use this as a shorthand for hybridAuth + requireTenant
 */
export function ensureTenant(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;

  // Check authentication
  if (!authReq.userId) {
    logger.warn({ path: req.path }, 'No authenticated user');
    res.status(401).json({
      message: 'Authentication required',
      error: 'unauthorized',
    });
    return;
  }

  // Check tenant
  if (!authReq.tenantId) {
    logger.warn({
      userId: authReq.userId,
      path: req.path,
    }, 'User does not have an associated tenant');

    res.status(403).json({
      message: 'Tenant required',
      error: 'no_tenant',
      details: 'Your account is not associated with any tenant. Please contact support.',
    });
    return;
  }

  logger.debug({
    userId: authReq.userId,
    tenantId: authReq.tenantId,
    path: req.path,
  }, 'Authentication and tenant validation successful');

  next();
}
