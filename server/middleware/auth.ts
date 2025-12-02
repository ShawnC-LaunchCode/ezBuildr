import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, looksLikeJwt, type JWTPayload } from '../services/auth';
import { createLogger } from '../logger';
import { userRepository } from '../repositories';

const logger = createLogger({ module: 'auth-middleware' });

/**
 * Extended Express Request with user and tenant information
 */
export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  userRole?: 'owner' | 'builder' | 'runner' | 'viewer' | null;
  jwtPayload?: JWTPayload;
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header and attaches user info to request
 *
 * This middleware is separate from the session-based Google OAuth authentication.
 * Use this for API endpoints that need JWT-based authentication.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      logger.warn({ path: req.path }, 'No authorization token provided');
      res.status(401).json({
        message: 'Authentication required',
        error: 'missing_token',
      });
      return;
    }

    // Verify token
    const payload = verifyToken(token);

    // Attach user info to request
    const authReq = req as AuthRequest;
    authReq.userId = payload.userId;
    authReq.userEmail = payload.email;
    authReq.tenantId = payload.tenantId || undefined;
    authReq.userRole = payload.role;
    authReq.jwtPayload = payload;

    // If tenantId is missing in token (e.g. newly registered user who just created a tenant),
    // try to fetch it from the database to avoid stale token issues
    if (!authReq.tenantId && authReq.userId) {
      try {
        const user = await userRepository.findById(authReq.userId);
        if (user?.tenantId) {
          authReq.tenantId = user.tenantId;
          authReq.userRole = user.tenantRole; // Also update role
          logger.debug({ userId: authReq.userId, tenantId: authReq.tenantId }, 'Refreshed tenantId from database for JWT user');
        }
      } catch (dbError) {
        logger.warn({ error: dbError, userId: authReq.userId }, 'Failed to refresh tenantId from database');
      }
    }

    logger.debug({ userId: payload.userId, path: req.path }, 'Authentication successful');
    next();
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error), path: req.path }, 'Authentication failed');

    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    const statusCode = errorMessage === 'Token expired' ? 401 : 401;

    res.status(statusCode).json({
      message: errorMessage,
      error: errorMessage === 'Token expired' ? 'token_expired' : 'invalid_token',
    });
  }
}

/**
 * Optional JWT Authentication Middleware
 * Attaches user info if token is present, but doesn't reject if missing
 * Useful for endpoints that have different behavior for authenticated vs anonymous users
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      // No token provided, continue without authentication
      next();
      return;
    }

    // Verify token
    const payload = verifyToken(token);

    // Attach user info to request
    const authReq = req as AuthRequest;
    authReq.userId = payload.userId;
    authReq.userEmail = payload.email;
    authReq.tenantId = payload.tenantId || undefined;
    authReq.userRole = payload.role;
    authReq.jwtPayload = payload;

    logger.debug({ userId: payload.userId, path: req.path }, 'Optional authentication successful');
    next();
  } catch (error) {
    // Token is invalid, but since this is optional auth, we just continue without authentication
    logger.debug({ error: error instanceof Error ? error.message : String(error), path: req.path }, 'Optional authentication failed, continuing without auth');
    next();
  }
}

/**
 * Hybrid Authentication Middleware
 * Supports both JWT tokens and session-based authentication
 * Checks JWT first, then falls back to session
 */
export async function hybridAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Try JWT authentication first
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    // Only attempt JWT verification if the token looks like a JWT
    // This avoids noisy warnings when run tokens (UUIDs) are passed
    if (token && looksLikeJwt(token)) {
      try {
        const payload = verifyToken(token);
        const authReq = req as AuthRequest;
        authReq.userId = payload.userId;
        authReq.userEmail = payload.email;
        authReq.tenantId = payload.tenantId || undefined;
        authReq.userRole = payload.role;
        authReq.jwtPayload = payload;

        // If tenantId is missing in token (e.g. newly registered user who just created a tenant),
        // try to fetch it from the database to avoid stale token issues
        if (!authReq.tenantId && authReq.userId) {
          try {
            const user = await userRepository.findById(authReq.userId);
            if (user?.tenantId) {
              authReq.tenantId = user.tenantId;
              authReq.userRole = user.tenantRole; // Also update role
              logger.debug({ userId: authReq.userId, tenantId: authReq.tenantId }, 'Refreshed tenantId from database for JWT user (hybrid)');
            }
          } catch (dbError) {
            logger.warn({ error: dbError, userId: authReq.userId }, 'Failed to refresh tenantId from database (hybrid)');
          }
        }

        logger.debug({ userId: payload.userId, path: req.path }, 'JWT authentication successful');
        next();
        return;
      } catch (error) {
        // JWT failed, will try session next
        logger.debug('JWT authentication failed, trying session');
      }
    } else if (token) {
      // Token exists but doesn't look like JWT (probably a run token)
      logger.debug({ path: req.path }, 'Non-JWT token provided, skipping JWT auth');
    }

    // Fallback to session-based authentication (Google OAuth)
    const sessionUser = req.session?.user || req.user;
    if (sessionUser?.claims?.sub) {
      const authReq = req as AuthRequest;
      authReq.userId = sessionUser.claims.sub;
      authReq.userEmail = sessionUser.claims.email;

      // Fetch user from database to get tenant info
      try {
        const user = await userRepository.findById(sessionUser.claims.sub);
        if (user) {
          authReq.tenantId = user.tenantId || undefined;
          authReq.userRole = user.tenantRole;
        }
      } catch (error) {
        logger.warn({ error, userId: sessionUser.claims.sub }, 'Failed to fetch user details');
      }

      logger.debug({ userId: sessionUser.claims.sub, path: req.path }, 'Session authentication successful');
      next();
      return;
    }

    // No valid authentication found
    logger.warn({ path: req.path }, 'No valid authentication found');
    res.status(401).json({
      message: 'Authentication required',
      error: 'unauthorized',
    });
  } catch (error) {
    logger.error({ error, path: req.path }, 'Hybrid authentication error');
    res.status(500).json({
      message: 'Authentication error',
      error: 'internal_error',
    });
  }
}

/**
 * Get authenticated user ID from request
 * Works with both JWT and session-based authentication
 */
export function getAuthUserId(req: Request): string | undefined {
  const authReq = req as AuthRequest;

  // Check JWT authentication first
  if (authReq.userId) {
    return authReq.userId;
  }

  // Fallback to session authentication
  const sessionUser = req.session?.user || req.user;
  return sessionUser?.claims?.sub;
}

/**
 * Get authenticated user's tenant ID from request
 */
export function getAuthUserTenantId(req: Request): string | undefined {
  const authReq = req as AuthRequest;
  return authReq.tenantId;
}

/**
 * Get authenticated user's role from request
 */
export function getAuthUserRole(req: Request): 'owner' | 'builder' | 'runner' | 'viewer' | null | undefined {
  const authReq = req as AuthRequest;
  return authReq.userRole;
}
