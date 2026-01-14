/**
 * Mapping Validator
 *
 * Validates field mappings before document generation to catch errors early.
 * Provides detailed validation reports with warnings and suggestions.
 *
 * Features:
 * - Structural validation (syntax, types, duplicates)
 * - Coverage analysis (unmapped fields, unused sources)
 * - Type compatibility checking
 * - Dry-run generation with test data
 * - Detailed error and warning reporting
 *
 * Usage:
 * ```typescript
 * const validator = new MappingValidator();
 * const report = await validator.validateWithTestData(
 *   templateId,
 *   mapping,
 *   testStepValues
 * );
 *
 * if (!report.valid) {
 *   console.error('Mapping errors:', report.errors);
 * }
 * ```
 */

import { eq } from 'drizzle-orm';

import { templates } from '../../../shared/schema';
import { db } from '../../db';
import { logger } from '../../logger';
import { createError } from '../../utils/errors';

import { applyMapping } from './MappingInterpreter';
import { normalizeVariables } from './VariableNormalizer';

import type { DocumentMapping } from './MappingInterpreter';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationError {
  type: string;
  message: string;
  field?: string;
  details?: any;
  suggestion?: string;
}

export interface ValidationWarning {
  type: string;
  message: string;
  field?: string;
  suggestion?: string;
  details?: any;
}

export interface CoverageStats {
  totalTemplateFields: number;
  mappedFields: number;
  unmappedFields: string[];
  unusedSources: string[];
  coveragePercentage: number;
}

export interface TypeMismatch {
  field: string;
  expectedType: string;
  receivedType: string;
  value: any;
  suggestion?: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  coverage: CoverageStats;
  typeMismatches: TypeMismatch[];
  dryRunSuccess: boolean;
  dryRunOutput?: any;
}

// ============================================================================
// MAPPING VALIDATOR CLASS
// ============================================================================

export class MappingValidator {
  /**
   * Validate mapping with test data
   *
   * Performs comprehensive validation:
   * 1. Structural validation (syntax, duplicates, circular refs)
   * 2. Coverage analysis (all fields mapped?)
   * 3. Source variable existence check
   * 4. Type compatibility check
   * 5. Dry-run generation test
   */
  async validateWithTestData(
    templateId: string,
    mapping: DocumentMapping,
    testStepValues: Record<string, any>
  ): Promise<ValidationReport> {
    logger.info({ templateId }, 'Validating mapping with test data');

    const report: ValidationReport = {
      valid: true,
      errors: [],
      warnings: [],
      coverage: {
        totalTemplateFields: 0,
        mappedFields: 0,
        unmappedFields: [],
        unusedSources: [],
        coveragePercentage: 0,
      },
      typeMismatches: [],
      dryRunSuccess: false,
    };

    try {
      // Step 1: Load template
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, templateId))
        .limit(1);

      if (!template) {
        report.errors.push({
          type: 'template_not_found',
          message: `Template ${templateId} not found`,
        });
        report.valid = false;
        return report;
      }

      // Step 2: Structural validation
      const structuralErrors = this.validateStructure(mapping);
      report.errors.push(...structuralErrors);

      if (structuralErrors.length > 0) {
        report.valid = false;
        return report;
      }

      // Step 3: Coverage analysis
      report.coverage = this.analyzeCoverage(template, mapping);

      // Warn about unmapped fields
      if (report.coverage.unmappedFields.length > 0) {
        report.warnings.push({
          type: 'incomplete_coverage',
          message: `${report.coverage.unmappedFields.length} template field(s) are not mapped`,
          details: { fields: report.coverage.unmappedFields },
          suggestion: 'Map all template fields to ensure complete document generation',
        });
      }

      // Step 4: Source variable existence check
      const sourceErrors = this.validateSourceVariables(mapping, testStepValues);
      report.warnings.push(...sourceErrors);

      // Step 5: Dry-run generation
      try {
        const normalized = normalizeVariables(testStepValues);
        const mappingResult = applyMapping(normalized, mapping);

        report.dryRunSuccess = true;
        report.dryRunOutput = mappingResult.data;

        // Step 6: Type compatibility check
        if (template.metadata && (template.metadata as any).fields) {
          const typeMismatches = this.checkTypeCompatibility(
            (template.metadata as any).fields,
            mappingResult.data
          );
          report.typeMismatches = typeMismatches;

          if (typeMismatches.length > 0) {
            report.warnings.push({
              type: 'type_mismatches',
              message: `${typeMismatches.length} field(s) have type mismatches`,
              details: { mismatches: typeMismatches },
              suggestion: 'Review field types to ensure correct data formatting',
            });
          }
        }

        // Warn about unused sources
        if (report.coverage.unusedSources.length > 0) {
          report.warnings.push({
            type: 'unused_sources',
            message: `${report.coverage.unusedSources.length} workflow variable(s) are not used in mapping`,
            details: { sources: report.coverage.unusedSources },
            suggestion: 'Remove unused variables from test data or add mappings',
          });
        }
      } catch (error: any) {
        report.errors.push({
          type: 'dry_run_failed',
          message: `Mapping application failed: ${error.message}`,
          details: { error: error.message },
        });
        report.valid = false;
        report.dryRunSuccess = false;
      }

      // Final validation status
      report.valid = report.errors.length === 0;

      logger.info(
        {
          templateId,
          valid: report.valid,
          errorCount: report.errors.length,
          warningCount: report.warnings.length,
          coverage: report.coverage.coveragePercentage,
        },
        'Mapping validation completed'
      );

      return report;
    } catch (error: any) {
      logger.error({ error, templateId }, 'Mapping validation failed');
      report.errors.push({
        type: 'validation_error',
        message: error.message || 'Unknown validation error',
      });
      report.valid = false;
      return report;
    }
  }

  /**
   * Validate mapping structure
   *
   * Checks for:
   * - Valid JSON structure
   * - Duplicate target fields
   * - Circular references
   * - Invalid mapping types
   */
  private validateStructure(mapping: DocumentMapping): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!mapping || typeof mapping !== 'object') {
      errors.push({
        type: 'invalid_structure',
        message: 'Mapping must be an object',
      });
      return errors;
    }

    const targetFields = Object.keys(mapping);

    // Check for duplicate target fields (shouldn't happen in object, but check anyway)
    const duplicates = targetFields.filter(
      (field, index) => targetFields.indexOf(field) !== index
    );
    if (duplicates.length > 0) {
      errors.push({
        type: 'duplicate_targets',
        message: `Duplicate target fields found: ${duplicates.join(', ')}`,
        details: { duplicates },
      });
    }

    // Validate each mapping entry
    for (const [target, config] of Object.entries(mapping || {})) {
      if (!config || typeof config !== 'object') {
        errors.push({
          type: 'invalid_mapping_entry',
          message: `Invalid mapping configuration for field "${target}"`,
          field: target,
        });
        continue;
      }

      // Check for required properties
      if (!config.type) {
        errors.push({
          type: 'missing_type',
          message: `Mapping type missing for field "${target}"`,
          field: target,
        });
      }

      if (!config.source) {
        errors.push({
          type: 'missing_source',
          message: `Source variable missing for field "${target}"`,
          field: target,
        });
      }

      // Check for circular references (target === source)
      if (config.source === target) {
        errors.push({
          type: 'circular_reference',
          message: `Circular reference detected: "${target}" maps to itself`,
          field: target,
          suggestion: 'Change the source variable to a different field',
        });
      }

      // Validate mapping type
      const validTypes = ['variable', 'constant', 'expression'];
      if (config.type && !validTypes.includes(config.type)) {
        errors.push({
          type: 'invalid_type',
          message: `Invalid mapping type "${config.type}" for field "${target}"`,
          field: target,
          details: { validTypes },
          suggestion: `Use one of: ${validTypes.join(', ')}`,
        });
      }
    }

    return errors;
  }

  /**
   * Analyze coverage (which fields are mapped vs unmapped)
   */
  private analyzeCoverage(
    template: any,
    mapping: DocumentMapping
  ): CoverageStats {
    const templateFields =
      template.metadata?.fields?.map((f: any) => f.name) || [];
    const mappedFields = Object.keys(mapping || {});

    const unmappedFields = templateFields.filter(
      (field: string) => !mappedFields.includes(field)
    );

    const totalFields = templateFields.length;
    const coverage =
      totalFields > 0
        ? (mappedFields.length / totalFields) * 100
        : 0;

    return {
      totalTemplateFields: totalFields,
      mappedFields: mappedFields.length,
      unmappedFields,
      unusedSources: [], // Will be populated after dry run
      coveragePercentage: Math.round(coverage * 100) / 100,
    };
  }

  /**
   * Check if source variables exist in test data
   */
  private validateSourceVariables(
    mapping: DocumentMapping,
    testStepValues: Record<string, any>
  ): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const normalized = normalizeVariables(testStepValues);

    for (const [target, config] of Object.entries(mapping || {})) {
      if (config.type === 'variable' && config.source) {
        if (!(config.source in normalized)) {
          warnings.push({
            type: 'missing_source_variable',
            message: `Source variable "${config.source}" not found in test data`,
            field: target,
            suggestion: `Add "${config.source}" to test data or change the mapping`,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check type compatibility between template fields and mapped values
   */
  private checkTypeCompatibility(
    templateFields: any[],
    mappedData: Record<string, any>
  ): TypeMismatch[] {
    const mismatches: TypeMismatch[] = [];

    for (const field of templateFields) {
      const value = mappedData[field.name];

      if (value === undefined || value === null) {
        continue; // Skip missing values
      }

      const expectedType = field.type || 'unknown';
      const receivedType = this.getValueType(value);

      if (!this.isCompatibleType(expectedType, receivedType, value)) {
        mismatches.push({
          field: field.name,
          expectedType,
          receivedType,
          value,
          suggestion: this.getSuggestion(expectedType, receivedType, value),
        });
      }
    }

    return mismatches;
  }

  /**
   * Get the type of a value
   */
  private getValueType(value: any): string {
    if (value === null) {return 'null';}
    if (Array.isArray(value)) {return 'array';}
    if (value instanceof Date) {return 'date';}
    return typeof value;
  }

  /**
   * Check if types are compatible
   */
  private isCompatibleType(
    expectedType: string,
    receivedType: string,
    value: any
  ): boolean {
    // Exact match
    if (expectedType === receivedType) {return true;}

    // Compatible conversions
    const compatibilityMap: Record<string, string[]> = {
      text: ['string', 'number', 'boolean', 'date'],
      checkbox: ['boolean', 'string', 'number'],
      dropdown: ['string', 'number'],
      radio: ['string', 'number'],
      unknown: ['string', 'number', 'boolean', 'date', 'array', 'object'],
    };

    const compatibleTypes = compatibilityMap[expectedType] || [];
    return compatibleTypes.includes(receivedType);
  }

  /**
   * Get suggestion for type mismatch
   */
  private getSuggestion(
    expectedType: string,
    receivedType: string,
    value: any
  ): string {
    if (expectedType === 'checkbox' && receivedType === 'string') {
      return 'Convert string to boolean ("true"/"false")';
    }

    if (expectedType === 'text' && receivedType === 'date') {
      return 'Format date as string (e.g., YYYY-MM-DD)';
    }

    if (expectedType === 'text' && receivedType === 'array') {
      return 'Join array elements into a string';
    }

    if (expectedType === 'dropdown' && receivedType === 'number') {
      return 'Convert number to string';
    }

    return `Convert ${receivedType} to ${expectedType}`;
  }

  /**
   * Quick validation (structure only, no test data)
   */
  async validateStructureOnly(
    templateId: string,
    mapping: DocumentMapping
  ): Promise<Pick<ValidationReport, 'valid' | 'errors' | 'warnings'>> {
    const errors = this.validateStructure(mapping);

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }
}

// Singleton instance
export const mappingValidator = new MappingValidator();
