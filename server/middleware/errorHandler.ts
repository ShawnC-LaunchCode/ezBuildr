/**
 * Centralized Error Handler Middleware
 *
 * This module provides error handling infrastructure for Express routes:
 * - Custom error classes for different error types
 * - Error handler middleware that maps errors to appropriate HTTP status codes
 * - Structured logging with request context
 * - Helper functions for async route handlers
 *
 * Usage:
 * 1. Throw custom errors from services/routes: `throw new NotFoundError("Survey not found")`
 * 2. Use asyncHandler wrapper for routes: `app.get('/path', asyncHandler(async (req, res) => { ... }))`
 * 3. Register error handler middleware at the end of route definitions
 */

import { ZodError } from "zod";

import { logger } from "../logger";

import type { Request, Response, NextFunction } from "express";

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base class for application errors
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found Error
 * Use when a requested resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

/**
 * 403 Forbidden Error
 * Use when user doesn't have permission to access a resource
 */
export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403);
  }
}

/**
 * 401 Unauthorized Error
 * Use when authentication is required or has failed
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

/**
 * 400 Bad Request Error
 * Use for general validation errors or bad input
 */
export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(message, 400);
  }
}

/**
 * 409 Conflict Error
 * Use when request conflicts with current state (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(message, 409);
  }
}

// ============================================================================
// Error Classification Helpers
// ============================================================================

/**
 * Determines if an error message indicates a not found error
 */
function isNotFoundError(message: string): boolean {
  const notFoundPatterns = [
    "not found",
    "does not exist",
    "cannot find",
    "could not find",
  ];
  const lowerMessage = message.toLowerCase();
  return notFoundPatterns.some((pattern) => lowerMessage.includes(pattern));
}

/**
 * Determines if an error message indicates a forbidden/access denied error
 */
function isForbiddenError(message: string): boolean {
  const forbiddenPatterns = [
    "access denied",
    "forbidden",
    "permission denied",
    "not authorized to",
    "you do not own",
    "you are not a member",
    "admin access required",
    "insufficient permissions",
  ];
  const lowerMessage = message.toLowerCase();
  return forbiddenPatterns.some((pattern) => lowerMessage.includes(pattern));
}

/**
 * Determines if an error message indicates an unauthorized error
 */
function isUnauthorizedError(message: string): boolean {
  const unauthorizedPatterns = [
    "unauthorized",
    "no user id",
    "not logged in",
    "authentication required",
    "invalid token",
    "token expired",
    "must be logged in",
  ];
  const lowerMessage = message.toLowerCase();
  return unauthorizedPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
}

/**
 * Classifies a generic Error into an appropriate HTTP status code
 */
function classifyError(error: Error): number {
  const message = error.message;

  if (isNotFoundError(message)) {return 404;}
  if (isForbiddenError(message)) {return 403;}
  if (isUnauthorizedError(message)) {return 401;}

  return 500;
}

// ============================================================================
// Error Response Builder
// ============================================================================

interface ErrorResponse {
  message: string;
  error?: string;
  details?: any;
  stack?: string;
}

/**
 * Builds a standardized error response object
 */
function buildErrorResponse(
  error: Error | AppError | ZodError,
  isDevelopment: boolean
): ErrorResponse {
  const response: ErrorResponse = {
    message: error.message || "An error occurred",
  };

  // Handle Zod validation errors specially
  if (error instanceof ZodError) {
    response.message = "Validation error";
    response.error = "Invalid input";
    response.details = error.errors;
  }

  // Include additional error details in development
  if (isDevelopment) {
    response.error = error.message;
    if (error.stack) {
      response.stack = error.stack;
    }
  }

  return response;
}

// ============================================================================
// Main Error Handler Middleware
// ============================================================================

/**
 * Express error handler middleware
 *
 * This should be registered AFTER all routes but BEFORE any other error handlers.
 * It handles all errors thrown in route handlers and middleware.
 *
 * Features:
 * - Maps error types to appropriate HTTP status codes
 * - Structured logging with request context
 * - Different response formats for development vs production
 * - Special handling for Zod validation errors
 * - Automatic classification of error messages
 *
 * @example
 * // In your main server file, after all routes:
 * app.use(errorHandler);
 */
export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const isDevelopment = process.env.NODE_ENV === "development";

  // Determine status code
  let statusCode = 500;

  if (err instanceof AppError) {
    // Use status code from custom error class
    statusCode = err.statusCode;
  } else if (err instanceof ZodError) {
    // Validation errors are always 400
    statusCode = 400;
  } else if (err instanceof Error) {
    // Classify generic errors based on message
    statusCode = classifyError(err);
  }

  // Build response
  const errorResponse = buildErrorResponse(err, isDevelopment);

  // Log error with request context
  const logContext = {
    requestId: (req as any).id, // Express request ID (from express-request-id middleware if present)
    method: req.method,
    url: req.url,
    statusCode,
    userId: req.user?.claims?.sub,
    error: {
      name: err.name,
      message: err.message,
      stack: isDevelopment ? err.stack : undefined,
    },
  };

  // Log based on severity
  if (statusCode >= 500) {
    // Server errors are critical
    logger.error(logContext, `Server error: ${err.message}`);
  } else if (statusCode >= 400) {
    // Client errors are warnings
    logger.warn(logContext, `Client error: ${err.message}`);
  }

  // Send response
  res.status(statusCode).json(errorResponse);
}

// ============================================================================
// Async Handler Wrapper
// ============================================================================

/**
 * Type for async Express route handlers
 */
type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Wraps async route handlers to automatically catch errors and pass to error handler
 *
 * Without this wrapper, you need try/catch in every async route.
 * With this wrapper, any thrown error is automatically caught and passed to next().
 *
 * @example
 * // Instead of:
 * app.get('/api/surveys/:id', async (req, res) => {
 *   try {
 *     const survey = await getSurvey(req.params.id);
 *     res.json(survey);
 *   } catch (error) {
 *     next(error);
 *   }
 * });
 *
 * // You can write:
 * app.get('/api/surveys/:id', asyncHandler(async (req, res) => {
 *   const survey = await getSurvey(req.params.id);
 *   res.json(survey);
 * }));
 */
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ============================================================================
// Helper Functions for Common Patterns
// ============================================================================

/**
 * Throws a NotFoundError if condition is falsy
 * Useful for checking if a resource exists
 *
 * @example
 * const survey = await db.findSurvey(id);
 * assertFound(survey, "Survey not found");
 */
export function assertFound<T>(
  value: T | null | undefined,
  message = "Resource not found"
): asserts value is T {
  if (!value) {
    throw new NotFoundError(message);
  }
}

/**
 * Throws a ForbiddenError if condition is falsy
 * Useful for authorization checks
 *
 * @example
 * assertAuthorized(survey.creatorId === userId, "Access denied - you do not own this survey");
 */
export function assertAuthorized(
  condition: boolean,
  message = "Access denied"
): asserts condition {
  if (!condition) {
    throw new ForbiddenError(message);
  }
}

/**
 * Throws an UnauthorizedError if condition is falsy
 * Useful for authentication checks
 *
 * @example
 * assertAuthenticated(req.user?.claims?.sub, "Unauthorized - no user ID");
 */
export function assertAuthenticated(
  value: any,
  message = "Unauthorized"
): void {
  if (!value) {
    throw new UnauthorizedError(message);
  }
}

/**
 * Validates input using a Zod schema and throws BadRequestError on failure
 * Returns the parsed and validated data
 *
 * @example
 * const validatedData = validateInput(createSurveySchema, req.body);
 */
export function validateInput<T>(
  schema: { parse: (data: any) => T },
  data: any
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw error; // Let error handler deal with it
    }
    throw new BadRequestError("Invalid input");
  }
}

// ============================================================================
// Express Request Extensions
// ============================================================================

/**
 * Augment Express Request type to include common properties
 */
declare global {
  namespace Express {
    interface Request {
      id?: string; // Request ID from logger middleware
      log?: any; // Request-scoped logger
    }
  }
}
