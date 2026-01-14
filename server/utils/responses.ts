/**
 * Standardized API Response Utilities
 *
 * Provides consistent response formats for success and error cases.
 */

import { Response } from 'express';

import { AuthErrorCode, AuthenticationError, isAuthenticationError } from '../errors/AuthErrors';

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
  };
}

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Authentication error code mappings
 */
export const AUTH_ERROR_CODES = {
  AUTHENTICATION_FAILED: AuthErrorCode.AUTHENTICATION_FAILED,
  TOKEN_EXPIRED: AuthErrorCode.TOKEN_EXPIRED,
  INVALID_TOKEN: AuthErrorCode.INVALID_TOKEN,
  INVALID_CREDENTIALS: AuthErrorCode.INVALID_CREDENTIALS,
  ACCOUNT_LOCKED: AuthErrorCode.ACCOUNT_LOCKED,
  EMAIL_NOT_VERIFIED: AuthErrorCode.EMAIL_NOT_VERIFIED,
  MFA_REQUIRED: AuthErrorCode.MFA_REQUIRED,
  UNAUTHORIZED: AuthErrorCode.UNAUTHORIZED,
  FORBIDDEN: AuthErrorCode.FORBIDDEN,
} as const;

/**
 * General error codes for non-auth errors
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'ERR_001',
  NOT_FOUND: 'ERR_002',
  INTERNAL_ERROR: 'ERR_003',
  BAD_REQUEST: 'ERR_004',
  CONFLICT: 'ERR_005',
  RATE_LIMIT_EXCEEDED: 'ERR_006',
  SERVICE_UNAVAILABLE: 'ERR_007',
} as const;

/**
 * Create a standardized error response
 */
export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create a standardized success response
 */
export function successResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send an error response from an Error object
 */
export function sendErrorResponse(
  res: Response,
  error: Error | AuthenticationError,
  statusCode?: number
): Response {
  // Handle authentication errors
  if (isAuthenticationError(error)) {
    return res.status(error.statusCode).json(
      errorResponse(error.code, error.message, {
        // Include additional details for specific error types
        ...(error instanceof Error && error.constructor.name !== 'AuthenticationError'
          ? { errorType: error.constructor.name }
          : {}),
      })
    );
  }

  // Handle validation errors (e.g., from Zod)
  if (error.name === 'ZodError') {
    return res.status(400).json(
      errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', {
        validationErrors: (error as any).errors,
      })
    );
  }

  // Handle generic errors
  const status = statusCode || 500;
  const code = status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL_ERROR;

  return res.status(status).json(errorResponse(code, error.message));
}

/**
 * Send a success response
 */
export function sendSuccessResponse<T>(res: Response, data: T, statusCode: number = 200): Response {
  return res.status(statusCode).json(successResponse(data));
}

/**
 * Send a paginated response
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  timestamp: string;
}

export function paginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  totalItems: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a paginated response
 */
export function sendPaginatedResponse<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  totalItems: number,
  statusCode: number = 200
): Response {
  return res.status(statusCode).json(paginatedResponse(data, page, pageSize, totalItems));
}

/**
 * Common HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Helper to send common status responses
 */
export const send = {
  ok: <T>(res: Response, data: T) => sendSuccessResponse(res, data, HTTP_STATUS.OK),
  created: <T>(res: Response, data: T) => sendSuccessResponse(res, data, HTTP_STATUS.CREATED),
  noContent: (res: Response) => res.status(HTTP_STATUS.NO_CONTENT).send(),
  badRequest: (res: Response, message: string) =>
    res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(ERROR_CODES.BAD_REQUEST, message)),
  unauthorized: (res: Response, message: string = 'Authentication required') =>
    res
      .status(HTTP_STATUS.UNAUTHORIZED)
      .json(errorResponse(AUTH_ERROR_CODES.UNAUTHORIZED, message)),
  forbidden: (res: Response, message: string = 'Insufficient permissions') =>
    res.status(HTTP_STATUS.FORBIDDEN).json(errorResponse(AUTH_ERROR_CODES.FORBIDDEN, message)),
  notFound: (res: Response, message: string = 'Resource not found') =>
    res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse(ERROR_CODES.NOT_FOUND, message)),
  conflict: (res: Response, message: string) =>
    res.status(HTTP_STATUS.CONFLICT).json(errorResponse(ERROR_CODES.CONFLICT, message)),
  rateLimitExceeded: (res: Response, message: string = 'Too many requests') =>
    res
      .status(HTTP_STATUS.TOO_MANY_REQUESTS)
      .json(errorResponse(ERROR_CODES.RATE_LIMIT_EXCEEDED, message)),
  internalError: (res: Response, message: string = 'Internal server error') =>
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(errorResponse(ERROR_CODES.INTERNAL_ERROR, message)),
  serviceUnavailable: (res: Response, message: string = 'Service temporarily unavailable') =>
    res
      .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
      .json(errorResponse(ERROR_CODES.SERVICE_UNAVAILABLE, message)),
};
