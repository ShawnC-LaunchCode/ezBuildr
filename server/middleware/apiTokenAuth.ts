import type { Request, Response, NextFunction } from 'express';
import { datavaultApiTokensService } from '../services/DatavaultApiTokensService';
import { createLogger } from '../logger';
import type { DatavaultApiToken } from '@shared/schema';

const logger = createLogger({ module: 'api-token-auth' });

/**
 * Extended Express Request with API token information
 */
export interface ApiTokenAuthRequest extends Request {
  isApiUser?: boolean;
  apiToken?: DatavaultApiToken;
  tokenScopes?: string[];
  tokenDatabaseId?: string;
  tokenTenantId?: string;
}

/**
 * Extract API token from X-VaultLogic-API-Key header
 */
function extractApiToken(req: Request): string | null {
  const apiKeyHeader = req.headers['x-vaultlogic-api-key'];

  if (!apiKeyHeader) {
    return null;
  }

  if (typeof apiKeyHeader !== 'string') {
    return null;
  }

  return apiKeyHeader.trim();
}

/**
 * API Token Authentication Middleware
 * Validates API tokens from the X-VaultLogic-API-Key header
 * Attaches token info to request for downstream authorization
 */
export async function requireApiToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract API token from header
    const plainToken = extractApiToken(req);

    if (!plainToken) {
      logger.warn({ path: req.path }, 'No API token provided');
      res.status(401).json({
        message: 'API token required',
        error: 'missing_api_token',
      });
      return;
    }

    // Validate token
    const token = await datavaultApiTokensService.validateToken(plainToken);

    if (!token) {
      logger.warn({ path: req.path }, 'Invalid or expired API token');
      res.status(401).json({
        message: 'Invalid or expired API token',
        error: 'invalid_api_token',
      });
      return;
    }

    // Attach token info to request
    const authReq = req as ApiTokenAuthRequest;
    authReq.isApiUser = true;
    authReq.apiToken = token;
    authReq.tokenScopes = token.scopes;
    authReq.tokenDatabaseId = token.databaseId;
    authReq.tokenTenantId = token.tenantId;

    logger.debug(
      {
        databaseId: token.databaseId,
        scopes: token.scopes,
        path: req.path,
      },
      'API token authentication successful'
    );

    next();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), path: req.path },
      'API token authentication error'
    );
    res.status(500).json({
      message: 'Authentication error',
      error: 'internal_error',
    });
  }
}

/**
 * Require specific scope(s) for API token access
 * Use after requireApiToken middleware
 *
 * @param requiredScopes - Array of required scopes (any match grants access)
 */
export function requireScope(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as ApiTokenAuthRequest;

    if (!authReq.isApiUser || !authReq.tokenScopes) {
      logger.warn({ path: req.path }, 'Scope check failed - not an API user');
      res.status(403).json({
        message: 'Access denied - API token required',
        error: 'forbidden',
      });
      return;
    }

    // Check if token has at least one of the required scopes
    const hasRequiredScope = requiredScopes.some((scope) =>
      authReq.tokenScopes!.includes(scope)
    );

    if (!hasRequiredScope) {
      logger.warn(
        {
          path: req.path,
          tokenScopes: authReq.tokenScopes,
          requiredScopes,
        },
        'Scope check failed - insufficient permissions'
      );
      res.status(403).json({
        message: `Access denied - requires one of: ${requiredScopes.join(', ')}`,
        error: 'insufficient_scope',
      });
      return;
    }

    logger.debug({ path: req.path, scopes: authReq.tokenScopes }, 'Scope check passed');
    next();
  };
}

/**
 * Verify the API token has access to a specific database
 * Use after requireApiToken middleware
 *
 * @param getDatabaseId - Function to extract database ID from request (params, body, etc.)
 */
export function requireDatabaseAccess(
  getDatabaseId: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as ApiTokenAuthRequest;

    if (!authReq.isApiUser || !authReq.tokenDatabaseId) {
      logger.warn({ path: req.path }, 'Database access check failed - not an API user');
      res.status(403).json({
        message: 'Access denied - API token required',
        error: 'forbidden',
      });
      return;
    }

    const requestedDatabaseId = getDatabaseId(req);

    if (authReq.tokenDatabaseId !== requestedDatabaseId) {
      logger.warn(
        {
          path: req.path,
          tokenDatabaseId: authReq.tokenDatabaseId,
          requestedDatabaseId,
        },
        'Database access check failed - token does not have access to this database'
      );
      res.status(403).json({
        message: 'Access denied - API token does not have access to this database',
        error: 'forbidden',
      });
      return;
    }

    logger.debug({ path: req.path, databaseId: requestedDatabaseId }, 'Database access check passed');
    next();
  };
}

/**
 * Get API token info from request
 */
export function getApiTokenInfo(req: Request): {
  isApiUser: boolean;
  scopes: string[];
  databaseId?: string;
  tenantId?: string;
} | null {
  const authReq = req as ApiTokenAuthRequest;

  if (!authReq.isApiUser) {
    return null;
  }

  return {
    isApiUser: true,
    scopes: authReq.tokenScopes || [],
    databaseId: authReq.tokenDatabaseId,
    tenantId: authReq.tokenTenantId,
  };
}
