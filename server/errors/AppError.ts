/**
 * Custom application error classes
 * Re-exports from canonical locations for backward compatibility.
 * - AppError family: server/middleware/errorHandler.ts
 * - ApiError with code enum: server/utils/errors.ts
 */

// Re-export from canonical locations
export {
  AppError,
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  assertFound,
  assertAuthorized,
  assertAuthenticated,
} from '../middleware/errorHandler';

export { ApiError, createError, ErrorCode } from '../utils/errors';

// ValidationError has an extra `errors` field not in the base hierarchy
export interface ValidationErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

import { AppError as _AppError } from '../middleware/errorHandler';

export class ValidationError extends _AppError {
  constructor(message: string, public errors?: ValidationErrorDetail[]) {
    super(message, 422);
  }
}
