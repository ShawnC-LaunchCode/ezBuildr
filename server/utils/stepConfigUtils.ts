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

import type {
  AddressValue,
  MultiFieldValue,
  ChoiceValue,
  StepConfig,
  ChoiceOption,
  ChoiceAdvancedConfig,
  MultiFieldConfig,
  AddressConfig,
  AddressAdvancedConfig,
  ScaleConfig,
  ScaleAdvancedConfig,
  BooleanAdvancedConfig,
  EmailConfig,
  EmailAdvancedConfig,
  PhoneConfig,
  PhoneAdvancedConfig,
  WebsiteConfig,
  WebsiteAdvancedConfig,
  NumberConfig,
  NumberAdvancedConfig,
  NumberValidation,
  CurrencyConfig,
  LegacyMultipleChoiceConfig,
  LegacyYesNoConfig,
  FileUploadConfig,
} from '@shared/types/stepConfigs';
import { validateStepConfig } from '@shared/validation/stepConfigSchemas';

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
  config: StepConfig,
  options: {
    strict?: boolean;        // Throw on validation errors (default: true)
    normalize?: boolean;     // Apply normalization (default: true)
  } = {}
): StepConfig {
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
function normalizeConfig(stepType: string, config: StepConfig): StepConfig {
  if (!config) { return config; }

  // Type-specific normalization
  switch (stepType) {
    case 'choice': {
      const choiceConfig = config as ChoiceAdvancedConfig;
      // Ensure all options have aliases
      if (Array.isArray(choiceConfig.options)) {
        choiceConfig.options = choiceConfig.options.map((opt) => ({
          ...opt,
          alias: opt.alias || opt.id,
        })).filter(Boolean); // Ensure no nulls if filter is needed, though map preserves length
      }
      break;
    }

    case 'multi_field': {
      const mfConfig = config as MultiFieldConfig;
      // Ensure fields have default values
      if (mfConfig.fields) {
        mfConfig.fields = mfConfig.fields.map((field) => ({
          ...field,
          required: field.required ?? false,
        }));
      }
      break;
    }

    case 'address':
    case 'address_advanced': {
      const addrConfig = config as AddressConfig;
      // Ensure required fields are marked
      if (addrConfig.requireAll === undefined) {
        addrConfig.requireAll = true;
      }
      break;
    }

    case 'scale':
    case 'scale_advanced': {
      const scaleConfig = config as ScaleConfig;
      // Set default step if not provided
      if (!scaleConfig.step) {
        scaleConfig.step = 1;
      }
      if (scaleConfig.showValue === undefined) {
        scaleConfig.showValue = true;
      }
      break;
    }

    case 'boolean': {
      const boolConfig = config as BooleanAdvancedConfig;
      // Ensure storeAsBoolean has aliases if false
      if (!boolConfig.storeAsBoolean && (!boolConfig.trueAlias || !boolConfig.falseAlias)) {
        boolConfig.trueAlias = boolConfig.trueAlias || 'true';
        boolConfig.falseAlias = boolConfig.falseAlias || 'false';
      }
      break;
    }
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
  value: unknown,
  config?: StepConfig
): unknown {
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
/**
 * Sanitize email value
 */
function sanitizeEmailValue(value: unknown, config?: StepConfig): string | string[] {
  const emailConfig = config as (EmailConfig | EmailAdvancedConfig) | undefined;
  if (typeof value === 'string') {
    const email = value.trim().toLowerCase();
    if (emailConfig?.allowMultiple && email.includes(',')) {
      return email.split(',').map(e => e.trim()).filter(Boolean);
    }
    return email;
  }
  if (Array.isArray(value)) {
    return value.map(e => String(e).trim().toLowerCase()).filter(Boolean);
  }
  return value as string | string[];
}

/**
 * Sanitize phone value
 */
function sanitizePhoneValue(value: unknown, _config?: StepConfig): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Remove all non-digit characters except +
  return value.replace(/[^\d+]/g, '');
}

/**
 * Sanitize website value
 */
function sanitizeWebsiteValue(value: unknown, config?: StepConfig): string {
  const webConfig = config as (WebsiteConfig | WebsiteAdvancedConfig) | undefined;
  if (typeof value !== 'string') {
    return String(value);
  }

  let url = value.trim();

  // Add protocol if required and missing
  if (webConfig?.requireProtocol && !url.match(/^[a-z]+:\/\//i)) {
    url = `https://${url}`;
  }

  return url;
}

/**
 * Sanitize number value
 */
function sanitizeNumberValue(value: unknown, config?: StepConfig): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));

  if (isNaN(num)) {
    return null;
  }

  const numConfig = config as (NumberConfig | NumberAdvancedConfig | CurrencyConfig) | undefined;

  // Apply precision if specified
  const precision = (numConfig as NumberValidation)?.precision ?? (numConfig as NumberAdvancedConfig)?.validation?.precision;
  if (precision !== undefined) {
    return parseFloat(num.toFixed(precision));
  }

  // For currency modes with no decimal
  // Safe cast for checking mode/allowDecimal presence
  const currencyConfig = numConfig as CurrencyConfig & NumberAdvancedConfig & NumberConfig;
  if (currencyConfig?.mode === 'currency_whole' || (currencyConfig?.allowDecimal === false)) {
    return Math.round(num);
  }

  return num;
}

/**
 * Sanitize address value
 */
function sanitizeAddressValue(value: unknown, config?: StepConfig): AddressValue {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const address: AddressValue = {};
  const addrConfig = config as (AddressConfig | AddressAdvancedConfig) | undefined;

  // Ensure all expected fields are present
  const fields = addrConfig?.fields || ['street', 'city', 'state', 'zip'];

  for (const field of fields) {
    const fieldKey = typeof field === 'string' ? field : field.key;
    const valObj = value as Record<string, unknown>;
    if (valObj[fieldKey]) {
      (address as Record<string, string>)[fieldKey] = String(valObj[fieldKey]).trim();
    }
  }

  return address;
}

/**
 * Sanitize multi-field value
 */
function sanitizeMultiFieldValue(value: unknown, config?: StepConfig): MultiFieldValue {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: MultiFieldValue = {};
  const mfConfig = config as MultiFieldConfig | undefined;
  const fields = mfConfig?.fields || [];

  for (const field of fields) {
    const key = field.key;
    const valObj = value as Record<string, unknown>;
    if (valObj[key] !== undefined) {
      // Type-specific sanitization
      switch (field.type) {
        case 'email':
          result[key] = sanitizeEmailValue(valObj[key], {}); // Recursion safe
          break;
        case 'phone':
          result[key] = sanitizePhoneValue(valObj[key], {});
          break;
        case 'number':
          result[key] = sanitizeNumberValue(valObj[key], {});
          break;
        default:
          result[key] = valObj[key] as string | number | boolean | null | string[];
      }
    }
  }

  return result;
}

/**
 * Sanitize choice value
 */
/**
 * Sanitize choice value
 */
function sanitizeChoiceValue(value: unknown, config?: StepConfig): ChoiceValue {
  if (Array.isArray(value)) {
    return (value as unknown[]).filter(Boolean).map(String);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    const choiceConfig = config as (ChoiceAdvancedConfig | LegacyMultipleChoiceConfig) | undefined;
    return choiceConfig?.allowMultiple ? [] : '';
  }
  return String(value);
}

/**
 * Sanitize date/time value
 */
function sanitizeDateTimeValue(value: unknown, _config?: StepConfig): string | null {
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
function sanitizeScaleValue(value: unknown, config?: StepConfig): number | null {
  const num = sanitizeNumberValue(value, {});

  if (num === null) {
    return null;
  }

  const scaleConfig = config as (ScaleConfig | ScaleAdvancedConfig) | undefined;

  // Clamp to min/max
  if (scaleConfig?.min !== undefined && num < scaleConfig.min) {
    return scaleConfig.min;
  }
  if (scaleConfig?.max !== undefined && num > scaleConfig.max) {
    return scaleConfig.max;
  }

  // Round to nearest step
  if (scaleConfig?.step) {
    const steps = Math.round((num - (scaleConfig.min || 0)) / scaleConfig.step);
    return (scaleConfig.min || 0) + (steps * scaleConfig.step);
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
  value: unknown,
  config?: StepConfig,
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
      validateEmail(value, config as EmailConfig | EmailAdvancedConfig, errors);
      break;

    case 'phone':
    case 'phone_advanced':
      validatePhone(value, config as PhoneConfig | PhoneAdvancedConfig, errors);
      break;

    case 'website':
    case 'website_advanced':
      validateWebsite(value, config as WebsiteConfig | WebsiteAdvancedConfig, errors);
      break;

    case 'number':
    case 'number_advanced':
    case 'currency':
      validateNumber(value, config as NumberConfig | NumberAdvancedConfig | CurrencyConfig, errors);
      break;

    case 'scale':
    case 'scale_advanced':
      validateScale(value, config as ScaleConfig | ScaleAdvancedConfig, errors);
      break;

    case 'choice':
    case 'multiple_choice':
      validateChoice(value, config as ChoiceAdvancedConfig | LegacyMultipleChoiceConfig, errors);
      break;

    case 'address':
    case 'address_advanced':
      validateAddress(value, config as AddressConfig | AddressAdvancedConfig, errors);
      break;

    case 'multi_field':
      validateMultiField(value, config as MultiFieldConfig, errors);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateEmail(value: unknown, config: EmailConfig | EmailAdvancedConfig | undefined, errors: string[]): void {
  const emails = Array.isArray(value) ? value : [value];

  for (const email of emails) {
    if (typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      errors.push(`Invalid email address: ${email}`);
    }

    if (!config) {continue;}

    // Type guard for advanced config
    if ('restrictDomains' in config && config.restrictDomains && config.restrictDomains.length > 0) {
      const domain = (email as string).split('@')[1];
      if (!config.restrictDomains.includes(domain)) {
        errors.push(`Email domain not allowed: ${domain}`);
      }
    }

    if ('blockDomains' in config && config.blockDomains && config.blockDomains.length > 0) {
      const domain = (email as string).split('@')[1];
      if (config.blockDomains.includes(domain)) {
        errors.push(`Email domain blocked: ${domain}`);
      }
    }
  }

  if (config && 'maxEmails' in config && config.maxEmails && emails.length > config.maxEmails) {
    errors.push(`Maximum ${config.maxEmails} emails allowed`);
  }
}

function validatePhone(value: unknown, _config: PhoneConfig | PhoneAdvancedConfig | undefined, errors: string[]): void {
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

function validateWebsite(value: unknown, config: WebsiteConfig | WebsiteAdvancedConfig | undefined, errors: string[]): void {
  if (typeof value !== 'string') {
    errors.push('Website must be a string');
    return;
  }

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);

    if (config?.requireProtocol && !value.match(/^[a-z]+:\/\//i)) {
      errors.push('URL must include protocol (http:// or https://)');
    }

    if (config && 'allowedProtocols' in config && config.allowedProtocols && config.allowedProtocols.length > 0) {
      // Cast protocol to satisfy literal type if needed, or check validity first
      const cleanProtocol = url.protocol.replace(':', '');
      if (!config.allowedProtocols.includes(cleanProtocol as any)) {
        errors.push(`Protocol not allowed: ${url.protocol}`);
      }
    }

    if (config && 'restrictDomains' in config && config.restrictDomains && config.restrictDomains.length > 0) {
      if (!config.restrictDomains.includes(url.hostname)) {
        errors.push(`Domain not allowed: ${url.hostname}`);
      }
    }

    if (config && 'blockDomains' in config && config.blockDomains && config.blockDomains.length > 0) {
      if (config.blockDomains.includes(url.hostname)) {
        errors.push(`Domain blocked: ${url.hostname}`);
      }
    }
  } catch (e) {
    errors.push('Invalid URL format');
  }
}

function validateNumber(value: unknown, config: NumberConfig | NumberAdvancedConfig | CurrencyConfig | NumberValidation | undefined, errors: string[]): void {
  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num)) {
    errors.push('Invalid number');
    return;
  }

  // Handle both StepConfig and NumberValidation shapes
  let validation: NumberValidation | undefined;
  if (config && 'validation' in config) {
    validation = (config).validation;
  } else {
    validation = config as NumberValidation | undefined;
  }

  if (validation?.min !== undefined && num < validation.min) {
    errors.push(`Value must be at least ${validation.min}`);
  }

  if (validation?.max !== undefined && num > validation.max) {
    errors.push(`Value must be at most ${validation.max}`);
  }
}

function validateScale(value: unknown, config: ScaleConfig | ScaleAdvancedConfig | undefined, errors: string[]): void {
  validateNumber(value, config, errors);
}

function validateChoice(value: unknown, config: ChoiceAdvancedConfig | LegacyMultipleChoiceConfig | undefined, errors: string[]): void {
  const values = Array.isArray(value) ? value : [value];

  // Safe extraction of options
  let options: ChoiceOption[] = [];
  if (config && 'options' in config) {
    if (Array.isArray(config.options)) {
      options = config.options;
    } else if (config.options && typeof config.options === 'object' && 'type' in config.options && (config.options as any).type === 'static') {
      // Handle DynamicOptionsConfig wrapper if present in schema but acting static
      options = ((config.options as any).options) as ChoiceOption[];
    }
  }

  const validOptions = options.map((opt) => opt.id || opt.alias);

  for (const val of values) {
    if (typeof val === 'string' && !validOptions.includes(val)) {
      errors.push(`Invalid option: ${val}`);
    }
  }

  // Safe checks for min/max
  const min = config && 'min' in config ? config.min : undefined;
  const max = config && 'max' in config ? config.max : undefined;

  if (min !== undefined && values.length < min) {
    errors.push(`Select at least ${min} option(s)`);
  }

  if (max !== undefined && values.length > max) {
    errors.push(`Select at most ${max} option(s)`);
  }
}

function validateAddress(value: unknown, config: AddressConfig | AddressAdvancedConfig | undefined, errors: string[]): void {
  if (!value || typeof value !== 'object') {
    errors.push('Address must be an object');
    return;
  }

  const valObj = value as Record<string, unknown>;

  // Check requireAll existence safely
  const requireAll = config && 'requireAll' in config ? config.requireAll : false;

  const requiredFields = requireAll
    ? (config?.fields || ['street', 'city', 'state', 'zip'])
    : [];

  for (const field of requiredFields) {
    const fieldKey = typeof field === 'string' ? field : field.key;
    if (!valObj[fieldKey] || String(valObj[fieldKey]).trim() === '') {
      const fieldLabel = typeof field === 'object' ? field.label : fieldKey;
      errors.push(`${fieldLabel} is required`);
    }
  }
}

function validateMultiField(value: unknown, config: StepConfig | undefined, errors: string[]): void {
  if (!value || typeof value !== 'object') {
    errors.push('Multi-field value must be an object');
    return;
  }

  const mfConfig = config as MultiFieldConfig | undefined;
  const valObj = value as Record<string, unknown>;

  for (const field of mfConfig?.fields || []) {
    if (field.required && (!valObj[field.key] || valObj[field.key] === '')) {
      errors.push(`${field.label} is required`);
    }

    // Type-specific validation for each field
    if (valObj[field.key]) {
      switch (field.type) {
        case 'email':
          validateEmail(valObj[field.key], undefined, errors);
          break;
        case 'phone':
          validatePhone(valObj[field.key], undefined, errors);
          break;
        case 'number':
          validateNumber(valObj[field.key], field.validation as NumberValidation, errors);
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
export function getDefaultValue(stepType: string, config?: StepConfig): unknown {
  switch (stepType) {
    case 'choice':
    case 'multiple_choice': {
      const choiceConfig = config as (ChoiceAdvancedConfig | LegacyMultipleChoiceConfig) | undefined;
      return choiceConfig?.allowMultiple || (choiceConfig && 'minSelections' in choiceConfig) ? [] : '';
    }

    case 'boolean':
    case 'yes_no':
    case 'true_false': {
      const boolConfig = config as (BooleanAdvancedConfig | LegacyYesNoConfig) | undefined;
      return boolConfig?.defaultValue ?? false;
    }

    case 'number':
    case 'number_advanced':
    case 'currency':
    case 'scale':
    case 'scale_advanced': {
      const numOrScale = config as (NumberConfig | ScaleConfig) | undefined;
      const advNum = config as NumberAdvancedConfig | undefined;
      return numOrScale?.min ?? advNum?.validation?.min ?? 0;
    }

    case 'address':
    case 'address_advanced':
      return {};

    case 'multi_field':
      return {};

    case 'file_upload': {
      const fileConfig = config as FileUploadConfig | undefined;
      return (fileConfig?.maxFiles ?? 1) > 1 ? [] : null;
    }

    default:
      return '';
  }
}
