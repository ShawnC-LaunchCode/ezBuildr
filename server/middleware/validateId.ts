import { z } from 'zod';

import { createLogger } from '../logger';

import type { Request, Response, NextFunction } from 'express';

const logger = createLogger({ module: 'validate-id-middleware' });

// ============================================================
// SCHEMAS
// ============================================================

/**
 * UUID v4 format validator
 */
const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Nanoid format validator (21 character alphanumeric)
 * Nanoid default alphabet: A-Za-z0-9_-
 */
const nanoidSchema = z.string().regex(
  /^[A-Za-z0-9_-]{21}$/,
  'Invalid nanoid format (expected 21 characters)'
);

/**
 * Flexible ID validator - accepts either UUID or nanoid
 * This is the most permissive validator
 */
const idSchema = z.string().min(1, 'ID cannot be empty').refine(
  (id) => {
    // Check if it's a valid UUID
    const uuidResult = uuidSchema.safeParse(id);
    if (uuidResult.success) {return true;}

    // Check if it's a valid nanoid
    const nanoidResult = nanoidSchema.safeParse(id);
    if (nanoidResult.success) {return true;}

    return false;
  },
  { message: 'Invalid ID format (must be UUID or nanoid)' }
);

/**
 * Slug format validator (URL-safe string)
 */
const slugSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  'Invalid slug format (lowercase alphanumeric with hyphens)'
);

// ============================================================
// VALIDATOR FACTORY
// ============================================================

/**
 * Creates a validation middleware for route parameters
 *
 * @param paramName - Name of the route parameter to validate
 * @param schema - Zod schema to validate against
 * @param options - Validation options
 *
 * @example
 * // Validate UUID parameter
 * app.get('/api/users/:userId', validateParam('userId', uuidSchema), (req, res) => {
 *   const { userId } = req.params; // TypeScript knows this is valid
 * });
 *
 * @example
 * // Validate custom schema
 * app.get('/api/items/:itemId', validateParam('itemId', nanoidSchema), (req, res) => {
 *   // ...
 * });
 */
export function validateParam(
  paramName: string,
  schema: z.ZodSchema,
  options: { optional?: boolean } = {}
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const value = req.params[paramName];

      // Handle optional parameters
      if (options.optional && (value === undefined || value === null || value === '')) {
        return next();
      }

      // Validate parameter
      const result = schema.safeParse(value);

      if (!result.success) {
        const errorMessage = result.error.errors[0]?.message || 'Validation failed';
        logger.warn(
          { paramName, value, error: result.error.errors },
          'Parameter validation failed'
        );

        res.status(400).json({
          message: `Invalid ${paramName}: ${errorMessage}`,
          error: 'invalid_parameter',
          field: paramName
        });
        return;
      }

      // Validation passed, continue
      next();
    } catch (error) {
      logger.error({ error, paramName }, 'Validation middleware error');
      res.status(500).json({
        message: 'Internal validation error',
        error: 'internal_error'
      });
    }
  };
}

/**
 * Creates a validation middleware for query parameters
 *
 * @param queryName - Name of the query parameter to validate
 * @param schema - Zod schema to validate against
 * @param options - Validation options
 *
 * @example
 * app.get('/api/items', validateQuery('limit', z.coerce.number().min(1).max(100)), (req, res) => {
 *   const limit = parseInt(req.query.limit as string); // Safe to parse
 * });
 */
export function validateQuery(
  queryName: string,
  schema: z.ZodSchema,
  options: { optional?: boolean } = {}
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const value = req.query[queryName];

      // Handle optional query params
      if (options.optional && (value === undefined || value === null || value === '')) {
        return next();
      }

      // Validate query parameter
      const result = schema.safeParse(value);

      if (!result.success) {
        const errorMessage = result.error.errors[0]?.message || 'Validation failed';
        logger.warn(
          { queryName, value, error: result.error.errors },
          'Query parameter validation failed'
        );

        res.status(400).json({
          message: `Invalid ${queryName}: ${errorMessage}`,
          error: 'invalid_query_parameter',
          field: queryName
        });
        return;
      }

      // Validation passed, continue
      next();
    } catch (error) {
      logger.error({ error, queryName }, 'Query validation middleware error');
      res.status(500).json({
        message: 'Internal validation error',
        error: 'internal_error'
      });
    }
  };
}

/**
 * Creates a validation middleware for request body fields
 *
 * @param schema - Zod schema to validate the entire body against
 *
 * @example
 * app.post('/api/users', validateBody(z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8)
 * })), (req, res) => {
 *   // req.body is validated
 * });
 */
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        logger.warn({ errors, body: req.body }, 'Body validation failed');

        res.status(400).json({
          message: 'Validation failed',
          error: 'invalid_body',
          errors
        });
        return;
      }

      // Validation passed, continue
      next();
    } catch (error) {
      logger.error({ error }, 'Body validation middleware error');
      res.status(500).json({
        message: 'Internal validation error',
        error: 'internal_error'
      });
    }
  };
}

// ============================================================
// COMMON VALIDATORS (Pre-configured for convenience)
// ============================================================

/**
 * Validates that a route parameter is a valid UUID
 * @example app.get('/api/users/:userId', validateUuid('userId'), handler)
 */
export const validateUuid = (paramName: string) => validateParam(paramName, uuidSchema);

/**
 * Validates that a route parameter is a valid nanoid
 * @example app.get('/api/workflows/:workflowId', validateNanoid('workflowId'), handler)
 */
export const validateNanoid = (paramName: string) => validateParam(paramName, nanoidSchema);

/**
 * Validates that a route parameter is a valid ID (UUID or nanoid)
 * @example app.get('/api/items/:itemId', validateId('itemId'), handler)
 */
export const validateId = (paramName: string) => validateParam(paramName, idSchema);

/**
 * Validates that a route parameter is a valid slug
 * @example app.get('/api/public/:slug', validateSlug('slug'), handler)
 */
export const validateSlug = (paramName: string) => validateParam(paramName, slugSchema);

/**
 * Common ID validators for specific resources
 */
export const validateProjectId = () => validateId('projectId');
export const validateWorkflowId = () => validateId('workflowId');
export const validateUserId = () => validateId('userId');
export const validateSectionId = () => validateId('sectionId');
export const validateStepId = () => validateId('stepId');
export const validateRunId = () => validateId('runId');
export const validateDatabaseId = () => validateId('databaseId');
export const validateTableId = () => validateId('tableId');
export const validateRowId = () => validateId('rowId');
export const validateConnectionId = () => validateId('connectionId');
export const validateTemplateId = () => validateId('templateId');

// Export schemas for use in other validators
export { uuidSchema, nanoidSchema, idSchema, slugSchema };
