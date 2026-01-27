import type { User } from '@shared/schema';

import { createLogger } from '../logger';
import { userRepository } from '../repositories';

import { isAuthRequest } from './auth';

import type { Request, Response, NextFunction } from 'express';
const logger = createLogger({ module: 'require-user-middleware' });
/**
 * Extended AuthRequest with attached user object
 */
export interface UserRequest extends Request {
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  userRole?: 'owner' | 'builder' | 'runner' | 'viewer' | null;
  jwtPayload?: unknown;
  user: User | any;
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
    // Fetch user from database
    const user = await userRepository.findById(req.userId);
    if (!user) {
      logger.warn({ userId: req.userId, path: req.path }, 'User not found in database');
      res.status(404).json({
        message: 'User not found',
        error: 'user_not_found'
      });
      return;
    }
    // Attach user to request (type-safe)
    Object.assign(req as any, { user } as Partial<UserRequest>);
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
    // Fetch user from database
    const user = await userRepository.findById(req.userId);
    if (user) {
      // Attach user to request (type-safe)
      Object.assign(req as any, { user } as Partial<UserRequest>);
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