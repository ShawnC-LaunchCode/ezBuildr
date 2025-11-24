import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createLogger } from '../logger';
import type { User } from '../../shared/schema';

const logger = createLogger({ module: 'auth-service' });

// JWT Configuration
// SECURITY: JWT_SECRET is required for production. Falls back to SESSION_SECRET in development.
const JWT_SECRET = getJwtSecret();
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d'; // 7 days by default

// Bcrypt Configuration
const SALT_ROUNDS = 10;

/**
 * Get JWT secret with proper security validation
 * In production, JWT_SECRET must be explicitly set
 * In development, falls back to SESSION_SECRET with a warning
 */
function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  // Prefer JWT_SECRET if set
  if (jwtSecret) {
    if (jwtSecret.length < 32) {
      logger.warn('JWT_SECRET is less than 32 characters - consider using a longer secret for better security');
    }
    return jwtSecret;
  }

  // In production, require explicit JWT_SECRET
  if (isProduction) {
    logger.error(
      'SECURITY WARNING: JWT_SECRET environment variable is not set in production. ' +
      'JWT token generation will fail. Please set JWT_SECRET to a secure random string (at least 32 characters).'
    );
    // Don't throw in production - let the token generation fail gracefully
    // This allows the app to start and session-based auth to still work
    return '';
  }

  // In development/test, fall back to SESSION_SECRET with warning
  if (sessionSecret) {
    logger.warn(
      'JWT_SECRET not set - falling back to SESSION_SECRET. ' +
      'This is acceptable for development but should be fixed for production.'
    );
    return sessionSecret;
  }

  // Last resort for development only
  logger.warn(
    'Neither JWT_SECRET nor SESSION_SECRET is set. ' +
    'Using insecure default secret - DO NOT use in production!'
  );
  return 'insecure-dev-only-secret-' + Date.now();
}

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
 * Check if JWT functionality is properly configured
 */
export function isJwtConfigured(): boolean {
  return JWT_SECRET.length > 0;
}

/**
 * Create a JWT token for a user
 * @throws Error if JWT_SECRET is not configured (production) or token signing fails
 */
export function createToken(user: User): string {
  // Check if JWT is properly configured
  if (!JWT_SECRET) {
    const error = new Error('JWT_SECRET not configured - cannot create token');
    logger.error({ userId: user.id }, error.message);
    throw error;
  }

  try {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId || null,
      role: user.tenantRole || null,
    };

    const options: any = {
      expiresIn: JWT_EXPIRY,
      algorithm: 'HS256',
    };
    const token = jwt.sign(payload, JWT_SECRET, options);

    logger.debug({ userId: user.id, email: user.email }, 'JWT token created');
    return token;
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to create JWT token');
    throw new Error('Token creation failed');
  }
}

/**
 * Verify and decode a JWT token
 * @throws Error if JWT_SECRET is not configured or token is invalid
 */
export function verifyToken(token: string): JWTPayload {
  // Check if JWT is properly configured
  if (!JWT_SECRET) {
    logger.warn('JWT_SECRET not configured - token verification disabled');
    throw new Error('JWT not configured');
  }

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
 * Check if a token looks like a JWT (has 3 base64-encoded parts separated by dots)
 * This helps distinguish JWTs from other token formats like UUIDs (run tokens)
 */
export function looksLikeJwt(token: string): boolean {
  if (!token) return false;

  // JWT format: header.payload.signature (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  // Each part should be valid base64url (non-empty)
  return parts.every(part => part.length > 0);
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
