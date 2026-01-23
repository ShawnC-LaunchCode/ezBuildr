/**
 * ezBuildr Configuration Constants
 *
 * Centralized configuration for DataVault and other system settings.
 * Eliminates magic numbers scattered throughout the codebase.
 *
 * @module shared/config
 */

/**
 * DataVault Configuration
 * Settings for pagination, caching, performance, and timeouts
 */
export const DATAVAULT_CONFIG = {
  // ========================================================================
  // PAGINATION
  // ========================================================================

  /** Default number of items per page for standard pagination */
  DEFAULT_PAGE_SIZE: 50,

  /** Maximum allowed page size to prevent performance issues */
  MAX_PAGE_SIZE: 1000,

  /** Maximum allowed offset to prevent memory exhaustion (DoS protection) */
  MAX_OFFSET: 100000,

  /** Number of items to load per page in infinite scroll components */
  INFINITE_SCROLL_PAGE_SIZE: 25,

  // ========================================================================
  // CACHING (milliseconds)
  // ========================================================================

  /** How long to cache reference row data before refetching */
  REFERENCE_CACHE_TIME: 5 * 60 * 1000, // 5 minutes

  /** How long before query data is considered stale */
  QUERY_STALE_TIME: 30 * 1000, // 30 seconds

  // ========================================================================
  // PERFORMANCE
  // ========================================================================

  /** Number of items to process in batch operations */
  BATCH_SIZE: 100,

  /** Maximum number of requests in a single batch API call (DoS protection) */
  MAX_BATCH_REQUESTS: 100,

  /** Maximum number of concurrent API requests */
  MAX_CONCURRENT_REQUESTS: 10,

  // ========================================================================
  // AUTO-NUMBER
  // ========================================================================

  /** Starting value for auto-number columns */
  DEFAULT_AUTO_NUMBER_START: 1,

  // ========================================================================
  // TIMEOUTS (milliseconds)
  // ========================================================================

  /** Default timeout for API requests */
  DEFAULT_TIMEOUT_MS: 5000,

  /** Timeout for transform block execution */
  TRANSFORM_BLOCK_TIMEOUT_MS: 3000,
} as const;

/**
 * Server-specific configuration
 * Uses environment variables with sensible defaults
 * Only available in Node.js environment (not in browser)
 */
export const SERVER_CONFIG = typeof process !== 'undefined' ? {
  /** Server port (from PORT env var or default 5000) */
  PORT: parseInt(process.env.PORT ?? '5000', 10),

  /** Maximum file upload size in bytes (10MB default) */
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE ?? '10485760', 10), // 10MB

  /** Directory for file uploads */
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? './uploads',

  /** Base URL for the application */
  BASE_URL: process.env.BASE_URL ?? 'http://localhost:5000',

  /** Environment (development, production, test) */
  NODE_ENV: process.env.NODE_ENV ?? 'development',
} as const : {} as any;

/**
 * Rate Limiting Configuration
 * Settings for API rate limiting to prevent abuse
 * Only available in Node.js environment (not in browser)
 */
export const RATE_LIMIT_CONFIG = typeof process !== 'undefined' ? {
  /** Time window for rate limiting (15 minutes) */
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),

  /** Maximum requests per window for general API endpoints */
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),

  /** Maximum requests for expensive operations */
  STRICT_MAX: parseInt(process.env.RATE_LIMIT_STRICT_MAX ?? '10', 10),

  /** Maximum test requests per minute */
  TEST_MAX_PER_MINUTE: 10,

  /** Maximum batch requests per minute */
  BATCH_MAX_PER_MINUTE: 5,
} as const : {} as any;

/**
 * Workflow Configuration
 * Settings for workflow execution and features
 */
export const WORKFLOW_CONFIG = {
  /** Maximum number of sections per workflow */
  MAX_SECTIONS: 50,

  /** Maximum number of steps per section */
  MAX_STEPS_PER_SECTION: 100,

  /** Maximum number of logic rules per workflow */
  MAX_LOGIC_RULES: 200,

  /** Default timeout for workflow step execution (ms) */
  STEP_TIMEOUT_MS: 30000, // 30 seconds
} as const;

/**
 * Type exports for TypeScript autocomplete
 */
export type DatavaultConfig = typeof DATAVAULT_CONFIG;
export type ServerConfig = typeof SERVER_CONFIG;
export type RateLimitConfig = typeof RATE_LIMIT_CONFIG;
export type WorkflowConfig = typeof WORKFLOW_CONFIG;
