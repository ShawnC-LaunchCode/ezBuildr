/**
 * Standardized validation error messages
 * Used across all Zod schemas for consistent error reporting
 */

export const validationMessages = {
  // Required fields
  required: (field: string) => `${field} is required`,

  // String validations
  minLength: (field: string, min: number) =>
    `${field} must be at least ${min} character${min === 1 ? '' : 's'}`,
  maxLength: (field: string, max: number) =>
    `${field} must be at most ${max} character${max === 1 ? '' : 's'}`,
  invalidFormat: (field: string) => `Invalid ${field} format`,
  invalidEmail: 'Invalid email address',
  invalidUrl: 'Invalid URL format',
  invalidUuid: 'Invalid UUID format',

  // Number validations
  minValue: (field: string, min: number) => `${field} must be at least ${min}`,
  maxValue: (field: string, max: number) => `${field} must be at most ${max}`,
  positiveNumber: (field: string) => `${field} must be a positive number`,
  integerOnly: (field: string) => `${field} must be an integer`,

  // Array validations
  minItems: (field: string, min: number) =>
    `${field} must contain at least ${min} item${min === 1 ? '' : 's'}`,
  maxItems: (field: string, max: number) =>
    `${field} must contain at most ${max} item${max === 1 ? '' : 's'}`,

  // Enum validations
  invalidOption: (field: string, options: string[]) =>
    `${field} must be one of: ${options.join(', ')}`,

  // DataVault-specific messages
  database: {
    nameRequired: 'Database name is required',
    nameMinLength: 'Database name must be at least 1 character',
    nameMaxLength: 'Database name must be at most 255 characters',
    descriptionMaxLength: 'Database description must be at most 1000 characters',
    invalidIcon: 'Invalid database icon',
  },

  table: {
    nameRequired: 'Table name is required',
    nameMinLength: 'Table name must be at least 1 character',
    nameMaxLength: 'Table name must be at most 255 characters',
    descriptionMaxLength: 'Table description must be at most 1000 characters',
    invalidIcon: 'Invalid table icon',
  },

  column: {
    nameRequired: 'Column name is required',
    nameMinLength: 'Column name must be at least 1 character',
    nameMaxLength: 'Column name must be at most 255 characters',
    invalidType: 'Invalid column type',
    invalidReferenceTable: 'Invalid reference table ID',
    circularReference: 'Circular reference detected',
  },

  row: {
    tableIdRequired: 'Table ID is required',
    invalidValue: (columnName: string) => `Invalid value for column: ${columnName}`,
    requiredField: (columnName: string) => `${columnName} is required`,
    uniqueConstraintViolation: (columnName: string) =>
      `A row with this ${columnName} already exists`,
  },

  auth: {
    unauthorized: 'Unauthorized access',
    invalidToken: 'Invalid authentication token',
    sessionExpired: 'Session has expired',
    insufficientPermissions: 'Insufficient permissions to perform this action',
  },

  common: {
    notFound: (resource: string) => `${resource} not found`,
    alreadyExists: (resource: string) => `${resource} already exists`,
    invalidId: 'Invalid ID format',
    serverError: 'An internal server error occurred',
  },
};

/**
 * Helper function to create Zod error messages
 */
export function zodMessage(message: string) {
  return { message };
}

/**
 * Common Zod refinements with standardized messages
 */
export const zodRefinements = {
  uuid: (value: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  notEmpty: (value: string) => value.trim().length > 0,

  validUrl: (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
};
