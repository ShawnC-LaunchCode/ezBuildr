import type { User } from '@shared/schema';

import { createLogger } from '../logger';
import { userRepository } from '../repositories';

import { isAuthRequest } from './auth';

import type { Request, Response, NextFunction } from 'express';
const logger = createLogger({ module: 'require-user-middleware' });

// In-process TTL cache for user lookups. Reduces DB hits on high-traffic routes.
// 30-second TTL is safe for low-churn user data (role/tenantId changes are rare).
const USER_CACHE_TTL_MS = 30_000;
const MAX_CACHE_SIZE = 2_000;
const userCache = new Map<string, { user: User; expiresAt: number }>();

function getCachedUser(userId: string): User | undefined {
  const entry = userCache.get(userId);
  if (!entry) { return undefined; }
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return undefined;
  }
  return entry.user;
}

function setCachedUser(user: User): void {
  // If at capacity, evict expired entries first, then oldest entry if still full
  if (userCache.size >= MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [key, entry] of userCache) {
      if (now > entry.expiresAt) { userCache.delete(key); }
    }
    if (userCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = userCache.keys().next().value;
      if (oldestKey !== undefined) { userCache.delete(oldestKey); }
    }
  }
  userCache.set(user.id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/** Invalidate a specific user from the cache (e.g. after role change) */
export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}
/**
 * Extended AuthRequest with attached user object
 */
export interface UserRequest extends Request {
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  userRole?: 'owner' | 'builder' | 'runner' | 'viewer' | null;
  jwtPayload?: unknown;
  user: User;
}
/**
 * Type guard to check if a request has user attached
 */
export function hasUser(req: Request): req is UserRequest {
  return isAuthRequest(req) && 'user' in req && req.user !== undefined;
}
/**
 * Middleware to fetch and attach user to request
 * Requires authentication middleware to run first (hybridAuth or requireAuth)
 *
 * @example
 * app.get('/api/me', hybridAuth, requireUser, (req: Request, res: Response) => {
 *   const user = (req as UserRequest).user;
 *   res.json(user);
 * });
 */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Check if request is authenticated
    if (!isAuthRequest(req) || !req.userId) {
      logger.warn({ path: req.path }, 'User middleware called without authentication');
      res.status(401).json({
        message: 'Authentication required',
        error: 'unauthorized'
      });
      return;
    }
    // Check TTL cache before hitting the database
    let user = getCachedUser(req.userId);
    if (!user) {
      user = await userRepository.findById(req.userId) ?? undefined;
      if (user) { setCachedUser(user); }
    }
    if (!user) {
      logger.warn({ userId: req.userId, path: req.path }, 'User not found in database');
      res.status(404).json({
        message: 'User not found',
        error: 'user_not_found'
      });
      return;
    }
    // Attach user to request (type-safe)
    Object.assign(req as UserRequest, { user } as Partial<UserRequest>);
    logger.debug({ userId: user.id, email: user.email }, 'User attached to request');
    next();
  } catch (error) {
    logger.error({ error, userId: isAuthRequest(req) ? req.userId : undefined }, 'Error fetching user');
    res.status(500).json({
      message: 'Internal server error',
      error: 'internal_error'
    });
  }
}
/**
 * Optional user middleware - attaches user if authenticated, continues if not
 * Useful for routes that should work both authenticated and unauthenticated
 *
 * @example
 * app.get('/api/public', optionalHybridAuth, optionalUser, (req: Request, res: Response) => {
 *   const user = hasUser(req) ? req.user : null;
 *   res.json({ authenticated: !!user });
 * });
 */
export async function optionalUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Only fetch user if authenticated
    if (!isAuthRequest(req) || !req.userId) {
      return next();
    }
    // Check TTL cache before hitting the database
    let user = getCachedUser(req.userId);
    if (!user) {
      user = await userRepository.findById(req.userId) ?? undefined;
      if (user) { setCachedUser(user); }
    }
    if (user) {
      // Attach user to request (type-safe)
      Object.assign(req as UserRequest, { user } as Partial<UserRequest>);
      logger.debug({ userId: user.id }, 'User attached to request (optional)');
    }
    next();
  } catch (error) {
    // Don't fail the request if user fetch fails in optional mode
    logger.warn({ error, userId: isAuthRequest(req) ? req.userId : undefined }, 'Error fetching optional user');
    next();
  }
}
/**
 * Helper function to get user from request (type-safe)
 * Returns undefined if user is not attached
 */
export function getUser(req: Request): User | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return hasUser(req) ? req.user : undefined;
}
/**
 * Helper function to assert user exists on request
 * Throws error if user is not attached (use in middleware chains where requireUser was used)
 */
export function assertUser(req: Request): asserts req is UserRequest {
  if (!hasUser(req)) {
    throw new Error('User not attached to request');
  }
}