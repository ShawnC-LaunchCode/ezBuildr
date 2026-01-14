/**
 * Validation Utilities
 * Reusable Zod schemas for common validation patterns
 */

import { z } from 'zod';

import { DATAVAULT_CONFIG } from '@shared/config';

/**
 * SECURITY FIX: Pagination validation schema
 * Prevents NaN and invalid values from parseInt
 */
export const paginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(DATAVAULT_CONFIG.MAX_PAGE_SIZE, `Limit cannot exceed ${DATAVAULT_CONFIG.MAX_PAGE_SIZE}`)
    .default(DATAVAULT_CONFIG.DEFAULT_PAGE_SIZE),
  offset: z.coerce
    .number()
    .int()
    .min(0, 'Offset must be non-negative')
    .max(DATAVAULT_CONFIG.MAX_OFFSET, `Offset cannot exceed ${DATAVAULT_CONFIG.MAX_OFFSET}`)
    .default(0),
});

/**
 * ID parameter validation (ensures valid UUID or string ID)
 */
export const idParamSchema = z.string().min(1, 'ID is required');

/**
 * Page number validation (for page-based pagination)
 */
export const pageNumberSchema = z.coerce
  .number()
  .int()
  .min(1, 'Page number must be at least 1')
  .default(1);

/**
 * Numeric query parameter validation
 */
export const numericParamSchema = (min?: number, max?: number) => {
  let schema = z.coerce.number().int();

  if (min !== undefined) {
    schema = schema.min(min, `Value must be at least ${min}`);
  }

  if (max !== undefined) {
    schema = schema.max(max, `Value cannot exceed ${max}`);
  }

  return schema;
};

/**
 * Helper to safely parse query parameters with Zod
 * Returns parsed values or throws a validation error
 */
export function parseQueryParams<T>(
  schema: z.ZodSchema<T>,
  params: Record<string, any>
): T {
  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Invalid query parameters: ${message}`);
    }
    throw error;
  }
}
