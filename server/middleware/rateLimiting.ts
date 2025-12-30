import rateLimit from 'express-rate-limit';

/**
 * Global Rate Limiting Configuration
 *
 * Provides multiple rate limiters for different endpoint types:
 * - Global: All API endpoints (100 req/15min)
 * - Auth: Authentication endpoints (10 req/15min)
 * - API: Standard API operations (1000 req/15min)
 * - Strict: Expensive operations (10 req/15min)
 * - Test: Test/preview endpoints (10 req/min)
 * - Batch: Bulk operations (5 req/min)
 * - Create: Resource creation (20 req/min)
 * - Delete: Delete operations (10 req/min)
 */

// Get configuration from environment or use defaults
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000'); // 15 minutes
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '1000');
const strictMax = parseInt(process.env.RATE_LIMIT_STRICT_MAX ?? '10');

/**
 * Global rate limit for all API routes (100 requests per 15 minutes)
 * Apply as a baseline protection for all /api/* endpoints
 */
export const globalLimiter = rateLimit({
  windowMs, // 15 minutes
  max: maxRequests, // 100 requests per IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * API-specific limiter (1000 requests per 15 minutes)
 * More generous limit for authenticated API operations
 */
export const apiLimiter = rateLimit({
  windowMs, // 15 minutes
  max: 1000, // Higher limit for general API usage
  message: 'API rate limit exceeded, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Authentication limiter (10 per 15 minutes)
 * Apply to login/authentication endpoints to prevent brute force
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  message: {
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter limit for expensive operations (10 per 15 minutes)
 * Apply to operations that are computationally expensive or database-intensive
 * Examples: bulk operations, complex queries, data exports
 */
export const strictLimiter = rateLimit({
  windowMs, // 15 minutes
  max: strictMax,
  message: 'Too many expensive operations, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Test endpoint limiter (10 per minute)
 * Apply to test/preview endpoints
 * Examples: transform block testing, workflow preview
 */
export const testLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many test requests, please wait.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Batch operation limiter (5 per minute)
 * Apply to batch/bulk operations
 * Examples: bulk row creation, bulk deletions, batch reference queries
 */
export const batchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many batch requests, please wait.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Create operation limiter (20 per minute)
 * Apply to resource creation endpoints
 * Examples: create database, create table, create row
 */
export const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many create requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Delete operation limiter (10 per minute)
 * Apply to delete endpoints to prevent accidental mass deletion
 */
export const deleteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many delete requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
