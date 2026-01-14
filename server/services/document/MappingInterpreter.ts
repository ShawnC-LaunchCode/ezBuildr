/**
 * Mapping Interpreter
 *
 * Applies custom field mappings from Final Block configuration to transform
 * normalized step values into document-specific field names.
 *
 * This allows workflow variables to be mapped to specific document fields,
 * enabling:
 * - Reuse of templates across different workflows
 * - Flexible variable naming in workflows
 * - Multiple documents with different field requirements
 *
 * @version 1.0.0 - Final Block Extension (Prompt 10)
 * @date December 6, 2025
 */

import type { NormalizedData } from './VariableNormalizer';
import type { FinalBlockConfig } from '../../../shared/types/stepConfigs';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Mapping configuration for a single document
 * (Extracted from FinalBlockConfig)
 */
export type DocumentMapping = FinalBlockConfig['documents'][0]['mapping'];

/**
 * Mapping application result
 */
export interface MappingResult {
  /** Mapped data ready for template rendering */
  data: NormalizedData;

  /** Fields that were successfully mapped */
  mapped: string[];

  /** Fields in mapping that had no source data */
  missing: string[];

  /** Source variables that were not used in mapping */
  unused: string[];

  /** Whether mapping was applied (false if no mapping provided) */
  applied: boolean;
}

/**
 * Mapping validation result
 */
export interface MappingValidation {
  /** Whether mapping is valid */
  valid: boolean;

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Field coverage percentage (0-100) */
  coverage: number;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Apply mapping to normalized data
 *
 * If no mapping is provided, returns original data unchanged.
 * If mapping exists, creates new data object with mapped field names.
 *
 * @param normalizedData - Normalized step values (flat key-value pairs)
 * @param mapping - Optional field mapping configuration
 * @returns Mapping result with data and metadata
 *
 * @example
 * ```typescript
 * const normalizedData = {
 *   "fullName": "John Doe",
 *   "email": "john@example.com",
 *   "total": 1234.56
 * };
 *
 * const mapping = {
 *   "client_name": { type: "variable", source: "fullName" },
 *   "client_email": { type: "variable", source: "email" },
 *   "invoice_total": { type: "variable", source: "total" }
 * };
 *
 * const result = applyMapping(normalizedData, mapping);
 *
 * // Result:
 * {
 *   data: {
 *     "client_name": "John Doe",
 *     "client_email": "john@example.com",
 *     "invoice_total": 1234.56
 *   },
 *   mapped: ["client_name", "client_email", "invoice_total"],
 *   missing: [],
 *   unused: [],
 *   applied: true
 * }
 * ```
 */
export function applyMapping(
  normalizedData: NormalizedData,
  mapping: DocumentMapping | undefined | null
): MappingResult {
  // Guard against invalid inputs
  if (!normalizedData || typeof normalizedData !== 'object') {
    return {
      data: {},
      mapped: [],
      missing: [],
      unused: [],
      applied: false,
    };
  }

  // No mapping provided - pass through original data
  if (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0) {
    return {
      data: normalizedData,
      mapped: [],
      missing: [],
      unused: Object.keys(normalizedData),
      applied: false,
    };
  }

  const mapped: string[] = [];
  const missing: string[] = [];
  const usedSources = new Set<string>();
  const result: NormalizedData = {};

  // Apply each mapping entry
  for (const [targetField, config] of Object.entries(mapping)) {
    if (!config || typeof config !== 'object' || config.type !== 'variable') {
      continue; // Skip invalid mappings
    }

    const sourceValue = normalizedData[config.source];

    if (sourceValue !== undefined && sourceValue !== null) {
      // Successful mapping
      result[targetField] = sourceValue;
      mapped.push(targetField);
      usedSources.add(config.source);
    } else {
      // Source variable not found
      missing.push(targetField);
      result[targetField] = ''; // Use empty string as fallback
    }
  }

  // Identify unused source variables
  const allSources = Object.keys(normalizedData);
  const unused = allSources.filter(source => !usedSources.has(source));

  return {
    data: result,
    mapped,
    missing,
    unused,
    applied: true,
  };
}

/**
 * Apply mapping with fallback to unmapped data
 *
 * This variant includes both:
 * - Mapped fields (with their mapped names)
 * - Unmapped fields (with their original names)
 *
 * Useful when a template may use both mapped and unmapped variables.
 *
 * @param normalizedData - Normalized step values
 * @param mapping - Optional field mapping
 * @returns Combined data with mapped + unmapped fields
 */
export function applyMappingWithFallback(
  normalizedData: NormalizedData,
  mapping: DocumentMapping | undefined | null
): NormalizedData {
  const mappingResult = applyMapping(normalizedData, mapping);

  if (!mappingResult.applied) {
    // No mapping - return original
    return normalizedData;
  }

  // Merge mapped data with unused unmapped data
  const result: NormalizedData = { ...mappingResult.data };

  // Add unmapped variables that weren't used in mapping
  for (const unusedKey of mappingResult.unused) {
    // Only add if not already present (avoid conflicts)
    if (!(unusedKey in result)) {
      result[unusedKey] = normalizedData[unusedKey];
    }
  }

  return result;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate mapping configuration
 *
 * Checks:
 * - Mapping structure is valid
 * - All source variables exist in normalized data
 * - No duplicate target fields
 * - No circular references
 *
 * @param mapping - Mapping configuration to validate
 * @param normalizedData - Available source data
 * @returns Validation result with errors and warnings
 */
export function validateMapping(
  mapping: DocumentMapping | undefined | null,
  normalizedData: NormalizedData
): MappingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Empty mapping is valid (no errors, just warnings)
  if (!mapping || Object.keys(mapping).length === 0) {
    warnings.push('No mapping provided - all variables will use original names');
    return {
      valid: true,
      errors,
      warnings,
      coverage: 0,
    };
  }

  const targetFields = new Set<string>();
  const sourceFields = new Set<string>();
  let validMappings = 0;

  for (const [targetField, config] of Object.entries(mapping)) {
    // Check for duplicate target fields
    if (targetFields.has(targetField)) {
      errors.push(`Duplicate target field: ${targetField}`);
      continue;
    }
    targetFields.add(targetField);

    // Validate config structure
    if (!config || typeof config !== 'object') {
      errors.push(`Invalid mapping config for field: ${targetField}`);
      continue;
    }

    if (config.type !== 'variable') {
      warnings.push(`Unknown mapping type "${config.type}" for field: ${targetField}`);
      continue;
    }

    if (!config.source || typeof config.source !== 'string') {
      errors.push(`Missing or invalid source for field: ${targetField}`);
      continue;
    }

    sourceFields.add(config.source);

    // Check if source exists in normalized data
    if (!(config.source in normalizedData)) {
      warnings.push(`Source variable "${config.source}" not found in step values (target: ${targetField})`);
    } else {
      validMappings++;
    }

    // Check for circular references (target === source)
    if (targetField === config.source) {
      warnings.push(`Circular reference: ${targetField} maps to itself`);
    }
  }

  // Calculate coverage
  const totalMappings = Object.keys(mapping).length;
  const coverage = totalMappings > 0 ? (validMappings / totalMappings) * 100 : 0;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage,
  };
}

/**
 * Check if mapping covers all required template placeholders
 *
 * @param mapping - Mapping configuration
 * @param requiredPlaceholders - Placeholders found in template
 * @returns Missing placeholders that are not covered by mapping
 */
export function checkMappingCoverage(
  mapping: DocumentMapping | undefined | null,
  requiredPlaceholders: string[]
): string[] {
  if (!mapping) {
    // No mapping - placeholders must match variable names exactly
    return requiredPlaceholders;
  }

  const mappedTargets = new Set(Object.keys(mapping));
  const missing: string[] = [];

  for (const placeholder of requiredPlaceholders) {
    if (!mappedTargets.has(placeholder)) {
      missing.push(placeholder);
    }
  }

  return missing;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Infer mapping from placeholder analysis
 *
 * Attempts to automatically match workflow variables to template placeholders
 * based on name similarity.
 *
 * @param normalizedData - Available workflow variables
 * @param templatePlaceholders - Placeholders found in template
 * @returns Suggested mapping configuration
 *
 * @example
 * ```typescript
 * const data = { firstName: "John", emailAddress: "john@example.com" };
 * const placeholders = ["first_name", "email"];
 *
 * inferMapping(data, placeholders);
 * // Suggests:
 * {
 *   "first_name": { type: "variable", source: "firstName" },
 *   "email": { type: "variable", source: "emailAddress" }
 * }
 * ```
 */
export function inferMapping(
  normalizedData: NormalizedData,
  templatePlaceholders: string[]
): DocumentMapping {
  const mapping: DocumentMapping = {};
  const availableVars = Object.keys(normalizedData);

  for (const placeholder of templatePlaceholders) {
    // Try exact match (case-insensitive)
    const exactMatch = availableVars.find(
      v => v.toLowerCase() === placeholder.toLowerCase()
    );

    if (exactMatch) {
      mapping[placeholder] = { type: 'variable', source: exactMatch };
      continue;
    }

    // Try fuzzy match (remove underscores/dashes, normalize case)
    const normalizedPlaceholder = normalizeFieldName(placeholder);
    const fuzzyMatch = availableVars.find(
      v => normalizeFieldName(v) === normalizedPlaceholder
    );

    if (fuzzyMatch) {
      mapping[placeholder] = { type: 'variable', source: fuzzyMatch };
      continue;
    }

    // No match found - leave unmapped (will need manual intervention)
  }

  return mapping;
}

/**
 * Normalize field name for comparison
 * (Remove underscores, dashes, lowercase)
 */
function normalizeFieldName(name: string): string {
  return name
    .replace(/[_-]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Invert mapping (target → source becomes source → target)
 *
 * Useful for reverse lookups or debugging.
 */
export function invertMapping(
  mapping: DocumentMapping | undefined | null
): Record<string, string> {
  if (!mapping) {return {};}

  const inverted: Record<string, string> = {};

  for (const [targetField, config] of Object.entries(mapping)) {
    if (config && config.type === 'variable') {
      inverted[config.source] = targetField;
    }
  }

  return inverted;
}

/**
 * Get mapping statistics
 */
export function getMappingStats(mapping: DocumentMapping | undefined | null): {
  totalMappings: number;
  variableMappings: number;
  uniqueSources: number;
  averageSourceLength: number;
  averageTargetLength: number;
} {
  if (!mapping) {
    return {
      totalMappings: 0,
      variableMappings: 0,
      uniqueSources: 0,
      averageSourceLength: 0,
      averageTargetLength: 0,
    };
  }

  const entries = Object.entries(mapping);
  const variableEntries = entries.filter(([, config]) => config?.type === 'variable');
  const sources = new Set(
    variableEntries
      .map(([, config]) => config.source)
      .filter(Boolean)
  );

  const totalSourceLength = variableEntries.reduce(
    (sum, [, config]) => sum + (config?.source?.length || 0),
    0
  );
  const totalTargetLength = entries.reduce(
    (sum, [target]) => sum + target.length,
    0
  );

  return {
    totalMappings: entries.length,
    variableMappings: variableEntries.length,
    uniqueSources: sources.size,
    averageSourceLength: variableEntries.length > 0
      ? totalSourceLength / variableEntries.length
      : 0,
    averageTargetLength: entries.length > 0
      ? totalTargetLength / entries.length
      : 0,
  };
}

/**
 * Create a mapping from alias-to-alias transformation
 *
 * @param aliasMap - Map of target aliases to source aliases
 * @returns DocumentMapping configuration
 */
export function createMappingFromAliases(
  aliasMap: Record<string, string>
): DocumentMapping {
  const mapping: DocumentMapping = {};

  for (const [target, source] of Object.entries(aliasMap)) {
    mapping[target] = {
      type: 'variable',
      source,
    };
  }

  return mapping;
}

// ============================================================================
// DEBUGGING
// ============================================================================

/**
 * Generate human-readable mapping summary
 */
export function describeMapping(mapping: DocumentMapping | undefined | null): string {
  if (!mapping || Object.keys(mapping).length === 0) {
    return 'No mapping configured (pass-through mode)';
  }

  const lines: string[] = ['Field Mapping:'];

  for (const [targetField, config] of Object.entries(mapping)) {
    if (config && config.type === 'variable') {
      lines.push(`  ${targetField} ← ${config.source}`);
    } else {
      lines.push(`  ${targetField} ← [invalid config]`);
    }
  }

  return lines.join('\n');
}

/**
 * Compare two mappings and identify differences
 */
export function compareMappings(
  mapping1: DocumentMapping | undefined | null,
  mapping2: DocumentMapping | undefined | null
): {
  added: string[];
  removed: string[];
  changed: Array<{ field: string; oldSource: string; newSource: string }>;
  unchanged: string[];
} {
  const keys1 = new Set(Object.keys(mapping1 || {}));
  const keys2 = new Set(Object.keys(mapping2 || {}));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ field: string; oldSource: string; newSource: string }> = [];
  const unchanged: string[] = [];

  // Check for added and changed
  for (const key of keys2) {
    if (!keys1.has(key)) {
      added.push(key);
    } else {
      const source1 = mapping1?.[key]?.source;
      const source2 = mapping2?.[key]?.source;
      if (source1 !== source2) {
        changed.push({
          field: key,
          oldSource: source1 || '',
          newSource: source2 || '',
        });
      } else {
        unchanged.push(key);
      }
    }
  }

  // Check for removed
  for (const key of keys1) {
    if (!keys2.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed, unchanged };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applyMapping,
  applyMappingWithFallback,
  validateMapping,
  checkMappingCoverage,
  inferMapping,
  invertMapping,
  getMappingStats,
  createMappingFromAliases,
  describeMapping,
  compareMappings,
};
