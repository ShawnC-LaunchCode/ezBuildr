/**
 * Step Configuration Utilities
 *
 * Backend utilities for handling step configurations, including:
 * - Config validation
 * - Config normalization
 * - Value sanitization
 * - Type-specific helpers
 *
 * @version 2.0.0 - Block System Overhaul
 * @date December 2025
 */

import { validateStepConfig } from '@shared/validation/stepConfigSchemas';
import type {
  AddressValue,
  MultiFieldValue,
  ChoiceValue,
  FileUploadValue,
} from '@shared/types/stepConfigs';

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

/**
 * Validate and normalize a step config
 *
 * @param stepType - The step type
 * @param config - Raw configuration object
 * @param options - Validation options
 * @returns Validated and normalized config
 * @throws Error if validation fails
 */
export function validateAndNormalizeConfig(
  stepType: string,
  config: any,
  options: {
    strict?: boolean;        // Throw on validation errors (default: true)
    normalize?: boolean;     // Apply normalization (default: true)
  } = {}
): any {
  const { strict = true, normalize = true } = options;

  // Validate config
  const result = validateStepConfig(stepType, config);

  if (!result.success) {
    if (strict) {
      const errorMessages = result.error!.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid config for step type '${stepType}': ${errorMessages}`);
    } else {
      // In non-strict mode, return original config
      return config;
    }
  }

  // Apply normalization if requested
  if (normalize) {
    return normalizeConfig(stepType, result.data);
  }

  return result.data;
}

/**
 * Normalize config values (apply defaults, cleanup)
 *
 * @param stepType - The step type
 * @param config - Validated configuration
 * @returns Normalized config
 */
function normalizeConfig(stepType: string, config: any): any {
  if (!config) return config;

  // Type-specific normalization
  switch (stepType) {
    case 'choice':
      // Ensure all options have aliases
      if (config.options) {
        config.options = config.options.map((opt: any) => ({
          ...opt,
          alias: opt.alias || opt.id,
        }));
      }
      break;

    case 'multi_field':
      // Ensure fields have default values
      if (config.fields) {
        config.fields = config.fields.map((field: any) => ({
          required: false,
          ...field,
        }));
      }
      break;

    case 'address':
    case 'address_advanced':
      // Ensure required fields are marked
      if (config.requireAll === undefined) {
        config.requireAll = true;
      }
      break;

    case 'scale':
    case 'scale_advanced':
      // Set default step if not provided
      if (!config.step) {
        config.step = 1;
      }
      if (config.showValue === undefined) {
        config.showValue = true;
      }
      break;

    case 'boolean':
      // Ensure storeAsBoolean has aliases if false
      if (!config.storeAsBoolean && (!config.trueAlias || !config.falseAlias)) {
        config.trueAlias = config.trueAlias || 'true';
        config.falseAlias = config.falseAlias || 'false';
      }
      break;
  }

  return config;
}

// ============================================================================
// VALUE SANITIZATION
// ============================================================================

/**
 * Sanitize a step value based on its type and config
 *
 * @param stepType - The step type
 * @param value - Raw value from user input
 * @param config - Step configuration
 * @returns Sanitized value ready for storage
 */
export function sanitizeStepValue(
  stepType: string,
  value: any,
  config?: any
): any {
  if (value === null || value === undefined) {
    return value;
  }

  switch (stepType) {
    case 'email':
    case 'email_advanced':
      return sanitizeEmailValue(value, config);

    case 'phone':
    case 'phone_advanced':
      return sanitizePhoneValue(value, config);

    case 'website':
    case 'website_advanced':
      return sanitizeWebsiteValue(value, config);

    case 'number':
    case 'number_advanced':
    case 'currency':
      return sanitizeNumberValue(value, config);

    case 'address':
    case 'address_advanced':
      return sanitizeAddressValue(value, config);

    case 'multi_field':
      return sanitizeMultiFieldValue(value, config);

    case 'choice':
    case 'multiple_choice':
    case 'radio':
      return sanitizeChoiceValue(value, config);

    case 'date':
    case 'time':
    case 'datetime':
    case 'datetime_unified':
    case 'date_time':
      return sanitizeDateTimeValue(value, config);

    case 'scale':
    case 'scale_advanced':
      return sanitizeScaleValue(value, config);

    default:
      // For unknown types, return as-is
      return value;
  }
}

/**
 * Sanitize email value
 */
function sanitizeEmailValue(value: any, config?: any): string | string[] {
  if (typeof value === 'string') {
    const email = value.trim().toLowerCase();
    if (config?.allowMultiple && email.includes(',')) {
      return email.split(',').map(e => e.trim()).filter(Boolean);
    }
    return email;
  }
  if (Array.isArray(value)) {
    return value.map(e => String(e).trim().toLowerCase()).filter(Boolean);
  }
  return value;
}

/**
 * Sanitize phone value
 */
function sanitizePhoneValue(value: any, config?: any): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Remove all non-digit characters except +
  return value.replace(/[^\d+]/g, '');
}

/**
 * Sanitize website value
 */
function sanitizeWebsiteValue(value: any, config?: any): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  let url = value.trim();

  // Add protocol if required and missing
  if (config?.requireProtocol && !url.match(/^[a-z]+:\/\//i)) {
    url = 'https://' + url;
  }

  return url;
}

/**
 * Sanitize number value
 */
function sanitizeNumberValue(value: any, config?: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));

  if (isNaN(num)) {
    return null;
  }

  // Apply precision if specified
  if (config?.validation?.precision !== undefined) {
    return parseFloat(num.toFixed(config.validation.precision));
  }

  // For currency modes with no decimal
  if (config?.mode === 'currency_whole' || (config?.allowDecimal === false)) {
    return Math.round(num);
  }

  return num;
}

/**
 * Sanitize address value
 */
function sanitizeAddressValue(value: any, config?: any): AddressValue {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const address: AddressValue = {};

  // Ensure all expected fields are present
  const fields = config?.fields || ['street', 'city', 'state', 'zip'];

  for (const field of fields) {
    const fieldKey = typeof field === 'string' ? field : field.key;
    if (value[fieldKey]) {
      (address as any)[fieldKey] = String(value[fieldKey]).trim();
    }
  }

  return address;
}

/**
 * Sanitize multi-field value
 */
function sanitizeMultiFieldValue(value: any, config?: any): MultiFieldValue {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: MultiFieldValue = {};
  const fields = config?.fields || [];

  for (const field of fields) {
    const key = field.key;
    if (value[key] !== undefined) {
      // Type-specific sanitization
      switch (field.type) {
        case 'email':
          result[key] = sanitizeEmailValue(value[key], {});
          break;
        case 'phone':
          result[key] = sanitizePhoneValue(value[key], {});
          break;
        case 'number':
          result[key] = sanitizeNumberValue(value[key], {});
          break;
        default:
          result[key] = value[key];
      }
    }
  }

  return result;
}

/**
 * Sanitize choice value
 */
function sanitizeChoiceValue(value: any, config?: any): ChoiceValue {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return config?.allowMultiple ? [] : '';
  }
  return String(value);
}

/**
 * Sanitize date/time value
 */
function sanitizeDateTimeValue(value: any, config?: any): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    // Validate ISO format
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}

/**
 * Sanitize scale value
 */
function sanitizeScaleValue(value: any, config?: any): number | null {
  const num = sanitizeNumberValue(value, {});

  if (num === null) {
    return null;
  }

  // Clamp to min/max
  if (config?.min !== undefined && num < config.min) {
    return config.min;
  }
  if (config?.max !== undefined && num > config.max) {
    return config.max;
  }

  // Round to nearest step
  if (config?.step) {
    const steps = Math.round((num - (config.min || 0)) / config.step);
    return (config.min || 0) + (steps * config.step);
  }

  return num;
}

// ============================================================================
// VALUE VALIDATION
// ============================================================================

/**
 * Validate a step value against its type and config
 *
 * @param stepType - The step type
 * @param value - Value to validate
 * @param config - Step configuration
 * @param required - Whether the field is required
 * @returns Validation result
 */
export function validateStepValue(
  stepType: string,
  value: any,
  config?: any,
  required?: boolean
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required
  if (required && (value === null || value === undefined || value === '')) {
    errors.push('This field is required');
    return { valid: false, errors };
  }

  // Skip validation if empty and not required
  if (!required && (value === null || value === undefined || value === '')) {
    return { valid: true, errors: [] };
  }

  // Type-specific validation
  switch (stepType) {
    case 'email':
    case 'email_advanced':
      validateEmail(value, config, errors);
      break;

    case 'phone':
    case 'phone_advanced':
      validatePhone(value, config, errors);
      break;

    case 'website':
    case 'website_advanced':
      validateWebsite(value, config, errors);
      break;

    case 'number':
    case 'number_advanced':
    case 'currency':
      validateNumber(value, config, errors);
      break;

    case 'scale':
    case 'scale_advanced':
      validateScale(value, config, errors);
      break;

    case 'choice':
    case 'multiple_choice':
      validateChoice(value, config, errors);
      break;

    case 'address':
    case 'address_advanced':
      validateAddress(value, config, errors);
      break;

    case 'multi_field':
      validateMultiField(value, config, errors);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateEmail(value: any, config: any, errors: string[]): void {
  const emails = Array.isArray(value) ? value : [value];

  for (const email of emails) {
    if (typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      errors.push(`Invalid email address: ${email}`);
    }

    // Check domain restrictions
    if (config?.restrictDomains?.length > 0) {
      const domain = email.split('@')[1];
      if (!config.restrictDomains.includes(domain)) {
        errors.push(`Email domain not allowed: ${domain}`);
      }
    }

    if (config?.blockDomains?.length > 0) {
      const domain = email.split('@')[1];
      if (config.blockDomains.includes(domain)) {
        errors.push(`Email domain blocked: ${domain}`);
      }
    }
  }

  if (config?.maxEmails && emails.length > config.maxEmails) {
    errors.push(`Maximum ${config.maxEmails} emails allowed`);
  }
}

function validatePhone(value: any, config: any, errors: string[]): void {
  if (typeof value !== 'string') {
    errors.push('Phone number must be a string');
    return;
  }

  // Basic phone validation (10+ digits)
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) {
    errors.push('Phone number must be at least 10 digits');
  }
}

function validateWebsite(value: any, config: any, errors: string[]): void {
  if (typeof value !== 'string') {
    errors.push('Website must be a string');
    return;
  }

  try {
    const url = new URL(value.startsWith('http') ? value : 'https://' + value);

    if (config?.requireProtocol && !value.match(/^[a-z]+:\/\//i)) {
      errors.push('URL must include protocol (http:// or https://)');
    }

    if (config?.allowedProtocols?.length > 0) {
      if (!config.allowedProtocols.includes(url.protocol.replace(':', ''))) {
        errors.push(`Protocol not allowed: ${url.protocol}`);
      }
    }

    if (config?.restrictDomains?.length > 0) {
      if (!config.restrictDomains.includes(url.hostname)) {
        errors.push(`Domain not allowed: ${url.hostname}`);
      }
    }

    if (config?.blockDomains?.length > 0) {
      if (config.blockDomains.includes(url.hostname)) {
        errors.push(`Domain blocked: ${url.hostname}`);
      }
    }
  } catch (e) {
    errors.push('Invalid URL format');
  }
}

function validateNumber(value: any, config: any, errors: string[]): void {
  const num = typeof value === 'number' ? value : parseFloat(value);

  if (isNaN(num)) {
    errors.push('Invalid number');
    return;
  }

  const validation = config?.validation || config;

  if (validation?.min !== undefined && num < validation.min) {
    errors.push(`Value must be at least ${validation.min}`);
  }

  if (validation?.max !== undefined && num > validation.max) {
    errors.push(`Value must be at most ${validation.max}`);
  }
}

function validateScale(value: any, config: any, errors: string[]): void {
  validateNumber(value, config, errors);
}

function validateChoice(value: any, config: any, errors: string[]): void {
  const values = Array.isArray(value) ? value : [value];
  const validOptions = config?.options?.map((opt: any) => opt.id || opt.alias) || [];

  for (const val of values) {
    if (!validOptions.includes(val)) {
      errors.push(`Invalid option: ${val}`);
    }
  }

  if (config?.min && values.length < config.min) {
    errors.push(`Select at least ${config.min} option(s)`);
  }

  if (config?.max && values.length > config.max) {
    errors.push(`Select at most ${config.max} option(s)`);
  }
}

function validateAddress(value: any, config: any, errors: string[]): void {
  if (!value || typeof value !== 'object') {
    errors.push('Address must be an object');
    return;
  }

  const requiredFields = config?.requireAll
    ? (config.fields || ['street', 'city', 'state', 'zip'])
    : [];

  for (const field of requiredFields) {
    const fieldKey = typeof field === 'string' ? field : field.key;
    if (!value[fieldKey] || String(value[fieldKey]).trim() === '') {
      const fieldLabel = typeof field === 'object' ? field.label : fieldKey;
      errors.push(`${fieldLabel} is required`);
    }
  }
}

function validateMultiField(value: any, config: any, errors: string[]): void {
  if (!value || typeof value !== 'object') {
    errors.push('Multi-field value must be an object');
    return;
  }

  for (const field of config?.fields || []) {
    if (field.required && (!value[field.key] || value[field.key] === '')) {
      errors.push(`${field.label} is required`);
    }

    // Type-specific validation for each field
    if (value[field.key]) {
      switch (field.type) {
        case 'email':
          validateEmail(value[field.key], {}, errors);
          break;
        case 'phone':
          validatePhone(value[field.key], {}, errors);
          break;
        case 'number':
          validateNumber(value[field.key], field.validation || {}, errors);
          break;
      }
    }
  }
}

// ============================================================================
// TYPE CHECKING HELPERS
// ============================================================================

/**
 * Check if a step type requires complex value storage
 */
export function isComplexValueType(stepType: string): boolean {
  return [
    'address',
    'address_advanced',
    'multi_field',
    'file_upload',
  ].includes(stepType);
}

/**
 * Check if a step type supports multiple values
 */
export function isMultiValueType(stepType: string): boolean {
  return [
    'multiple_choice',
    'choice', // when allowMultiple=true
    'file_upload', // when maxFiles>1
  ].includes(stepType);
}

/**
 * Get the default value for a step type
 */
export function getDefaultValue(stepType: string, config?: any): any {
  switch (stepType) {
    case 'choice':
    case 'multiple_choice':
      return config?.allowMultiple ? [] : '';

    case 'boolean':
    case 'yes_no':
    case 'true_false':
      return config?.defaultValue ?? false;

    case 'number':
    case 'number_advanced':
    case 'currency':
    case 'scale':
    case 'scale_advanced':
      return config?.min ?? 0;

    case 'address':
    case 'address_advanced':
      return {};

    case 'multi_field':
      return {};

    case 'file_upload':
      return config?.maxFiles > 1 ? [] : null;

    default:
      return '';
  }
}
