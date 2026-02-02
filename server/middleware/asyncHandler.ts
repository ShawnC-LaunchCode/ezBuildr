/**
 * Async handler wrapper
 * Automatically catches errors in async route handlers and passes them to next()
 * Eliminates need for try/catch blocks in every route
 */

import { Request, Response, NextFunction } from 'express';

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
