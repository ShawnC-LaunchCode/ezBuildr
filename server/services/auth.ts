import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createLogger } from '../logger';
import type { User } from '../../shared/schema';

const logger = createLogger({ module: 'auth-service' });

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'default-jwt-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d'; // 7 days by default

// Bcrypt Configuration
const SALT_ROUNDS = 10;

/**
 * JWT Payload structure
 */
export interface JWTPayload {
  userId: string;
  email: string;
  tenantId: string | null;
  role: 'owner' | 'builder' | 'runner' | 'viewer' | null;
  iat?: number;
  exp?: number;
}

/**
 * Create a JWT token for a user
 */
export function createToken(user: User): string {
  try {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId || null,
      role: user.tenantRole || null,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
      algorithm: 'HS256',
    });

    logger.debug({ userId: user.id, email: user.email }, 'JWT token created');
    return token;
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to create JWT token');
    throw new Error('Token creation failed');
  }
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JWTPayload;

    logger.debug({ userId: decoded.userId }, 'JWT token verified');
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('JWT token expired');
      throw new Error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({ error: error.message }, 'Invalid JWT token');
      throw new Error('Invalid token');
    } else {
      logger.error({ error }, 'JWT verification failed');
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    logger.debug('Password hashed successfully');
    return hash;
  } catch (error) {
    logger.error({ error }, 'Password hashing failed');
    throw new Error('Password hashing failed');
  }
}

/**
 * Compare a password with its hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    const isMatch = await bcrypt.compare(password, hash);
    logger.debug({ isMatch }, 'Password comparison completed');
    return isMatch;
  } catch (error) {
    logger.error({ error }, 'Password comparison failed');
    throw new Error('Password comparison failed');
  }
}

/**
 * Extract token from Authorization header
 * Supports both "Bearer <token>" and "<token>" formats
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Support plain token format
  return authHeader;
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
