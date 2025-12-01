/**
 * Standardized error codes for API responses
 */
export const ErrorCode = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NO_TENANT: 'NO_TENANT',
  TENANT_MISMATCH: 'TENANT_MISMATCH',

  // Resource
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Workflow
  WORKFLOW_NOT_DRAFT: 'WORKFLOW_NOT_DRAFT',
  WORKFLOW_NO_VERSION: 'WORKFLOW_NO_VERSION',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',

  // Template
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',

  // Run
  RUN_EXECUTION_ERROR: 'RUN_EXECUTION_ERROR',

  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Standardized API error response shape
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCodeType;
    message: string;
    details?: any;
  };
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public code: ErrorCodeType,
    message: string,
    public details?: any,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Error factory functions for common error types
 */
export const createError = {
  unauthorized(message = 'Authentication required', details?: any): ApiError {
    return new ApiError(ErrorCode.UNAUTHORIZED, message, details, 401);
  },

  forbidden(message = 'Permission denied', details?: any): ApiError {
    return new ApiError(ErrorCode.FORBIDDEN, message, details, 403);
  },

  notFound(resource: string, id?: string, details?: any): ApiError {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    return new ApiError(ErrorCode.NOT_FOUND, message, details, 404);
  },

  conflict(message: string, details?: any): ApiError {
    return new ApiError(ErrorCode.CONFLICT, message, details, 409);
  },

  validation(message: string, details?: any): ApiError {
    return new ApiError(ErrorCode.VALIDATION_ERROR, message, details, 400);
  },

  invalidInput(message: string, details?: any): ApiError {
    return new ApiError(ErrorCode.INVALID_INPUT, message, details, 400);
  },

  badRequest(message: string, details?: any): ApiError {
    return new ApiError(ErrorCode.INVALID_INPUT, message, details, 400);
  },

  workflowNotDraft(message = 'Workflow must be in draft status to edit'): ApiError {
    return new ApiError(ErrorCode.WORKFLOW_NOT_DRAFT, message, undefined, 400);
  },

  workflowNoVersion(message = 'No published version available for this workflow'): ApiError {
    return new ApiError(ErrorCode.WORKFLOW_NO_VERSION, message, undefined, 400);
  },

  invalidFileType(message = 'Invalid file type', details?: any): ApiError {
    return new ApiError(ErrorCode.INVALID_FILE_TYPE, message, details, 400);
  },

  internal(message = 'Internal server error', details?: any): ApiError {
    return new ApiError(ErrorCode.INTERNAL_ERROR, message, details, 500);
  },

  database(message = 'Database error', details?: any): ApiError {
    return new ApiError(ErrorCode.DATABASE_ERROR, message, details, 500);
  },
};

/**
 * Format error response for Express
 */
export function formatErrorResponse(error: any): { status: number; body: ApiErrorResponse } {
  if (error instanceof ApiError) {
    return {
      status: error.statusCode,
      body: error.toJSON(),
    };
  }

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return {
      status: 400,
      body: {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details: error.errors,
        },
      },
    };
  }

  // Generic error
  return {
    status: 500,
    body: {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message || 'Internal server error',
      },
    },
  };
}
