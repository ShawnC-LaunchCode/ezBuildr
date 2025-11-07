/**
 * Centralized Error Handling Utilities
 * Provides consistent error handling across the backend
 */

import { Response } from "express";

/**
 * Base API Error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends ApiError {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
    this.name = 'BadRequestError';
  }
}

/**
 * Convert unknown error to ApiError
 */
export function handleError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      return new NotFoundError();
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return new UnauthorizedError(error.message);
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return new ForbiddenError(error.message);
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return new ValidationError(error.message);
    }
    if (message.includes('conflict') || message.includes('already exists')) {
      return new ConflictError(error.message);
    }

    return new ApiError(error.message, 500, 'INTERNAL_ERROR');
  }

  return new ApiError('An unexpected error occurred', 500, 'INTERNAL_ERROR');
}

/**
 * Send standardized error response
 */
export function sendErrorResponse(res: Response, error: ApiError): Response {
  const response: any = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };

  // Add validation details if available
  if (error instanceof ValidationError && error.details) {
    response.error.details = error.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
  }

  return res.status(error.statusCode).json(response);
}

/**
 * Async route handler wrapper
 * Catches errors and sends standardized error responses
 */
export function asyncHandler(
  fn: (req: any, res: Response, next?: any) => Promise<any>
) {
  return (req: any, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      const apiError = handleError(error);
      sendErrorResponse(res, apiError);
    });
  };
}
