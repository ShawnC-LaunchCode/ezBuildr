/**
 * Validation Engine for Intake Runner 2.0 (Stage 20 PR 6)
 *
 * Centralized validation with field-level validators, page aggregation,
 * and integration with conditional visibility.
 */

import type { Step, Section } from "@shared/schema";
import type { RepeaterConfig, RepeaterValue } from "@shared/types/repeater";
import { repeaterService } from "../services/RepeaterService";

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'email' | 'regex' | 'date';
  value?: any;
  message?: string;
}

export interface FieldValidationConfig {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string; // Regex pattern
  email?: boolean;
  custom?: (value: any) => string | null; // Custom validator
}

export interface ValidationError {
  fieldId: string;
  fieldTitle: string;
  errors: string[];
}

export interface PageValidationResult {
  valid: boolean;
  errors: ValidationError[];
  errorCount: number;
}

/**
 * Validates a single field value
 */
export function validateField(
  value: any,
  config: FieldValidationConfig,
  fieldTitle: string
): string[] {
  const errors: string[] = [];

  // Required validation
  if (config.required && isEmpty(value)) {
    errors.push(`${fieldTitle} is required`);
    return errors; // Stop if required and empty
  }

  // Skip other validations if empty and not required
  if (isEmpty(value)) {
    return errors;
  }

  // String length validations
  if (typeof value === 'string') {
    if (config.minLength !== undefined && value.length < config.minLength) {
      errors.push(`${fieldTitle} must be at least ${config.minLength} characters`);
    }
    if (config.maxLength !== undefined && value.length > config.maxLength) {
      errors.push(`${fieldTitle} must be at most ${config.maxLength} characters`);
    }
  }

  // Numeric range validations
  if (typeof value === 'number' || !isNaN(Number(value))) {
    const numValue = typeof value === 'number' ? value : Number(value);
    if (config.min !== undefined && numValue < config.min) {
      errors.push(`${fieldTitle} must be at least ${config.min}`);
    }
    if (config.max !== undefined && numValue > config.max) {
      errors.push(`${fieldTitle} must be at most ${config.max}`);
    }
  }

  // Email validation
  if (config.email && typeof value === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push(`${fieldTitle} must be a valid email address`);
    }
  }

  // Pattern validation
  if (config.pattern && typeof value === 'string') {
    try {
      const regex = new RegExp(config.pattern);
      if (!regex.test(value)) {
        errors.push(`${fieldTitle} format is invalid`);
      }
    } catch (e) {
      // Invalid regex pattern - skip validation
    }
  }

  // Custom validation
  if (config.custom) {
    const customError = config.custom(value);
    if (customError) {
      errors.push(customError);
    }
  }

  return errors;
}

/**
 * Validates all fields on a page
 */
export function validatePage(
  steps: Step[],
  values: Record<string, any>,
  visibleStepIds: string[] // From IntakeQuestionVisibilityService
): PageValidationResult {
  const errors: ValidationError[] = [];

  for (const step of steps) {
    // Skip hidden steps
    if (!visibleStepIds.includes(step.id)) {
      continue;
    }

    // Skip virtual steps
    if (step.isVirtual) {
      continue;
    }

    const value = values[step.id];
    const fieldErrors: string[] = [];

    // Handle repeater fields specially
    if (step.type === 'repeater' && step.repeaterConfig) {
      const repeaterConfig = step.repeaterConfig as unknown as RepeaterConfig;
      const repeaterValue = value as RepeaterValue | null;
      const validationResult = repeaterService.validateRepeater(repeaterValue, repeaterConfig);

      if (!validationResult.valid) {
        // Add global errors
        fieldErrors.push(...validationResult.globalErrors);

        // Add instance errors
        validationResult.instanceErrors.forEach((instanceErrors, instanceId) => {
          fieldErrors.push(...instanceErrors.map(e => `Instance: ${e}`));
        });
      }
    } else {
      // Standard field validation
      const config: FieldValidationConfig = {
        required: step.required,
        // TODO: Extract from step.config if stored there
      };

      const stepErrors = validateField(value, config, step.title);
      fieldErrors.push(...stepErrors);
    }

    if (fieldErrors.length > 0) {
      errors.push({
        fieldId: step.id,
        fieldTitle: step.title,
        errors: fieldErrors,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    errorCount: errors.reduce((sum, e) => sum + e.errors.length, 0),
  };
}

/**
 * Checks if a value is empty
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }

  return false;
}

/**
 * Formats validation errors for display
 */
export function formatValidationErrors(result: PageValidationResult): string[] {
  const messages: string[] = [];

  for (const error of result.errors) {
    for (const msg of error.errors) {
      messages.push(msg);
    }
  }

  return messages;
}

/**
 * Gets first error for a field (for inline display)
 */
export function getFieldError(
  result: PageValidationResult,
  fieldId: string
): string | null {
  const error = result.errors.find(e => e.fieldId === fieldId);
  return error && error.errors.length > 0 ? error.errors[0] : null;
}
