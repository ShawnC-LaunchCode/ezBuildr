import { logger } from '../../logger';
import { getAuthUserTenantId, getAuthUserId } from '../../middleware/auth';

import type { Request } from 'express';

// Shared error messages for DataVault routes
export const ERROR_AUTH_REQUIRED = 'Authentication required';
export const ERROR_ROW_NOT_FOUND = 'Row not found';
export const ERROR_INVALID_INPUT = 'Invalid input';

// Helper to get tenantId with proper error handling
export const getTenantId = (req: Request): string => {
  const tenantId = getAuthUserTenantId(req);
  if (!tenantId) {
    logger.error(
      {
        userId: getAuthUserId(req),
        path: req.path
      },
      'User session missing tenantId - user may need to log out and log back in'
    );
    throw new Error('Your account is not properly configured. Please log out and log back in to fix this issue.');
  }
  return tenantId;
};
