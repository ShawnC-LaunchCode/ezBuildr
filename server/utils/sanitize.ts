import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes a string by removing all HTML tags and scripts
 * Prevents XSS attacks by stripping dangerous content
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {return input;}

  // Remove HTML tags and scripts while keeping text content
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    KEEP_CONTENT: true, // Keep text content
  });
}

/**
 * Sanitizes one value of unknown shape, preserving its kind: objects and
 * arrays recurse, strings are cleaned, everything else passes through.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    return sanitizeObject(value);
  }
  return typeof value === 'string' ? sanitizeString(value) : value;
}

/**
 * Recursively sanitizes all string values in an object
 * Handles nested objects and arrays
 */
export function sanitizeObject<T extends object>(obj: T): T {
  if (obj === null || obj === undefined) {return obj;}
  if (typeof obj !== 'object') {return obj;}

  // Arrays must stay arrays. `sanitizeInputs` mounts this on every request
  // (server/index.ts, server/production.ts), so building a plain object here
  // would rewrite a JSON array body -- and any nested array-of-arrays -- into
  // an object with numeric string keys.
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeValue(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      const items = value as unknown[];
      sanitized[key] = items.map(item => sanitizeValue(item));
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Express middleware to sanitize all string inputs in req.body and req.query
 * Apply this after express.json() and express.urlencoded() middleware
 *
 * Usage:
 * app.use(express.json());
 * app.use(sanitizeInputs); // Apply sanitization
 */
export function sanitizeInputs(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as unknown;
  if (body && typeof body === 'object') {
    req.body = sanitizeObject(body);
  }

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
}
