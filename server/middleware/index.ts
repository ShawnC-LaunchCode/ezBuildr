/**
 * Middleware Exports
 *
 * Central export point for all middleware modules.
 * Use this to import middleware throughout the application.
 */

// Error Handler Middleware
export {
  // Middleware
  errorHandler,
  asyncHandler,

  // Error Classes
  AppError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError,
  ConflictError,

  // Helper Functions
  assertFound,
  assertAuthorized,
  assertAuthenticated,
  validateInput,
} from './errorHandler';

// Auth Middleware (existing)
export { isAdmin, checkIsAdmin } from './adminAuth';
export { requireAuth, requireProjectRole, requireWorkflowRole } from './aclAuth';
export { runTokenAuth, creatorOrRunTokenAuth, type RunAuthRequest } from './runTokenAuth';
