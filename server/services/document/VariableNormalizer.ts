/**
 * Variable Normalizer
 *
 * Transforms complex step values into flat key-value pairs suitable for
 * document template rendering.
 *
 * Capabilities:
 * - Flatten nested objects using dot notation
 * - Convert arrays to comma-separated strings
 * - Handle multi-field values (address, name, etc.)
 * - Preserve simple values unchanged
 * - Type-safe with TypeScript
 *
 * @version 1.0.0 - Final Block Extension (Prompt 10)
 * @date December 6, 2025
 */

import type { AddressValue, MultiFieldValue } from '../../../shared/types/stepConfigs';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Normalization options
 */
export interface NormalizationOptions {
  /** Whether to flatten nested objects with dot notation (default: true) */
  flattenNested?: boolean;

  /** Whether to convert arrays to comma-separated strings (default: true) */
  joinArrays?: boolean;

  /** Delimiter for joining arrays (default: ", ") */
  arrayDelimiter?: string;

  /** Whether to include null/undefined values as empty strings (default: true) */
  includeEmpty?: boolean;

  /** Maximum depth for nested object flattening (default: 10) */
  maxDepth?: number;
}

/**
 * Normalized data structure (flat key-value pairs)
 */
export type NormalizedData = Record<string, string | number | boolean | string[]>;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Normalize step values for document template rendering
 *
 * @param stepValues - Raw step values from workflow run
 * @param options - Normalization options
 * @returns Flat key-value pairs suitable for template rendering
 *
 * @example
 * ```typescript
 * const normalized = normalizeVariables({
 *   firstName: "John",
 *   lastName: "Doe",
 *   address: {
 *     street: "123 Main St",
 *     city: "NYC"
 *   },
 *   hobbies: ["biking", "hiking"]
 * });
 *
 * // Result:
 * {
 *   "firstName": "John",
 *   "lastName": "Doe",
 *   "address.street": "123 Main St",
 *   "address.city": "NYC",
 *   "hobbies": "biking, hiking"
 * }
 * ```
 */
export function normalizeVariables(
  stepValues: Record<string, any>,
  options: NormalizationOptions = {}
): NormalizedData {
  const opts: Required<NormalizationOptions> = {
    flattenNested: options.flattenNested ?? true,
    joinArrays: options.joinArrays ?? true,
    arrayDelimiter: options.arrayDelimiter ?? ', ',
    includeEmpty: options.includeEmpty ?? true,
    maxDepth: options.maxDepth ?? 10,
  };

  const result: NormalizedData = {};

  // Process each step value
  for (const [key, value] of Object.entries(stepValues)) {
    processValue(result, key, value, opts, 0);
  }

  return result;
}

// ============================================================================
// PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process a single value and add to result
 */
function processValue(
  result: NormalizedData,
  key: string,
  value: any,
  opts: Required<NormalizationOptions>,
  depth: number
): void {
  // Prevent infinite recursion
  if (depth > opts.maxDepth) {
    result[key] = '[Max depth exceeded]';
    return;
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    if (opts.includeEmpty) {
      result[key] = '';
    }
    return;
  }

  // Handle primitive types
  if (isPrimitive(value)) {
    result[key] = value;
    return;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (opts.joinArrays) {
      result[key] = joinArray(value, opts.arrayDelimiter);
    } else {
      result[key] = JSON.stringify(value);
    }
    return;
  }

  // Handle Date objects
  if (value instanceof Date) {
    result[key] = value.toISOString();
    return;
  }

  // Handle objects (nested structures)
  if (typeof value === 'object' && value !== null) {
    if (opts.flattenNested) {
      flattenObject(result, key, value, opts, depth + 1);
    } else {
      result[key] = JSON.stringify(value);
    }
    return;
  }

  // Fallback: convert to string
  result[key] = String(value);
}

/**
 * Flatten a nested object using dot notation
 */
function flattenObject(
  result: NormalizedData,
  prefix: string,
  obj: Record<string, any>,
  opts: Required<NormalizationOptions>,
  depth: number
): void {
  for (const [childKey, childValue] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${childKey}` : childKey;
    processValue(result, newKey, childValue, opts, depth);
  }
}

/**
 * Join array elements into a string
 */
function joinArray(arr: any[], delimiter: string): string {
  return arr
    .map(item => {
      if (item === null || item === undefined) {
        return '';
      }
      if (typeof item === 'object') {
        return JSON.stringify(item);
      }
      return String(item);
    })
    .filter(item => item !== '') // Remove empty entries
    .join(delimiter);
}

/**
 * Check if value is a primitive type
 */
function isPrimitive(value: any): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

// ============================================================================
// SPECIALIZED NORMALIZERS
// ============================================================================

/**
 * Normalize address value with optional prefix
 *
 * @example
 * ```typescript
 * normalizeAddress({
 *   street: "123 Main St",
 *   city: "NYC",
 *   state: "NY",
 *   zip: "10001"
 * }, "billingAddress");
 *
 * // Result:
 * {
 *   "billingAddress.street": "123 Main St",
 *   "billingAddress.city": "NYC",
 *   "billingAddress.state": "NY",
 *   "billingAddress.zip": "10001"
 * }
 * ```
 */
export function normalizeAddress(
  address: AddressValue | null | undefined,
  prefix?: string
): NormalizedData {
  if (!address) {return {};}

  const result: NormalizedData = {};
  const fields = ['street', 'street2', 'city', 'state', 'zip', 'country'] as const;

  for (const field of fields) {
    const value = address[field];
    if (value !== null && value !== undefined) {
      const key = prefix ? `${prefix}.${field}` : field;
      result[key] = value;
    }
  }

  return result;
}

/**
 * Normalize multi-field value with optional prefix
 *
 * @example
 * ```typescript
 * normalizeMultiField({
 *   first: "John",
 *   last: "Doe",
 *   email: "john@example.com"
 * }, "contact");
 *
 * // Result:
 * {
 *   "contact.first": "John",
 *   "contact.last": "Doe",
 *   "contact.email": "john@example.com"
 * }
 * ```
 */
export function normalizeMultiField(
  multiField: MultiFieldValue | null | undefined,
  prefix?: string
): NormalizedData {
  if (!multiField) {return {};}

  const result: NormalizedData = {};

  for (const [field, value] of Object.entries(multiField)) {
    if (value !== null && value !== undefined) {
      const key = prefix ? `${prefix}.${field}` : field;
      result[key] = value;
    }
  }

  return result;
}

/**
 * Normalize choice value (single or multiple selections)
 *
 * @example
 * ```typescript
 * normalizeChoice(["option1", "option2"], ", ");
 * // Result: "option1, option2"
 *
 * normalizeChoice("single_option", ", ");
 * // Result: "single_option"
 * ```
 */
export function normalizeChoice(
  choice: string | string[] | null | undefined,
  delimiter: string = ', '
): string {
  if (!choice) {return '';}
  if (Array.isArray(choice)) {
    return choice.join(delimiter);
  }
  return String(choice);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Merge normalized data objects
 * Later entries override earlier ones for conflicting keys
 */
export function mergeNormalizedData(
  ...datasets: NormalizedData[]
): NormalizedData {
  return Object.assign({}, ...datasets);
}

/**
 * Filter normalized data by key prefix
 *
 * @example
 * ```typescript
 * const data = {
 *   "user.name": "John",
 *   "user.email": "john@example.com",
 *   "order.total": 100
 * };
 *
 * filterByPrefix(data, "user.");
 * // Result: { "user.name": "John", "user.email": "john@example.com" }
 * ```
 */
export function filterByPrefix(
  data: NormalizedData,
  prefix: string
): NormalizedData {
  const result: NormalizedData = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(prefix)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Remove prefix from all keys in normalized data
 *
 * @example
 * ```typescript
 * const data = {
 *   "user.name": "John",
 *   "user.email": "john@example.com"
 * };
 *
 * stripPrefix(data, "user.");
 * // Result: { "name": "John", "email": "john@example.com" }
 * ```
 */
export function stripPrefix(
  data: NormalizedData,
  prefix: string
): NormalizedData {
  const result: NormalizedData = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(prefix)) {
      const newKey = key.substring(prefix.length);
      result[newKey] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get nested value from object using dot notation path
 *
 * @example
 * ```typescript
 * const obj = { user: { profile: { name: "John" } } };
 * getNestedValue(obj, "user.profile.name"); // "John"
 * getNestedValue(obj, "user.missing.path"); // undefined
 * ```
 */
export function getNestedValue(
  obj: Record<string, any>,
  path: string
): any {
  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that all required variables are present in normalized data
 *
 * @returns Array of missing variable names (empty if all present)
 */
export function validateRequiredVariables(
  normalizedData: NormalizedData,
  requiredVariables: string[]
): string[] {
  const missing: string[] = [];

  for (const variable of requiredVariables) {
    const value = normalizedData[variable];
    if (value === null || value === undefined || value === '') {
      missing.push(variable);
    }
  }

  return missing;
}

/**
 * Check if normalized data has all keys from a list
 */
export function hasAllKeys(
  normalizedData: NormalizedData,
  keys: string[]
): boolean {
  return keys.every(key => key in normalizedData);
}

/**
 * Get statistics about normalized data
 */
export function getNormalizationStats(normalizedData: NormalizedData): {
  totalKeys: number;
  emptyValues: number;
  numberValues: number;
  stringValues: number;
  booleanValues: number;
  nestedKeys: number; // Keys with dots
} {
  let emptyValues = 0;
  let numberValues = 0;
  let stringValues = 0;
  let booleanValues = 0;
  let nestedKeys = 0;

  for (const [key, value] of Object.entries(normalizedData)) {
    if (value === '' || value === null || value === undefined) {
      emptyValues++;
    }
    if (typeof value === 'number') {
      numberValues++;
    }
    if (typeof value === 'string') {
      stringValues++;
    }
    if (typeof value === 'boolean') {
      booleanValues++;
    }
    if (key.includes('.')) {
      nestedKeys++;
    }
  }

  return {
    totalKeys: Object.keys(normalizedData).length,
    emptyValues,
    numberValues,
    stringValues,
    booleanValues,
    nestedKeys,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  normalizeVariables,
  normalizeAddress,
  normalizeMultiField,
  normalizeChoice,
  mergeNormalizedData,
  filterByPrefix,
  stripPrefix,
  getNestedValue,
  validateRequiredVariables,
  hasAllKeys,
  getNormalizationStats,
};
