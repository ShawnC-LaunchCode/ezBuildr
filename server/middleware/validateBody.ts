import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

import { createError } from "../utils/errors";

/**
 * Express middleware that validates req.body against a Zod schema.
 * On success, attaches the parsed (type-safe) data to req.body.
 * On failure, calls next() with a VALIDATION_ERROR ApiError.
 *
 * @example
 * app.post('/api/pages', hybridAuth, validateBody(insertPageSchema), asyncHandler(handler));
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(createError.validation("Validation failed", result.error.errors));
      return;
    }
    req.body = result.data;
    next();
  };
}
