/**
 * Step Configuration Type Definitions
 *
 * Comprehensive type definitions for all step/block configuration shapes.
 * This file provides strong typing for the `config` JSONB column in the steps table.
 *
 * Architecture:
 * - Easy Mode: Simple, focused types with minimal configuration
 * - Advanced Mode: Consolidated types with rich configuration options
 * - Legacy: Backward-compatible types for existing workflows
 *
 * @version 2.0.0 - Block System Overhaul
 * @date December 2025
 */

// ============================================================================
// BASE TYPES & UTILITIES
// ============================================================================

/**
 * Validation rules for text inputs
 */
export interface TextValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;        // Regex pattern
  patternMessage?: string; // Custom error message for pattern validation
}

/**
 * Validation rules for numeric inputs
 */
export interface NumberValidation {
  min?: number;
  max?: number;
  step?: number;
  precision?: number;      // Decimal places
}

/**
 * Common choice option structure
 */
export interface ChoiceOption {
  id: string;              // Unique identifier
  label: string;           // Display label
  alias?: string;          // Canonical value for logic (defaults to id)
  description?: string;    // Optional tooltip/help text
}

// ============================================================================
// EASY MODE CONFIGS
// ============================================================================

/**
 * Phone Number Config (Easy Mode)
 * US phone number input with automatic formatting
 */
export interface PhoneConfig {
  format?: 'US' | 'international';  // Default: US
  placeholder?: string;
}

/**
 * Date Config (Easy Mode)
 * Date-only picker
 */
export interface DateConfig {
  minDate?: string;        // ISO date string
  maxDate?: string;        // ISO date string
  defaultToToday?: boolean;
}

/**
 * Time Config (Easy Mode)
 * Time-only picker
 */
export interface TimeConfig {
  format?: '12h' | '24h';  // Default: 12h
  step?: number;           // Minutes step (default: 15)
}

/**
 * DateTime Config (Easy Mode)
 * Combined date and time picker
 */
export interface DateTimeConfig {
  minDate?: string;
  maxDate?: string;
  timeFormat?: '12h' | '24h';
  timeStep?: number;
}

/**
 * Email Config (Easy Mode)
 * Email input with basic validation
 */
export interface EmailConfig {
  allowMultiple?: boolean; // Allow comma-separated emails
  placeholder?: string;
}

/**
 * Number Config (Easy Mode)
 * Basic number input
 */
export interface NumberConfig {
  min?: number;
  max?: number;
  step?: number;           // Increment step (default: 1)
  allowDecimal?: boolean;  // Default: false
  placeholder?: string;
}

/**
 * Currency Config (Easy Mode)
 * Currency input with formatting
 */
export interface CurrencyConfig {
  currency?: 'USD' | 'EUR' | 'GBP';  // Default: USD
  allowDecimal?: boolean;            // Default: true
  min?: number;
  max?: number;
}

/**
 * Scale Config (Easy Mode)
 * Simple rating scale (slider or stars)
 */
export interface ScaleConfig {
  min: number;             // Minimum value
  max: number;             // Maximum value
  step?: number;           // Default: 1
  display?: 'slider' | 'stars';  // Default: slider
  showValue?: boolean;     // Show current value (default: true)
  minLabel?: string;       // Label for minimum value
  maxLabel?: string;       // Label for maximum value
}

/**
 * Website Config (Easy Mode)
 * URL input with validation
 */
export interface WebsiteConfig {
  requireProtocol?: boolean;  // Require http:// or https:// (default: false)
  placeholder?: string;
}

/**
 * Display Config (Easy Mode)
 * Markdown content display
 */
export interface DisplayConfig {
  markdown: string;        // Markdown content to display
  allowHtml?: boolean;     // Allow HTML in markdown (default: false)
}

/**
 * Address Config (Easy Mode)
 * US address input (street, city, state, zip)
 */
export interface AddressConfig {
  country: 'US';           // Fixed to US for easy mode
  fields: ['street', 'city', 'state', 'zip'];  // Fixed field set
  requireAll?: boolean;    // Require all fields (default: true)
}

/**
 * True/False Config (Easy Mode)
 * Boolean toggle with True/False labels
 */
export interface TrueFalseConfig {
  defaultValue?: boolean;
  trueLabel?: string;      // Default: "True"
  falseLabel?: string;     // Default: "False"
}

// ============================================================================
// ADVANCED MODE CONFIGS
// ============================================================================

/**
 * Text Config (Advanced Mode)
 * Unified text input with variant selection
 */
export interface TextAdvancedConfig {
  variant: 'short' | 'long';
  validation?: TextValidation;
  placeholder?: string;
  helpText?: string;
  autoComplete?: string;   // HTML autocomplete attribute
}

/**
 * Boolean Config (Advanced Mode)
 * Boolean with fully customizable labels
 */
export interface BooleanAdvancedConfig {
  trueLabel: string;       // Custom true label
  falseLabel: string;      // Custom false label
  storeAsBoolean: boolean; // If false, store alias strings instead
  trueAlias?: string;      // Alias for true value (if storeAsBoolean=false)
  falseAlias?: string;     // Alias for false value (if storeAsBoolean=false)
  defaultValue?: boolean | string;
  displayStyle?: 'toggle' | 'radio' | 'checkbox';
}

/**
 * Phone Config (Advanced Mode)
 * International phone support with country codes
 */
export interface PhoneAdvancedConfig {
  defaultCountry?: string; // ISO country code (default: US)
  allowedCountries?: string[];  // Restrict to specific countries
  format?: 'national' | 'international';
  validation?: {
    strict?: boolean;      // Strict validation (default: true)
  };
}

/**
 * DateTime Config (Advanced Mode)
 * Unified date/time picker with metadata
 */
export interface DateTimeUnifiedConfig {
  kind: 'date' | 'time' | 'datetime';
  format?: string;         // Custom format string (moment.js style)
  minDate?: string;
  maxDate?: string;
  timeFormat?: '12h' | '24h';
  timeStep?: number;
  timezone?: string;       // IANA timezone (e.g., "America/New_York")
  showTimezone?: boolean;  // Display timezone selector
}

/**
 * Dynamic Options Source Type
 */
export type DynamicOptionsSourceType = 'static' | 'list' | 'table_column';

/**
 * Dynamic Options Configuration
 * Supports three source types:
 * 1. Static: Predefined options
 * 2. List: From a ListVariable (from Read Table / List Tools blocks) with full transformation support
 * 3. Table Column: Convenience path that reads from a table column
 */
export type DynamicOptionsConfig =
  | { type: 'static'; options: ChoiceOption[] }
  | {
    type: 'list';
    listVariable: string;     // Name of the list variable (e.g. "usersList")
    labelPath: string;        // Field path for label (display text) - supports dot notation (e.g. "name", "user.fullName")
    valuePath: string;        // Field path for value (stored data) - supports dot notation
    labelTemplate?: string;   // Optional template like "{FirstName} {LastName}" (overrides labelPath)
    groupByPath?: string;     // Optional field path for grouping options
    enableSearch?: boolean;   // Enable search for dropdown (default: false)
    includeBlankOption?: boolean;  // Add a blank option at the top
    blankLabel?: string;      // Label for blank option (default: empty string)

    // List Tools block linking (for inline creation)
    linkedListToolsBlockId?: string;  // ID of linked List Tools block (if created inline)
    baseListVar?: string;     // Original source list before transforms (for unlink)

    // Full List Tools transformation pipeline (applied before mapping to options)
    transform?: {
      filters?: import('./blocks').ListToolsFilterGroup;  // Filter rules (AND/OR groups)
      sort?: Array<{                                       // Multi-key sorting
        fieldPath: string;
        direction: 'asc' | 'desc';
      }>;
      limit?: number;         // Row limit
      offset?: number;        // Row offset (skip first N)
      dedupe?: {              // Deduplication
        fieldPath: string;
      };
      select?: string[];      // Field projection (if omitted, all fields included)
    };
  }
  | {
    type: 'table_column';
    dataSourceId: string;     // Database ID
    tableId: string;          // Table ID
    columnId: string;         // Column to extract values from (used for both label and value)
    labelColumnId?: string;   // Optional separate column for labels
    filters?: Array<{         // Optional filters
      columnId: string;
      operator: string;
      value: any;
    }>;
    sort?: {                  // Optional sort
      columnId: string;
      direction: 'asc' | 'desc';
    };
    limit?: number;           // Max options to load (default: 100)
  };

/**
 * Choice Config (Advanced Mode)
 * Unified choice block (radio/dropdown/multiple)
 */
export interface ChoiceAdvancedConfig {
  display: 'radio' | 'dropdown' | 'multiple';
  allowMultiple: boolean;  // Enable multi-select
  options: ChoiceOption[] | DynamicOptionsConfig;  // Static options or DynamicConfig (Legacy)
  dynamicOptions?: DynamicOptionsConfig; // Explicit dynamic options configuration
  min?: number;            // Minimum selections (for multiple)
  max?: number;            // Maximum selections (for multiple)
  allowOther?: boolean;    // Allow "Other" option with text input
  otherLabel?: string;     // Label for "Other" option
  searchable?: boolean;    // Enable search for dropdown (many options)
  randomizeOrder?: boolean;  // Randomize option order

  /**
   * @deprecated Use DynamicOptionsConfig instead
   * List Binding Configuration
   * Binds options to a dynamic ListVariable
   */
  listBinding?: {
    listVariable: string;  // Name of the list variable (e.g. "activeUsers")
    labelColumnId: string; // Column ID to use for label (display text)
    valueColumnId: string; // Column ID to use for value (stored data)
  };
}

/**
 * Email Config (Advanced Mode)
 * Advanced email with additional validation
 */
export interface EmailAdvancedConfig {
  allowMultiple?: boolean;
  maxEmails?: number;      // Max number of emails (if allowMultiple)
  restrictDomains?: string[];  // Whitelist of allowed domains
  blockDomains?: string[];     // Blacklist of blocked domains
  requireVerification?: boolean;  // Require email verification
  placeholder?: string;
}

/**
 * Number Config (Advanced Mode)
 * Advanced number with currency and formatting options
 */
export interface NumberAdvancedConfig {
  mode: 'number' | 'currency_whole' | 'currency_decimal';
  validation?: NumberValidation;
  currency?: string;       // ISO currency code (for currency modes)
  formatOnInput?: boolean; // Apply formatting as user types
  thousandsSeparator?: boolean;  // Show thousands separator
  prefix?: string;         // Custom prefix (e.g., "$", "#")
  suffix?: string;         // Custom suffix (e.g., "%", "kg")
  placeholder?: string;
}

/**
 * Scale Config (Advanced Mode)
 * Advanced scale with custom styling and ranges
 */
export interface ScaleAdvancedConfig {
  min: number;
  max: number;
  step: number;
  display: 'slider' | 'stars' | 'buttons';
  stars?: number;          // Number of stars (if display=stars)
  showValue?: boolean;
  minLabel?: string;
  maxLabel?: string;
  labels?: Record<number, string>;  // Custom labels for specific values
  color?: string;          // Custom color/theme
}

/**
 * Website Config (Advanced Mode)
 * Advanced URL validation with protocol/domain checking
 */
export interface WebsiteAdvancedConfig {
  requireProtocol: boolean;
  allowedProtocols?: ('http' | 'https' | 'ftp')[];
  restrictDomains?: string[];   // Whitelist of allowed domains
  blockDomains?: string[];      // Blacklist of blocked domains
  validateDns?: boolean;        // Check if domain exists (backend)
  placeholder?: string;
}

/**
 * Address Config (Advanced Mode)
 * International address support with flexible field configuration
 */
export interface AddressAdvancedConfig {
  country?: string;        // ISO country code (default: US)
  allowedCountries?: string[];  // Restrict to specific countries
  fields: Array<{
    key: string;           // Field identifier (e.g., "street1", "city")
    label: string;         // Display label
    type: 'text' | 'select';
    required: boolean;
    options?: string[];    // For select fields (e.g., states)
  }>;
  autoComplete?: boolean;  // Enable address autocomplete
  validateAddress?: boolean;  // Validate address via API
}

/**
 * Multi-Field Config (Advanced Mode)
 * Grouped fields (name, contact, date ranges)
 */
export interface MultiFieldConfig {
  layout: 'first_last' | 'contact' | 'date_range' | 'custom';
  fields: Array<{
    key: string;           // Field identifier
    label: string;         // Display label
    type: 'text' | 'email' | 'phone' | 'date' | 'number';
    required: boolean;
    placeholder?: string;
    validation?: TextValidation | NumberValidation;
  }>;
  storeAs: 'separate' | 'combined';  // Store as separate step values or single object
}

/**
 * Display Config (Advanced Mode)
 * Rich display with templates and dynamic content
 */
export interface DisplayAdvancedConfig {
  markdown: string;
  allowHtml: boolean;
  template?: boolean;      // Enable variable substitution (e.g., {{firstName}})
  variables?: string[];    // Whitelisted variables for template
  style?: {
    backgroundColor?: string;
    textColor?: string;
    fontSize?: 'sm' | 'md' | 'lg';
    alignment?: 'left' | 'center' | 'right';
  };
}

// ============================================================================
// LEGACY CONFIGS (Backward Compatibility)
// ============================================================================

/**
 * Legacy Multiple Choice Config
 * Kept for backward compatibility with existing workflows
 */
export interface LegacyMultipleChoiceConfig {
  options: Array<{
    id: string;
    label: string;
    alias?: string;
  }>;
  minSelections?: number;
  maxSelections?: number;
  allowMultiple?: boolean;
}


/**
 * Legacy Radio Config
 * Kept for backward compatibility with existing workflows
 */
export interface LegacyRadioConfig {
  options: Array<{
    id: string;
    label: string;
    alias?: string;
  }>;
  displayLayout?: 'vertical' | 'horizontal';
}

/**
 * Legacy Yes/No Config
 * Kept for backward compatibility
 */
export interface LegacyYesNoConfig {
  yesLabel?: string;
  noLabel?: string;
  defaultValue?: boolean;
}

/**
 * Legacy Date/Time Config
 * Kept for backward compatibility
 */
export interface LegacyDateTimeConfig {
  showDate?: boolean;
  showTime?: boolean;
  format?: string;
}

// ============================================================================
// SPECIAL CONFIGS
// ============================================================================

/**
 * JS Question Config
 * (Already exists in steps.ts, included here for completeness)
 */
export interface JsQuestionConfig {
  display: "visible" | "hidden";
  code: string;
  inputKeys: string[];
  outputKey: string;
  timeoutMs?: number;
  helpText?: string;
}

/**
 * Computed Step Config
 * Virtual steps created by transform blocks
 */
export interface ComputedStepConfig {
  transformBlockId?: string;  // Reference to transform block
  formula?: string;           // Simple formula (alternative to transform block)
  inputKeys?: string[];       // Input variables
}

/**
 * File Upload Config
 */
export interface FileUploadConfig {
  maxSize?: number;           // Max file size in bytes
  allowedTypes?: string[];    // MIME types (e.g., ["image/*", "application/pdf"])
  maxFiles?: number;          // Max number of files (default: 1)
  previewThumbnails?: boolean;
}

/**
 * Conditional Logic Expression
 * Used for conditional document output
 */
export interface LogicExpression {
  operator?: 'AND' | 'OR';
  conditions: Array<{
    key: string;              // Step alias to check
    op: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
    value?: any;              // Expected value (not needed for is_empty/is_not_empty)
  }>;
}

/**
 * Final Block Config
 * Document selection and output configuration for workflow completion
 *
 * This block type appears at the end of workflows and allows:
 * - Selecting one or more document templates
 * - Binding workflow variables to document fields
 * - Conditional document output based on logic rules
 * - Customizable final screen with markdown
 */
export interface FinalBlockConfig {
  markdownHeader: string;     // Markdown content shown above document list
  documents: Array<{
    id: string;               // Unique ID for this document entry in the block
    documentId: string;       // Reference to uploaded template document
    alias: string;            // Short name for this document (e.g., "contract", "receipt")
    conditions?: LogicExpression | null;  // Optional conditional logic for this document
    mapping?: {
      // Optional field mapping for document generation (Prompt 10)
      [docFieldName: string]: {
        type: 'variable';
        source: string;       // Alias of workflow variable
      }
    };
  }>;
}

/**
 * Signature Block Config
 * E-Signature integration for document signing workflows
 *
 * This block type enables multi-party document signing with:
 * - DocuSign, HelloSign, or native signature support
 * - Multiple signer roles with routing order
 * - Variable-to-field mapping for pre-filling documents
 * - Conditional logic for showing/hiding signature blocks
 * - Preview mode simulation
 */
export interface SignatureBlockConfig {
  signerRole: string;         // Role name: "Applicant", "Attorney", "Spouse", etc.
  routingOrder: number;       // Signing sequence: 1, 2, 3... (lower signs first)
  documents: Array<{
    id: string;               // Unique ID for this document entry
    documentId: string;       // Reference to document (from Final Block or library)
    mapping?: {
      // Map workflow variables to document fields/tabs
      [tabName: string]: {
        type: 'variable';
        source: string;       // Alias of workflow variable
      }
    };
  }>;
  conditions?: LogicExpression | null;  // Optional conditional logic
  markdownHeader?: string;    // Optional text shown before signature redirect
  provider?: 'docusign' | 'hellosign' | 'native';  // E-signature provider
  allowDecline?: boolean;     // Allow signer to decline (default: false)
  expiresInDays?: number;     // Expiration days (default: 30)
  signerEmail?: string;       // Pre-filled signer email (optional, can use variable)
  signerName?: string;        // Pre-filled signer name (optional, can use variable)
  message?: string;           // Custom message to signer
  redirectUrl?: string;       // URL to redirect after signing (optional)
}

// ============================================================================
// DISCRIMINATED UNION TYPE
// ============================================================================

/**
 * Step Config Type (Discriminated Union)
 *
 * This type represents all possible step configurations.
 * Use TypeScript's type narrowing to access type-specific config.
 *
 * @example
 * ```typescript
 * if (step.type === 'choice') {
 *   const config = step.config as ChoiceAdvancedConfig;
 *   console.log(config.options);
 * }
 * ```
 */
export type StepConfig =
  // Easy Mode
  | PhoneConfig
  | DateConfig
  | TimeConfig
  | DateTimeConfig
  | EmailConfig
  | NumberConfig
  | CurrencyConfig
  | ScaleConfig
  | WebsiteConfig
  | DisplayConfig
  | AddressConfig
  | TrueFalseConfig
  // Advanced Mode
  | TextAdvancedConfig
  | BooleanAdvancedConfig
  | PhoneAdvancedConfig
  | DateTimeUnifiedConfig
  | ChoiceAdvancedConfig
  | EmailAdvancedConfig
  | NumberAdvancedConfig
  | ScaleAdvancedConfig
  | WebsiteAdvancedConfig
  | AddressAdvancedConfig
  | MultiFieldConfig
  | DisplayAdvancedConfig
  // Legacy
  | LegacyMultipleChoiceConfig
  | LegacyRadioConfig
  | LegacyYesNoConfig
  | LegacyDateTimeConfig
  // Special
  | JsQuestionConfig
  | ComputedStepConfig
  | FileUploadConfig
  | FinalBlockConfig
  | SignatureBlockConfig
  // Allow empty config
  | Record<string, never>
  | null
  | undefined;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for Choice config
 */
export function isChoiceConfig(config: any): config is ChoiceAdvancedConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.display === 'string' &&
    typeof config.allowMultiple === 'boolean' &&
    Array.isArray(config.options)
  );
}

/**
 * Type guard for Multi-Field config
 */
export function isMultiFieldConfig(config: any): config is MultiFieldConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.layout === 'string' &&
    Array.isArray(config.fields) &&
    typeof config.storeAs === 'string'
  );
}

/**
 * Type guard for Address config
 */
export function isAddressConfig(config: any): config is AddressConfig | AddressAdvancedConfig {
  return (
    config &&
    typeof config === 'object' &&
    (config.country === 'US' || typeof config.country === 'string') &&
    Array.isArray(config.fields)
  );
}

/**
 * Type guard for Number/Currency config
 */
export function isNumberConfig(config: any): config is NumberConfig | NumberAdvancedConfig {
  return (
    config &&
    typeof config === 'object' &&
    (typeof config.min === 'number' ||
      typeof config.max === 'number' ||
      typeof config.step === 'number' ||
      typeof config.mode === 'string')
  );
}

/**
 * Type guard for DateTime config
 */
export function isDateTimeConfig(config: any): config is DateTimeUnifiedConfig | DateTimeConfig | LegacyDateTimeConfig {
  return (
    config &&
    typeof config === 'object' &&
    (typeof config.kind === 'string' ||
      typeof config.minDate === 'string' ||
      typeof config.maxDate === 'string' ||
      typeof config.showDate === 'boolean')
  );
}

/**
 * Type guard for Signature Block config
 */
export function isSignatureBlockConfig(config: any): config is SignatureBlockConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.signerRole === 'string' &&
    typeof config.routingOrder === 'number' &&
    Array.isArray(config.documents)
  );
}

// ============================================================================
// VALUE TYPES
// ============================================================================

/**
 * Address Value Structure
 * Stored in stepValues for address blocks
 */
export interface AddressValue {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

/**
 * Multi-Field Value Structure
 * Stored in stepValues for multi-field blocks
 */
export interface MultiFieldValue {
  [key: string]: string | number | boolean | null | string[];
}

/**
 * Choice Value Type
 * Can be single selection or array for multiple
 */
export type ChoiceValue = string | string[];

/**
 * File Upload Value
 */
export interface FileUploadValue {
  fileId: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

/**
 * NOTE: Zod validation schemas are defined in a separate file:
 * shared/validation/stepConfigSchemas.ts
 *
 * This keeps type definitions and runtime validation separate.
 */

// ============================================================================
// EXPORTS
// ============================================================================


