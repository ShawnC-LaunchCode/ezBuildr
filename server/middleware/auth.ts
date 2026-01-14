import { UnauthorizedError, InvalidTokenError, TokenExpiredError } from '../errors/AuthErrors';
import { createLogger } from '../logger';
import { userRepository } from '../repositories';
import { authService, type JWTPayload } from '../services/AuthService';
import { parseCookies } from "../utils/cookies";
import { sendErrorResponse } from '../utils/responses';

import type { Request, Response, NextFunction } from 'express';

const logger = createLogger({ module: 'auth-middleware' });

/**
 * Extended Express Request with user and tenant information
 */
export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  userRole?: 'owner' | 'builder' | 'runner' | 'viewer' | null;
  systemRole?: 'admin' | 'creator' | null;
  jwtPayload?: JWTPayload;
}

/**
 * Type guard to check if a request is an AuthRequest
 */
export function isAuthRequest(req: Request): req is AuthRequest {
  return 'userId' in req || 'userEmail' in req || 'tenantId' in req || 'jwtPayload' in req;
}

/**
 * Type guard to assert a request has user ID (throws if not authenticated)
 */
export function assertAuthRequest(req: Request): asserts req is AuthRequest & { userId: string } {
  if (!('userId' in req) || typeof req.userId !== 'string') {
    throw new Error('Request is not authenticated');
  }
}

/**
 * JWT Authentication Middleware
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (!token) {
      logger.warn({ path: req.path }, 'No authorization token provided');
      throw new UnauthorizedError('Authentication required');
    }

    const payload = authService.verifyToken(token);
    await attachUserToRequest(req, payload);
    next();
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
}

/**
 * Optional JWT Authentication Middleware
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (!token) {return next();}

    const payload = authService.verifyToken(token);
    await attachUserToRequest(req, payload);
    next();
  } catch (error) {
    next();
  }
}

// =================================================================
// STRATEGIES
// =================================================================

/**
 * Strategy: JWT Bearer Token
 * Checks Authorization header for valid JWT
 */
async function jwtStrategy(req: Request): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (token && authService.looksLikeJwt(token)) {
      const payload = authService.verifyToken(token);
      await attachUserToRequest(req, payload);
      logger.debug({ userId: payload.userId }, 'Authenticated via JWT Strategy');
      return true;
    }
  } catch (error) {
    // Token valid but verification failed (expired/invalid)
    // We catch this so we can try the next strategy
    logger.warn({ error, token: req.headers.authorization }, 'JWT Strategy verification failed');
  }
  return false;
}

/**
 * Strategy: Refresh Token Cookie
 * Checks cookie for valid RefreshToken (Safe Methods Only)
 *
 * @param req Express Request
 * @returns boolean true if authenticated
 */
async function cookieStrategy(req: Request): Promise<boolean> {
  // 1. Strict Method Check: Only allow cookie auth for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (!safeMethods.includes(req.method)) {return false;}

  // 2. Precedence Check: If a Bearer header exists, ignore cookies (JWT wins)
  // This prevents ambiguity if a client sends both
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {return false;}

  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const refreshToken = cookies['refresh_token'];

    if (refreshToken) {
      const userId = await authService.validateRefreshToken(refreshToken);
      if (userId) {
        const user = await userRepository.findById(userId);
        if (user) {
          // Type-safe property assignment
          Object.assign(req, {
            userId: user.id,
            userEmail: user.email,
            tenantId: user.tenantId || undefined,
            userRole: user.tenantRole
          } as AuthRequest);
          logger.debug({ userId }, 'Authenticated via Refresh Token Cookie (Hybrid)');
          return true;
        }
      } else {
        logger.warn('Cookie strategy: Invalid refresh token');
      }
    } else {
      // logger.debug('Cookie strategy: No refresh token cookie');
    }
  } catch (error) {
    logger.error({ error }, 'Cookie strategy error');
  }
  // logger.debug({
  //   cookiePresent: !!parseCookies(req.headers.cookie || '')['refresh_token'],
  //   method: req.method,
  //   url: req.url
  // }, 'Cookie strategy failed');
  return false;
}

/**
 * Hybrid Authentication Middleware (Mutation-Strict)
 * Supports both JWT Bearer tokens and HTTP-Only Refresh Token cookies.
 */
export async function hybridAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Try JWT Strategy
    if (await jwtStrategy(req)) {
      next();
      return;
    }

    // 2. Try Cookie Strategy (Fallback)
    if (await cookieStrategy(req)) {
      next();
      return;
    }

    // 3. No valid auth found
    throw new UnauthorizedError('Authentication required');
  } catch (error) {
    logger.error({ error }, 'Hybrid auth error');
    sendErrorResponse(res, error as Error);
  }
}

/**
 * Optional Hybrid Authentication Middleware
 * Tries both strategies but proceeds even if both fail (anonymous access).
 */
export async function optionalHybridAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (await jwtStrategy(req)) {
      next();
      return;
    }

    if (await cookieStrategy(req)) {
      next();
      return;
    }

    // Anonymous - just proceed
    next();
  } catch (e) {
    next();
  }
}

// =================================================================
// HELPERS
// =================================================================

async function attachUserToRequest(req: Request, payload: JWTPayload): Promise<void> {
  // Type-safe property assignment without 'as' cast
  Object.assign(req, {
    userId: payload.userId,
    userEmail: payload.email,
    tenantId: payload.tenantId || undefined,
    userRole: payload.tenantRole || null, // Prefer tenantRole from payload, fallback handled below
    systemRole: payload.role as any, // Admin/Creator
    jwtPayload: payload
  } as AuthRequest);

  // Now we can safely access via type guard
  if (isAuthRequest(req) && req.userId && !req.tenantId) {
    try {
      const user = await userRepository.findById(req.userId);
      if (user?.tenantId) {
        req.tenantId = user.tenantId;
        req.userRole = user.tenantRole;
        logger.debug({ userId: req.userId, tenantId: req.tenantId }, 'Hydrated tenantId from DB');
      } else {
        logger.debug({ userId: req.userId }, 'User has no tenantId in DB');
      }
    } catch (e) {
      logger.warn({ error: e, userId: req.userId }, 'Failed to hydrate user');
    }
  } else {
    logger.debug({
      userId: req.userId,
      hasTenantId: !!(req as AuthRequest).tenantId,
      source: 'token'
    }, 'User attached from token');
  }
}

/**
 * @deprecated Use sendErrorResponse from utils/responses.ts instead
 * This function is kept for backward compatibility but will be removed in v2.0
 */
function handleAuthError(error: unknown, req: Request, res: Response) {
  sendErrorResponse(res, error as Error);
}



/**
 * Safely get user ID from request (type-safe)
 */
export function getAuthUserId(req: Request): string | undefined {
  return isAuthRequest(req) ? req.userId : undefined;
}

/**
 * Safely get tenant ID from request (type-safe)
 */
export function getAuthUserTenantId(req: Request): string | undefined {
  return isAuthRequest(req) ? req.tenantId : undefined;
}

/**
 * Safely get user role from request (type-safe)
 */
export function getAuthUserRole(req: Request): 'owner' | 'builder' | 'runner' | 'viewer' | null | undefined {
  return isAuthRequest(req) ? req.userRole : undefined;
}
