import { UnauthorizedError } from '../errors/AuthErrors';
import { createLogger } from '../logger';
import { userRepository } from '../repositories';
import { authService, type JWTPayload } from '../services/AuthService';
import { parseCookies } from "../utils/cookies";
import { sendErrorResponse } from '../utils/responses';

import { getUserById } from './userCache';

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
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const runAuth = async (): Promise<void> => {
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
  };
  void runAuth();
}
/**
 * Optional JWT Authentication Middleware
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const runAuth = async (): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const token = authService.extractTokenFromHeader(authHeader);
      if (!token) { return next(); }
      const payload = authService.verifyToken(token);
      await attachUserToRequest(req, payload);
      next();
    } catch (error) {
      next();
    }
  };
  void runAuth();
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
    // SECURITY: never log the raw Authorization header / bearer token.
    logger.warn({ error }, 'JWT Strategy verification failed');
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
  if (!safeMethods.includes(req.method)) { return false; }
  // 2. Precedence Check: If a Bearer header exists, ignore cookies (JWT wins)
  // This prevents ambiguity if a client sends both
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) { return false; }
  try {
    const cookies = parseCookies(req.headers.cookie ?? '');
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
            tenantId: user.tenantId ?? undefined,
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
  //   cookiePresent: !!parseCookies(req.headers.cookie ?? '')['refresh_token'],
  //   method: req.method,
  //   url: req.url
  // }, 'Cookie strategy failed');
  return false;
}
async function hybridAuthLogic(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    logger.error({ error: error as Error }, 'Hybrid auth error');
    sendErrorResponse(res, error as Error);
  }
}
export const hybridAuth = (req: Request, res: Response, next: NextFunction): void => {
  void hybridAuthLogic(req, res, next);
};

async function optionalHybridAuthLogic(req: Request, _res: Response, next: NextFunction): Promise<void> {
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

export const optionalHybridAuth = (req: Request, res: Response, next: NextFunction): void => {
  void optionalHybridAuthLogic(req, res, next);
};
// =================================================================
// HELPERS
// =================================================================
async function attachUserToRequest(req: Request, payload: JWTPayload): Promise<void> {
  // Type-safe property assignment without 'as' cast
  // Type-safe property assignment without 'as' cast
  const authReq = req as AuthRequest;
  Object.assign(authReq, {
    userId: payload.userId,
    userEmail: payload.email,
    tenantId: payload.tenantId ?? undefined,
    userRole: payload.tenantRole ?? null,
    systemRole: payload.role as string | undefined,
    jwtPayload: payload
  });

  // SECURITY: never trust the role/tenant claims embedded in the (up to 15-minute-lived) JWT
  // for authorization decisions. Re-hydrate them from the DB (via a 30s TTL cache) so that a
  // demotion, removal, or tenant change takes effect immediately instead of lingering until the
  // access token expires. Role-changing endpoints invalidate this cache. If the DB lookup fails
  // we fall back to the token claims rather than hard-failing the request.
  if (authReq.userId !== undefined) {
    try {
      const user = await getUserById(authReq.userId);
      if (user) {
        authReq.tenantId = user.tenantId ?? undefined;
        authReq.userRole = user.tenantRole as AuthRequest['userRole'];
        authReq.systemRole = user.role as AuthRequest['systemRole'];
        logger.debug({ userId: authReq.userId, tenantId: authReq.tenantId }, 'Re-hydrated role/tenant from DB');
      } else {
        logger.warn({ userId: authReq.userId }, 'Authenticated userId not found in DB during re-hydration');
      }
    } catch (e) {
      logger.warn({ error: e, userId: authReq.userId }, 'Failed to re-hydrate user from DB; using token claims');
    }
  }
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