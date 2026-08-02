/**
 * Variable Normalizer
 *
 * Transforms complex step values into flat key-value pairs suitable for
 * document template rendering.
 *
 * Capabilities:
 * - Flatten nested objects using dot notation
 * - Preserve arrays so templates can loop over them ({{#items}}...{{/items}});
 *   the renderers join arrays for display when used as a scalar {{tag}}
 * - Handle multi-field values (address, name, etc.)
 * - Preserve simple values unchanged
 * - Type-safe with TypeScript
 *
 * @version 1.0.0 - Final Block Extension (Prompt 10)
 * @date December 6, 2025
 */

import {
  projectListValue,
  resolveItemLabel,
  type AddressValue,
  type ChoiceAdvancedConfig,
  type DynamicOptionsConfig,
  type ListConfig,
  type ListValue,
  type MultiFieldValue,
} from '../../../shared/types/stepConfigs';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Normalization options
 */
export interface NormalizationOptions {
  /** Whether to flatten nested objects with dot notation (default: true) */
  flattenNested?: boolean;

  /**
   * Whether to convert arrays to comma-separated strings (default: false).
   * Leave false so templates can loop over arrays with {{#items}}...{{/items}};
   * scalar {{tag}} usage of an array is joined for display at render time.
   */
  joinArrays?: boolean;

  /** Delimiter for joining arrays (default: ", ") */
  arrayDelimiter?: string;

  /** Whether to include null/undefined values as empty strings (default: true) */
  includeEmpty?: boolean;

  /** Maximum depth for nested object flattening (default: 10) */
  maxDepth?: number;

  /** List step configs keyed by the alias used in template data. */
  listConfigs?: Record<string, ListConfig | undefined>;

  /**
   * Choice steps whose options are bound to a list step, keyed by the
   * choice step's own alias. A stored value for such a step is the
   * selected item's stable `itemId` (Choice Value Model Decision 8), which
   * this resolves back to the item's display label at normalization time
   * (LIST2-6) so documents render `Ava Whitmore` instead of a raw UUID.
   */
  listBoundChoices?: Record<string, ChoiceListBinding | undefined>;
}

export interface ListStepConfigSource {
  id: string;
  alias?: string | null;
  type: string;
  config?: unknown;
}

/** A `choice` step's dynamic options bound to a `list` step's own values. */
export interface ChoiceListBinding {
  /** Alias (or id fallback) the referenced list step's value is keyed under. */
  listAlias: string;
  listConfig: ListConfig;
}

/**
 * Normalized data structure (flat key-value pairs; arrays are preserved
 * so document templates can loop over them)
 */
export type NormalizedData = Record<string, string | number | boolean | unknown[]>;

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
 *   "hobbies": ["biking", "hiking"]
 * }
 * ```
 */
export function normalizeVariables(
  stepValues: Record<string, unknown>,
  options: NormalizationOptions = {}
): NormalizedData {
  const opts: Required<NormalizationOptions> = {
    flattenNested: options.flattenNested ?? true,
    joinArrays: options.joinArrays ?? false,
    arrayDelimiter: options.arrayDelimiter ?? ', ',
    includeEmpty: options.includeEmpty ?? true,
    maxDepth: options.maxDepth ?? 10,
    listConfigs: options.listConfigs ?? {},
    listBoundChoices: options.listBoundChoices ?? {},
  };

  const result: NormalizedData = {};

  // Process each step value
  for (const [key, value] of Object.entries(stepValues)) {
    const listConfig = opts.listConfigs[key];
    const choiceBinding = opts.listBoundChoices[key];
    let templateValue: unknown = value;
    if (listConfig !== undefined) {
      templateValue = projectListValue(value as ListValue | null | undefined, listConfig);
    } else if (choiceBinding !== undefined) {
      templateValue = resolveListBoundChoiceValue(value, choiceBinding, stepValues[choiceBinding.listAlias]);
    }
    processValue(result, key, templateValue, opts, 0);
  }

  return result;
}

/**
 * Resolves a list-bound choice's stored itemId(s) back to display label(s)
 * using the same `resolveItemLabel` the runner uses. An id with no matching
 * item (deleted item, missing source list) degrades to the raw stored value
 * rather than throwing or emitting empty (LIST2-6 AC3).
 */
function resolveListBoundChoiceValue(
  value: unknown,
  binding: ChoiceListBinding,
  rawListValue: unknown
): unknown {
  const listValue = isListValueLike(rawListValue) ? rawListValue : { items: [] };

  const resolveOne = (storedId: unknown): unknown => {
    if (typeof storedId !== 'string' || storedId === '') {
      return storedId;
    }
    const item = listValue.items.find((candidate) => candidate.itemId === storedId);
    if (!item) {
      return storedId;
    }
    return resolveItemLabel(item, binding.listConfig, storedId);
  };

  return Array.isArray(value) ? value.map(resolveOne) : resolveOne(value);
}

function isListValueLike(value: unknown): value is ListValue {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items);
}

/**
 * Collect the list configs needed to project stored values for templates.
 * Aliases are the public document variable names; step ids remain the fallback
 * for the same alias-keying behavior used by run data.
 */
export function getListConfigsByAlias(
  steps: ListStepConfigSource[]
): Record<string, ListConfig> {
  const configs: Record<string, ListConfig> = {};

  for (const step of steps) {
    if (step.type !== 'list' || !isListConfig(step.config)) {
      continue;
    }
    const key = step.alias !== null && step.alias !== undefined && step.alias !== ''
      ? step.alias
      : step.id;
    configs[key] = step.config;
  }

  return configs;
}

function isListConfig(config: unknown): config is ListConfig {
  return typeof config === 'object'
    && config !== null
    && Array.isArray((config as { fields?: unknown }).fields);
}

/**
 * Collect the list bindings needed to resolve a list-bound choice step's
 * stored itemId(s) back to display labels (LIST2-6). Mirrors
 * `getListConfigsByAlias`'s alias-with-id-fallback keying so both can be
 * built from the same `steps` array at the same two call sites.
 */
export function getChoiceListBindingsByAlias(
  steps: ListStepConfigSource[]
): Record<string, ChoiceListBinding> {
  const listConfigs = getListConfigsByAlias(steps);
  const bindings: Record<string, ChoiceListBinding> = {};

  for (const step of steps) {
    if (step.type !== 'choice') {
      continue;
    }
    const dynamicConfig = getListDynamicOptionsConfig(step.config);
    if (!dynamicConfig) {
      continue;
    }
    const listConfig = listConfigs[dynamicConfig.listVariable];
    // Not every list-bound dynamic source is a `list` step (Read Table / List
    // Tools blocks also produce ListVariables) — only resolve the case this
    // ticket covers, a dynamic source that is itself a `list` step.
    if (listConfig === undefined) {
      continue;
    }
    const key = step.alias !== null && step.alias !== undefined && step.alias !== ''
      ? step.alias
      : step.id;
    bindings[key] = { listAlias: dynamicConfig.listVariable, listConfig };
  }

  return bindings;
}

/**
 * `config.options` is the authoritative field for a choice step's dynamic
 * source (mirrors the client's `parseDynamicOptionsConfig` in
 * `useChoiceOptions.ts` — the deprecated `dynamicOptions` field on
 * `ChoiceAdvancedConfig` is never written by current saves).
 */
function getListDynamicOptionsConfig(
  config: unknown
): Extract<DynamicOptionsConfig, { type: 'list' }> | undefined {
  const options = (config as ChoiceAdvancedConfig | undefined)?.options;
  if (options !== null && typeof options === 'object' && 'type' in options && options.type === 'list') {
    return options;
  }
  return undefined;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Handle arrays: preserve them so templates can loop ({{#items}}...{{/items}}).
  // Joining is opt-in; scalar {{tag}} display of arrays happens at render time.
  if (Array.isArray(value)) {
    if (opts.joinArrays) {
      result[key] = joinArray(value, opts.arrayDelimiter);
    } else {
      result[key] = value;
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
  obj: Record<string, unknown>,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
  obj: Record<string, unknown>,
  path: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const keys = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
  getListConfigsByAlias,
  getChoiceListBindingsByAlias,
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
