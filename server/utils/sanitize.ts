/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
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
 * Recursively sanitizes all string values in an object
 * Handles nested objects and arrays
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursively sanitizes arbitrary nested object structures
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (obj === null || obj === undefined) {return obj;}
  if (typeof obj !== 'object') {return obj;}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- building sanitized copy of arbitrary structure
  const sanitized: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' ? sanitizeObject(item) :
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
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
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (req.query && typeof req.query === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express query params are string-indexed
    req.query = sanitizeObject(req.query as Record<string, any>);
  }

  next();
}
