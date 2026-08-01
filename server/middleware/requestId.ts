import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';

/**
 * Request ID Middleware
 *
 * Generates a unique ID for each incoming request and attaches it to:
 * - Request object (req.id)
 * - Response header (X-Request-ID)
 * - Logger context (via req.log)
 *
 * This enables request tracking across logs, debugging, and distributed tracing.
 */

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if request ID already exists (e.g., from load balancer)
  const existingId = req.headers['x-request-id'] as string;

  // Generate or use existing ID
  const requestId = existingId ?? nanoid(16);

  // Attach to request object

  req.id = requestId;

  // Set response header
  res.setHeader('X-Request-ID', requestId);

  // If logger exists on request, add request ID to context

  if (req.log) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    req.log = (req.log as any).child({ requestId });
  }

  next();
};
