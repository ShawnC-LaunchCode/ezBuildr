/**
 * AI Error Handling
 *
 * Unified error handling for all AI services
 */

import type { AIErrorCode } from './types';

export interface AIErrorDetails {
  code: AIErrorCode;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterSeconds?: number;
}

/**
 * Custom AI Error class
 */
export class AIError extends Error {
  public readonly code: AIErrorCode;
  public readonly details?: unknown;
  public readonly retryable: boolean;
  public readonly retryAfterSeconds?: number;
  public troubleshooting?: string;

  constructor(
    message: string,
    code: AIErrorCode,
    details?: unknown,
    retryable = false,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIError);
    }
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON(): AIErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }

  /**
   * Create error from unknown error object
   */
  static fromUnknown(error: unknown, defaultCode: AIErrorCode = 'API_ERROR'): AIError {
    if (error instanceof AIError) {
      return error;
    }

    if (error instanceof Error) {
      return new AIError(error.message, defaultCode, {
        originalError: error.name,
        stack: error.stack,
      });
    }

    return new AIError(String(error), defaultCode);
  }
}

/**
 * Create an AI error (factory function for backwards compatibility)
 */
export function createAIError(
  message: string,
  code: AIErrorCode,
  details?: unknown,
  retryable = false,
  retryAfterSeconds?: number
): AIError {
  return new AIError(message, code, details, retryable, retryAfterSeconds);
}

/**
 * Check if error is a rate limit error
 */
interface ExternalError {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  response?: { headers?: Record<string, unknown> };
}

function asExternalError(error: unknown): ExternalError {
  return typeof error === 'object' && error !== null ? error as ExternalError : {};
}

function includesMessage(error: ExternalError, text: string): boolean {
  return typeof error.message === 'string' && error.message.includes(text);
}

export function isRateLimitError(error: unknown): boolean {
  const externalError = asExternalError(error);
  return (
    externalError.code === 'RATE_LIMIT' ||
    externalError.status === 429 ||
    externalError.code === 'rate_limit_exceeded' ||
    includesMessage(externalError, '429') ||
    includesMessage(externalError, 'Quota exceeded') ||
    includesMessage(externalError, 'rate limit')
  );
}

/**
 * Check if error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  const externalError = asExternalError(error);
  return (
    externalError.code === 'TIMEOUT' ||
    externalError.code === 'ETIMEDOUT' ||
    includesMessage(externalError, 'timeout') ||
    includesMessage(externalError, 'timed out')
  );
}

/**
 * Extract retry-after seconds from error
 */
export function getRetryAfter(error: unknown): number {
  const headers = asExternalError(error).response?.headers;
  // Check for Retry-After header (seconds)
  const retryAfterHeader = headers?.['retry-after'];
  if (typeof retryAfterHeader === 'string') {
    const retryAfter = parseInt(retryAfterHeader, 10);
    if (!isNaN(retryAfter)) {
      return retryAfter * 1000; // Convert to ms
    }
  }

  // Check for rate limit reset timestamp
  const resetHeader = headers?.['x-ratelimit-reset'];
  if (typeof resetHeader === 'string') {
    const resetTime = parseInt(resetHeader, 10);
    if (!isNaN(resetTime)) {
      const now = Math.floor(Date.now() / 1000);
      const waitSeconds = Math.max(0, resetTime - now);
      return waitSeconds * 1000; // Convert to ms
    }
  }

  // Default to 60 seconds if no info available
  return 60000;
}

/**
 * Quality threshold details for quality rejection errors
 */
export interface QualityThresholdDetails {
  qualityScore: number;
  threshold: number;
  issues: Array<{
    severity: 'error' | 'warning' | 'suggestion';
    category: string;
    message: string;
    location?: string;
    suggestion?: string;
  }>;
  suggestions: string[];
  breakdown: {
    aliases: number;
    types: number;
    structure: number;
    ux: number;
    completeness: number;
    validation: number;
  };
}

/**
 * Quality Threshold Error - thrown when AI-generated workflow quality is below minimum threshold
 */
export class QualityThresholdError extends AIError {
  public readonly qualityScore: number;
  public readonly threshold: number;
  public readonly qualityIssues: QualityThresholdDetails['issues'];
  public readonly qualitySuggestions: string[];
  public readonly qualityBreakdown: QualityThresholdDetails['breakdown'];

  constructor(details: QualityThresholdDetails) {
    super(
      `Generated workflow quality score (${details.qualityScore}) is below minimum threshold (${details.threshold})`,
      'QUALITY_THRESHOLD',
      details,
      false // not retryable automatically
    );
    this.name = 'QualityThresholdError';
    this.qualityScore = details.qualityScore;
    this.threshold = details.threshold;
    this.qualityIssues = details.issues;
    this.qualitySuggestions = details.suggestions;
    this.qualityBreakdown = details.breakdown;

    // Maintains proper stack trace
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QualityThresholdError);
    }
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON(): AIErrorDetails & { quality: QualityThresholdDetails } {
    return {
      ...super.toJSON(),
      quality: {
        qualityScore: this.qualityScore,
        threshold: this.threshold,
        issues: this.qualityIssues,
        suggestions: this.qualitySuggestions,
        breakdown: this.qualityBreakdown,
      },
    };
  }
}

/**
 * Check if error is a quality threshold error
 */
export function isQualityThresholdError(error: unknown): error is QualityThresholdError {
  return error instanceof QualityThresholdError || asExternalError(error).code === 'QUALITY_THRESHOLD';
}
