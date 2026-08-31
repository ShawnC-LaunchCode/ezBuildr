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

import type { DeliveryDestination } from "./delivery";
import type { MappingBinding } from "./documentMapping";

/**
 * Stored step identities after the toolbox migration is complete.
 *
 * `StepType` deliberately remains the wider persisted union during rollout.
 * Presets and compatibility aliases must point at one of these identities
 * without adding another canonical type.
 */
export const CANONICAL_STEP_TYPES = [
  "text",
  "boolean",
  "phone",
  "date_time",
  "choice",
  "email",
  "number",
  "scale",
  "website",
  "address",
  "multi_field",
  "display",
  "file_upload",
  "list",
  "js_question",
  "computed",
  "final_documents",
  "signature_block",
] as const;

export type CanonicalStepType = (typeof CANONICAL_STEP_TYPES)[number];

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
 * Canonical stored config for the `phone` family (STB-13).
 */
export interface PhoneConfig {
  format?: 'national' | 'international' | 'US';
  validation?: {
    strict?: boolean;
  };
  placeholder?: string;
}

/**
 * Read a phone-family config through the canonical shape.
 */
export function resolvePhoneConfig(
  rawConfig: unknown,
): PhoneConfig {
  const config = typeof rawConfig === 'object' && rawConfig !== null
    ? rawConfig as Record<string, unknown>
    : {};
    
  const resolved: PhoneConfig = {};
  
  if (config.format === 'national') { resolved.format = 'national'; }
  else if (config.format === 'international') { resolved.format = 'international'; }
  else { resolved.format = 'US'; }

  if (typeof config.placeholder === 'string') { resolved.placeholder = config.placeholder; }
  
  const nestedValidation = typeof config.validation === 'object' && config.validation !== null
    ? config.validation as Record<string, unknown>
    : {};
  
  if (typeof nestedValidation.strict === 'boolean') {
    resolved.validation = { strict: nestedValidation.strict };
  }
  
  return resolved;
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

/** Canonical config for the Date, Time, and Date/Time preset family. */
export interface DateTimeConfig {
  kind: 'date' | 'time' | 'datetime';
  minDate?: string;
  maxDate?: string;
  defaultToToday?: boolean;
  timeFormat?: '12h' | '24h';
  timeStep?: number;
}

/**
 * Canonical stored config for the `email` family (STB-13).
 */
export interface EmailConfig {
  allowMultiple?: boolean;
  maxEmails?: number;
  restrictDomains?: string[];
  blockDomains?: string[];
  placeholder?: string;
}

/**
 * Read an email-family config through the canonical shape.
 */
export function resolveEmailConfig(
  rawConfig: unknown,
): EmailConfig {
  const config = typeof rawConfig === 'object' && rawConfig !== null
    ? rawConfig as Record<string, unknown>
    : {};
    
  const resolved: EmailConfig = {};
  if (typeof config.allowMultiple === 'boolean') { resolved.allowMultiple = config.allowMultiple; }
  if (typeof config.maxEmails === 'number') { resolved.maxEmails = config.maxEmails; }
  if (Array.isArray(config.restrictDomains)) { resolved.restrictDomains = config.restrictDomains as string[]; }
  if (Array.isArray(config.blockDomains)) { resolved.blockDomains = config.blockDomains as string[]; }
  if (typeof config.placeholder === 'string') { resolved.placeholder = config.placeholder; }
  return resolved;
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
 * Canonical stored config for the `website` family (STB-13).
 */
export interface WebsiteConfig {
  requireProtocol?: boolean;
  allowedProtocols?: ('http' | 'https' | 'ftp')[];
  restrictDomains?: string[];
  blockDomains?: string[];
  placeholder?: string;
}

/**
 * Read a website-family config through the canonical shape.
 */
export function resolveWebsiteConfig(
  rawConfig: unknown,
): WebsiteConfig {
  const config = typeof rawConfig === 'object' && rawConfig !== null
    ? rawConfig as Record<string, unknown>
    : {};
    
  const resolved: WebsiteConfig = {};
  if (typeof config.requireProtocol === 'boolean') { resolved.requireProtocol = config.requireProtocol; }
  if (Array.isArray(config.allowedProtocols)) { resolved.allowedProtocols = config.allowedProtocols as ('http' | 'https' | 'ftp')[]; }
  if (Array.isArray(config.restrictDomains)) { resolved.restrictDomains = config.restrictDomains as string[]; }
  if (Array.isArray(config.blockDomains)) { resolved.blockDomains = config.blockDomains as string[]; }
  if (typeof config.placeholder === 'string') { resolved.placeholder = config.placeholder; }
  return resolved;
}

/**
 * Display Config (Easy Mode)
 * Markdown content display
 */
export interface DisplayConfig {
  markdown: string;        // Markdown content to display
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

/** Canonical stored answer for either text variant. */
export type TextValue = string | null;

/**
 * Read a text-family config through the canonical shape.
 *
 * `short_text` / `long_text` are retained here only as a read adapter for
 * rows created before STB-3. New authoring paths persist `text` plus
 * `variant`; STB-19 removes the aliases after stored artifacts are backfilled.
 */
export function resolveTextConfig(
  stepType: string,
  rawConfig: unknown,
): TextAdvancedConfig {
  const config = typeof rawConfig === 'object' && rawConfig !== null
    ? rawConfig as Record<string, unknown>
    : {};
  const nestedValidation = typeof config.validation === 'object' && config.validation !== null
    ? config.validation as Record<string, unknown>
    : {};
  const validation: TextValidation = {};

  const minLength = nestedValidation.minLength ?? config.minLength;
  const maxLength = nestedValidation.maxLength ?? config.maxLength;
  const pattern = nestedValidation.pattern ?? config.pattern;
  const patternMessage = nestedValidation.patternMessage ?? config.patternMessage;
  if (typeof minLength === 'number') { validation.minLength = minLength; }
  if (typeof maxLength === 'number') { validation.maxLength = maxLength; }
  if (typeof pattern === 'string') { validation.pattern = pattern; }
  if (typeof patternMessage === 'string') { validation.patternMessage = patternMessage; }

  const configuredVariant = config.variant;
  const variant = stepType === 'long_text'
    ? 'long'
    : stepType === 'short_text'
      ? 'short'
      : configuredVariant === 'long'
        ? 'long'
        : 'short';
  const resolved: TextAdvancedConfig = { variant };

  if (Object.keys(validation).length > 0) { resolved.validation = validation; }
  if (typeof config.placeholder === 'string') { resolved.placeholder = config.placeholder; }
  if (typeof config.helpText === 'string') { resolved.helpText = config.helpText; }
  if (typeof config.autoComplete === 'string') { resolved.autoComplete = config.autoComplete; }

  return resolved;
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
  displayStyle?: 'buttons' | 'radio' | 'toggle' | 'checkbox';
}

export interface ResolvedBooleanConfig {
  trueLabel: string;
  falseLabel: string;
  trueAlias: string;
  falseAlias: string;
  storeAsBoolean: boolean;
  displayStyle: 'buttons' | 'radio' | 'toggle' | 'checkbox';
}

function isBooleanConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBooleanConfigString(
  config: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = config[key];
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/** One read-compatible Boolean contract for storage, validation, logic, and display. */
export function resolveBooleanConfig(rawConfig: unknown): ResolvedBooleanConfig {
  const config = isBooleanConfigRecord(rawConfig) ? rawConfig : {};
  const displayStyle = config.displayStyle;
  const trueLabel = readBooleanConfigString(
    config,
    'trueLabel',
    readBooleanConfigString(config, 'yesLabel', 'Yes')
  );
  const falseLabel = readBooleanConfigString(
    config,
    'falseLabel',
    readBooleanConfigString(config, 'noLabel', 'No')
  );
  return {
    trueLabel,
    falseLabel,
    trueAlias: readBooleanConfigString(config, 'trueAlias', 'true'),
    falseAlias: readBooleanConfigString(config, 'falseAlias', 'false'),
    storeAsBoolean: config.storeAsBoolean !== false,
    displayStyle: displayStyle === 'radio' || displayStyle === 'toggle' || displayStyle === 'checkbox'
      ? displayStyle
      : 'buttons',
  };
}

export function getBooleanStorageValue(logicalValue: boolean, rawConfig: unknown): boolean | string {
  const config = resolveBooleanConfig(rawConfig);
  if (config.storeAsBoolean) { return logicalValue; }
  return logicalValue ? config.trueAlias : config.falseAlias;
}

/**
 * Reads current aliases and historical label-backed answers. New writes must
 * still use getBooleanStorageValue; accepting labels here is display/resume
 * compatibility, not permission to persist another label-backed answer.
 */
export function resolveBooleanLogicalValue(value: unknown, rawConfig: unknown): boolean | undefined {
  if (typeof value === 'boolean') { return value; }
  if (typeof value !== 'string') { return undefined; }
  const config = resolveBooleanConfig(rawConfig);
  if (value === config.trueAlias || value === config.trueLabel) { return true; }
  if (value === config.falseAlias || value === config.falseLabel) { return false; }
  return undefined;
}



/** @deprecated Use DateTimeConfig. Retained as a source-compatible type name. */
export type DateTimeUnifiedConfig = DateTimeConfig;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- filter values can be any type
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
 * Unified choice block (radio/dropdown/combobox/multiple)
 */
export interface ChoiceAdvancedConfig {
  /**
   * How the choices are presented.
   *
   * Single-select: 'radio' | 'dropdown' | 'combobox'.
   * Multi-select:  'multiple', which always renders as checkboxes.
   *
   * 'combobox' is a searchable dropdown that also accepts an answer the
   * author never listed. It replaces the old `display: 'dropdown'` +
   * `searchable: true` pairing — see `searchable` below.
   */
  display: 'radio' | 'dropdown' | 'combobox' | 'multiple';
  layout?: 'vertical' | 'horizontal';  // Layout for radio/multiple controls
  options: ChoiceOption[] | DynamicOptionsConfig;  // Static options or DynamicConfig (Legacy)
  dynamicOptions?: DynamicOptionsConfig; // Explicit dynamic options configuration
  min?: number;            // Minimum selections (for multiple)
  max?: number;            // Maximum selections (for multiple)
  allowOther?: boolean;    // Allow "Other" option with text input
  otherLabel?: string;     // Label for "Other" option
  /**
   * @deprecated Use `display: 'combobox'`.
   *
   * Still read when loading older configs so a saved dropdown+searchable
   * question keeps its search box: both the builder and the runner normalise
   * that pair to 'combobox' via `resolveChoiceDisplay`. Never written by new
   * saves. Do not delete without a data migration.
   */
  searchable?: boolean;
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

/** Presentation a choice question resolves to. */
export type ChoiceDisplay = 'radio' | 'dropdown' | 'combobox' | 'multiple';

/**
 * Normalise a stored choice config to the display it should actually render.
 *
 * The builder and the runner both call this so they can never disagree about
 * what a saved question looks like. It absorbs two pieces of history:
 *
 *  - `searchable: true` on a dropdown used to mean "searchable dropdown";
 *    that is now simply 'combobox'.
 *  - Multi-select was expressed three different ways (`display: 'multiple'`,
 *    `allowMultiple: true`, or the legacy `multiple_choice` step type). Any
 *    of them wins over `display`, because a multi-select always renders as
 *    checkboxes.
 */
export function resolveChoiceDisplay(
  config: Pick<ChoiceAdvancedConfig, 'display' | 'searchable'> | undefined | null,
  stepType?: string,
): ChoiceDisplay {
  if (stepType === 'multiple_choice') { return 'multiple'; }
  if (config?.display === 'multiple') { return 'multiple'; }
  // Read compatibility for rows written before STB-7 (reviewer, 2026-08-29).
  // `allowMultiple` is gone from the authored schema -- nothing can write it
  // any more, and `display` alone decides cardinality for anything new. But it
  // was a *required* field, and the previous resolver returned 'multiple' when
  // either it or `display` said so, which the ticket's own Finding notes could
  // disagree. AI, API and import callers bypass the editor that kept them in
  // step, so a stored `{ display: 'radio', allowMultiple: true }` was a real
  // multi-select whose answer is a string[]. Dropping the signal outright would
  // silently make it single-select and orphan that answer, so it is honoured on
  // read only, exactly as resolveTextConfig/resolveNumberConfig/
  // resolveDateTimeConfig do for their families. STB-19 must map it to
  // `display: 'multiple'` before removing it from stored artifacts.
  if ((config as { allowMultiple?: unknown } | undefined | null)?.allowMultiple === true) {
    return 'multiple';
  }
  if (config?.display === 'combobox') { return 'combobox'; }
  if (config?.display === 'dropdown') {
    return config.searchable === true ? 'combobox' : 'dropdown';
  }
  return 'radio';
}



/**
 * Number Config (Advanced Mode)
 * Advanced number with currency and formatting options
 */
export interface NumberAdvancedConfig {
  mode: NumberMode;
  validation?: NumberValidation;
  currency?: string;       // ISO currency code (for currency modes)
  formatOnInput?: boolean; // Apply formatting as user types
  thousandsSeparator?: boolean;  // Show thousands separator
  prefix?: string;         // Custom prefix (e.g., "$", "#")
  suffix?: string;         // Custom suffix (e.g., "%", "kg")
  placeholder?: string;
}

/** Canonical stored answer for the number family. */
export type NumberValue = number | null;

export type NumberMode = 'number' | 'currency_whole' | 'currency_decimal';

/**
 * Canonical stored config for the `number` family (STB-9).
 *
 * Per Decision 8: display and storage are separate. `thousandsSeparator`,
 * `formatOnInput`, `prefix` and `suffix` affect only what the respondent sees;
 * the stored value is always `number | null`. `prefix`/`suffix` are
 * plain-number decorations and must not be used to fake currency — ISO
 * currency formatting owns symbols and ISO fraction rules.
 */
export interface NumberCanonicalConfig {
  mode: NumberMode;
  validation?: NumberValidation;
  /** ISO 4217 code. Present only for currency modes; defaults to USD when read. */
  currency?: string;
  /** Group thousands in the displayed value. Display only. */
  thousandsSeparator?: boolean;
  /** Group while the field has focus too, rather than only once it blurs. */
  formatOnInput?: boolean;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}

function resolveNumberMode(
  stepType: string,
  config: Record<string, unknown>,
): NumberMode {
  const storedMode = config.mode;
  if (storedMode === 'currency_whole' || storedMode === 'currency_decimal') {
    return storedMode;
  }
  if (stepType === 'currency') {
    return config.allowDecimal === false ? 'currency_whole' : 'currency_decimal';
  }
  return 'number';
}

function readNumberSetting(
  config: Record<string, unknown>,
  nested: Record<string, unknown>,
  key: keyof NumberValidation,
): number | undefined {
  const value = nested[key] ?? config[key];
  return typeof value === 'number' ? value : undefined;
}

function resolveNumberValidation(
  config: Record<string, unknown>,
  nested: Record<string, unknown>,
  mode: NumberMode,
): NumberValidation {
  const validation: NumberValidation = {};
  const keys = ['min', 'max', 'step', 'precision'] as const;

  for (const key of keys) {
    const value = readNumberSetting(config, nested, key);
    if (value !== undefined) {
      validation[key] = value;
    }
  }

  // The retired easy shape expressed precision as a boolean.
  if (mode === 'number' && validation.precision === undefined && config.allowDecimal === false) {
    validation.precision = 0;
  }

  return validation;
}

/**
 * Read a number-family config through the canonical shape.
 *
 * Handles four stored dialects: canonical `number`, the pre-STB-9 easy shape
 * with `min`/`max`/`step`/`allowDecimal` at the root, `number_advanced`, and
 * legacy `currency`. Read compatibility remains until STB-19 backfills rows;
 * every new writer uses the canonical `number` identity.
 */
export function resolveNumberConfig(
  stepType: string,
  rawConfig: unknown,
): NumberCanonicalConfig {
  const config = isObjectRecord(rawConfig) ? rawConfig : {};
  const nested = isObjectRecord(config.validation) ? config.validation : {};
  const mode = resolveNumberMode(stepType, config);
  const validation = resolveNumberValidation(config, nested, mode);

  const resolved: NumberCanonicalConfig = { mode };
  if (Object.keys(validation).length > 0) { resolved.validation = validation; }
  if (config.thousandsSeparator === true) { resolved.thousandsSeparator = true; }
  if (mode === 'number') {
    if (config.formatOnInput === true) { resolved.formatOnInput = true; }
    if (typeof config.prefix === 'string' && config.prefix !== '') { resolved.prefix = config.prefix; }
    if (typeof config.suffix === 'string' && config.suffix !== '') { resolved.suffix = config.suffix; }
  } else {
    resolved.currency = typeof config.currency === 'string' && config.currency !== ''
      ? config.currency.toUpperCase()
      : 'USD';
  }
  if (typeof config.placeholder === 'string') { resolved.placeholder = config.placeholder; }

  return resolved;
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

function dateTimeConfigRecord(rawConfig: unknown): Record<string, unknown> {
  return typeof rawConfig === 'object' && rawConfig !== null && !Array.isArray(rawConfig)
    ? rawConfig as Record<string, unknown>
    : {};
}

/**
 * Read pre-STB-4 date/time rows through the canonical config contract.
 * New authoring always writes `date_time`; the aliases remain readable until
 * STB-19 backfills stored artifacts and removes them from the enum.
 */
export function resolveDateTimeConfig(stepType: string, rawConfig: unknown): DateTimeConfig {
  const config = dateTimeConfigRecord(rawConfig);
  const configuredKind = config.kind;
  let kind: DateTimeConfig['kind'];

  if (configuredKind === 'date' || configuredKind === 'time' || configuredKind === 'datetime') {
    kind = configuredKind;
  } else if (stepType === 'date') {
    kind = 'date';
  } else if (stepType === 'time') {
    kind = 'time';
  } else if (config.showDate === false && config.showTime === true) {
    kind = 'time';
  } else if (config.showDate === true && config.showTime === false) {
    kind = 'date';
  } else {
    kind = 'datetime';
  }

  const resolved: DateTimeConfig = { kind };
  if (typeof config.minDate === 'string') { resolved.minDate = config.minDate; }
  if (typeof config.maxDate === 'string') { resolved.maxDate = config.maxDate; }
  if (typeof config.defaultToToday === 'boolean') { resolved.defaultToToday = config.defaultToToday; }

  const legacyFormat = config.format;
  const timeFormat = config.timeFormat
    ?? (legacyFormat === '12h' || legacyFormat === '24h' ? legacyFormat : undefined);
  if (timeFormat === '12h' || timeFormat === '24h') { resolved.timeFormat = timeFormat; }

  const timeStep = config.timeStep ?? config.step;
  if (typeof timeStep === 'number') { resolved.timeStep = timeStep; }
  return resolved;
}

// ============================================================================
// SPECIAL CONFIGS
// ============================================================================

// JsQuestionConfig is imported from ./steps
import { JsQuestionConfig } from "./steps";

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

export type FinalDocumentOutputFormat = 'docx' | 'pdf';

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
  outputFormats?: FinalDocumentOutputFormat[]; // Defaults to the caller's legacy DOCX/PDF choice
  redirectUrl?: string;       // URL to redirect to after finishing
  brandingColor?: string;     // Brand color for buttons
  customLinks?: Array<{
    label: string;
    url: string;
    style: 'button' | 'link';
  }>;
  documents: Array<{
    id: string;               // Unique ID for this document entry in the block
    documentId: string;       // Reference to uploaded template document
    alias: string;            // Short name for this document (e.g., "contract", "receipt")
    pinnedVersionId?: string | null; // Selected version of the template (GH-171)
    // LU-5: the same ConditionExpression language steps.visible_if /
    // pages.visible_if already use (28 operators, nested AND/OR groups),
    // evaluated directly by shared/conditionEvaluator.ts - not the flat
    // `{key, op}` LogicExpression this superseded. See EnhancedDocumentEngine.
    conditions?: ConditionExpression | null;  // Optional conditional logic for this document
    mapping?: {
      // Field mapping for document generation (Prompt 10; widened to
      // MappingBinding in GH-156 to support constant/formula/datavault
      // sources alongside the original step-variable binding).
      [docFieldName: string]: MappingBinding;
    };
  }>;
  deliveryDestinations?: DeliveryDestination[];
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
      // Map document fields/tabs to a value source (widened in GH-156, see
      // FinalBlockConfig.documents[].mapping above).
      [tabName: string]: MappingBinding;
    };
  }>;
  conditions?: ConditionExpression | null;  // Optional conditional logic (LU-5: unified language, see FinalBlockConfig.documents[].conditions)
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
// STRUCTURAL TYPES
// ============================================================================

// ListField/ConditionExpression come from ./conditions; the rendered-type set
// comes from ./runnerStepTypes so ListFieldQuestionType cannot go stale.
import type { ConditionExpression } from "./conditions";
import { RUNNER_RENDERED_STEP_TYPES } from "./runnerStepTypes";

const LIST_FIELD_EXCLUDED_STEP_TYPES = ["final_documents", "signature_block", "list"] as const;

function isListFieldQuestionType(
  type: (typeof RUNNER_RENDERED_STEP_TYPES)[number]
): type is Exclude<(typeof RUNNER_RENDERED_STEP_TYPES)[number], (typeof LIST_FIELD_EXCLUDED_STEP_TYPES)[number]> {
  return !(LIST_FIELD_EXCLUDED_STEP_TYPES as readonly string[]).includes(type);
}

/**
 * Question step types selectable inside a List field.
 *
 * Derived from RUNNER_RENDERED_STEP_TYPES (shared/types/runnerStepTypes.ts)
 * rather than hand-listed, so a newly rendered runner type becomes usable
 * inside a List with no change here — the hand-maintained `RepeaterFieldType`
 * of the retired `repeater` type went stale by doing exactly that (LIST-13).
 * `final_documents` and `signature_block` are excluded: neither has meaning
 * per-item inside a repeating list. `list` is excluded too (LIST-8, once the
 * runner started rendering it): nesting a List inside a List already has its
 * own dedicated `kind: "list"` field variant below — offering `type: "list"`
 * as a `kind: "question"` choice as well would be a second, bogus way to
 * express the same thing.
 */
export const LIST_FIELD_QUESTION_TYPES = RUNNER_RENDERED_STEP_TYPES.filter(isListFieldQuestionType);

/** Pre-STB-19 nested definitions remain readable but are not authorable. */
export const LEGACY_LIST_FIELD_QUESTION_TYPES = ["short_text", "long_text"] as const;

export const STORED_LIST_FIELD_QUESTION_TYPES = [
  ...LIST_FIELD_QUESTION_TYPES,
  ...LEGACY_LIST_FIELD_QUESTION_TYPES,
] as const;

export type ListFieldQuestionType = (typeof STORED_LIST_FIELD_QUESTION_TYPES)[number];

/** A field inside a List item. Recursive: a field may itself be a List. */
export type ListField =
  | {
    kind: "question";
    id: string;
    alias: string;
    type: ListFieldQuestionType;
    title: string;
    description?: string;
    required?: boolean;
    order: number;
    config?: StepConfig;
    visibleIf?: ConditionExpression;
  }
  | {
    kind: "list";
    id: string;
    alias: string;
    title: string;
    description?: string;
    order: number;
    list: ListConfig;
  };

/**
 * List Config
 * Nestable, repeating question. Stored in `step.config` for `type: 'list'`
 * steps. Replaced the non-nestable `repeater` type, removed in LIST-13.
 */
export interface ListConfig {
  fields: ListField[];
  minItems?: number;
  maxItems?: number;
  /** Renders each item's row label, e.g. "{firstName} {lastName}". */
  labelTemplate?: string;
  addButtonText?: string;      // default "Add item"
  allowReorder?: boolean;      // default false
  emptyStateText?: string;
}

/** Storage shape — one per list step, in step_values. Items carry stable ids. */
export interface ListValue {
  items: ListItem[];
}

export interface ListItem {
  itemId: string;                          // stable across reorder/rename
  values: Record<string, unknown>;         // keyed by field alias
  // a nested list field's value is itself a ListValue under its alias
}

/**
 * Storage → plain alias-keyed objects for documents and scripts.
 *
 * Strips `itemId`, keys by field alias, and recurses into nested list fields
 * to arbitrary depth, e.g.
 * `[{ name: 'Ava', dob: '2015-04-02', addresses: [{ street: '12 Oak St' }] }]`.
 * No server imports here — this is called from both shared/ validation and
 * the server document engine.
 */
export function projectListValue(
  value: ListValue | null | undefined,
  config: ListConfig
): Record<string, unknown>[] {
  if (!value?.items?.length) {
    return [];
  }
  return value.items.map((item) => projectListItem(item, config));
}

function projectListItem(item: ListItem, config: ListConfig): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of config.fields) {
    const raw = item.values[field.alias];
    projected[field.alias] =
      field.kind === "list" ? projectListValue(raw as ListValue | null | undefined, field.list) : raw;
  }
  return projected;
}

/**
 * Resolves `config.labelTemplate`'s `{alias}` syntax against one item's own
 * `values` — deliberately single-brace and item-scoped, unlike
 * DisplayBlock.tsx's `{{alias}}` interpolation against the whole-workflow
 * context (nothing there is reusable for this: different syntax, different
 * scope). Falls back when the template is unset or resolves blank (e.g. the
 * referenced field hasn't been answered yet).
 *
 * Lives in `shared/` (moved from the client's `listRuntime.ts` in LIST2-6) so
 * the document engine can resolve a list-bound choice value's label
 * server-side using the exact same logic the runner uses to display it.
 */
export function resolveItemLabel(item: ListItem, config: ListConfig, fallback: string): string {
  const template = config.labelTemplate?.trim();
  if (!template) {
    return fallback;
  }
  const resolved = template
    .replace(/\{([^}]+)\}/g, (_match, alias: string) => {
      const raw = item.values[alias.trim()];
      if (raw === null || raw === undefined || typeof raw === "object") {
        return "";
      }
      return String(raw);
    })
    .trim();
  return resolved || fallback;
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
  | ChoiceAdvancedConfig
  | NumberAdvancedConfig
  | MultiFieldConfig
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
  // Structural
  | ListConfig
  // Allow empty config
  | Record<string, never>
  | null
  | undefined;

/**
 * The configuration decision for every canonical stored step type.
 *
 * The exact-key constraint is intentional: extending
 * `CANONICAL_STEP_TYPES` without adding a config mapping fails type-check,
 * as does adding a mapping for a non-canonical identity. Several mappings
 * use today's Advanced config shape because the later family tickets will
 * converge the canonical stored name on that richer shape.
 */
type CanonicalStepConfig<Type extends CanonicalStepType> =
  Type extends "text" ? TextAdvancedConfig :
  Type extends "boolean" ? BooleanAdvancedConfig :
  Type extends "phone" ? PhoneConfig :
  Type extends "date_time" ? DateTimeConfig :
  Type extends "choice" ? ChoiceAdvancedConfig :
  Type extends "email" ? EmailConfig :
  Type extends "number" ? NumberCanonicalConfig :
  Type extends "scale" ? ScaleConfig :
  Type extends "website" ? WebsiteConfig :
  Type extends "address" ? AddressConfig :
  Type extends "multi_field" ? MultiFieldConfig :
  Type extends "display" ? DisplayConfig :
  Type extends "file_upload" ? FileUploadConfig :
  Type extends "list" ? ListConfig :
  Type extends "js_question" ? JsQuestionConfig :
  Type extends "computed" ? ComputedStepConfig :
  Type extends "final_documents" ? FinalBlockConfig :
  Type extends "signature_block" ? SignatureBlockConfig :
  never;

export type StepConfigByType = {
  [Type in CanonicalStepType]: CanonicalStepConfig<Type>;
};

type AssertNoUnmappedCanonicalStepTypes<Type extends never> = Type;

/** Type-check fails here if a canonical type resolves to no config decision. */
export type CanonicalStepConfigCoverage = AssertNoUnmappedCanonicalStepTypes<
  {
    [Type in CanonicalStepType]: [StepConfigByType[Type]] extends [never] ? Type : never;
  }[CanonicalStepType]
>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for Choice config
 */
export function isChoiceConfig(config: unknown): config is ChoiceAdvancedConfig {
  return (
    isObjectRecord(config) &&
    typeof config.display === 'string' &&
    typeof config.allowMultiple === 'boolean' &&
    Array.isArray(config.options)
  );
}

/**
 * Type guard for Multi-Field config
 */
export function isMultiFieldConfig(config: unknown): config is MultiFieldConfig {
  return (
    isObjectRecord(config) &&
    typeof config.layout === 'string' &&
    Array.isArray(config.fields) &&
    typeof config.storeAs === 'string'
  );
}

/**
 * Type guard for Address config
 */
export function isAddressConfig(config: unknown): config is AddressConfig {
  return (
    isObjectRecord(config) &&
    (config.country === 'US' || typeof config.country === 'string') &&
    Array.isArray(config.fields)
  );
}

/**
 * Type guard for Number/Currency config
 */
export function isNumberConfig(config: unknown): config is NumberConfig | NumberAdvancedConfig {
  return (
    isObjectRecord(config) &&
    (typeof config.min === 'number' ||
      typeof config.max === 'number' ||
      typeof config.step === 'number' ||
      typeof config.mode === 'string')
  );
}

/**
 * Type guard for DateTime config
 */
export function isDateTimeConfig(config: unknown): config is DateTimeConfig | DateConfig | TimeConfig | LegacyDateTimeConfig {
  return (
    isObjectRecord(config) &&
    (typeof config.kind === 'string' ||
      typeof config.minDate === 'string' ||
      typeof config.maxDate === 'string' ||
      typeof config.showDate === 'boolean')
  );
}

/**
 * Type guard for Signature Block config
 */
export function isSignatureBlockConfig(config: unknown): config is SignatureBlockConfig {
  return (
    isObjectRecord(config) &&
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
  storageKey: string;
  /** Freshly minted by the upload response; persisted values may omit it. */
  url?: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
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


export const LEGACY_STEP_ADAPTERS: Record<string, { canonicalType: string; resolveConfig: (type: string, config: unknown) => unknown }> = {
  short_text: { canonicalType: "text", resolveConfig: resolveTextConfig },
  long_text: { canonicalType: "text", resolveConfig: resolveTextConfig },
  number_advanced: { canonicalType: "number", resolveConfig: resolveNumberConfig },
  currency: { canonicalType: "number", resolveConfig: resolveNumberConfig },
  date: { canonicalType: "date_time", resolveConfig: resolveDateTimeConfig },
  time: { canonicalType: "date_time", resolveConfig: resolveDateTimeConfig },
  datetime: { canonicalType: "date_time", resolveConfig: resolveDateTimeConfig },
  datetime_unified: { canonicalType: "date_time", resolveConfig: resolveDateTimeConfig },
  yes_no: { canonicalType: "boolean", resolveConfig: resolveBooleanConfig },
  true_false: { canonicalType: "boolean", resolveConfig: resolveBooleanConfig },
  multiple_choice: { canonicalType: "choice", resolveConfig: (_, config) => config },
  radio: { canonicalType: "choice", resolveConfig: (_, config) => config },
  phone_advanced: { canonicalType: "phone", resolveConfig: (_, config) => config },
  email_advanced: { canonicalType: "email", resolveConfig: (_, config) => config },
  scale_advanced: { canonicalType: "scale", resolveConfig: (_, config) => config },
  website_advanced: { canonicalType: "website", resolveConfig: (_, config) => config },
  address_advanced: { canonicalType: "address", resolveConfig: (_, config) => config },
  display_advanced: { canonicalType: "display", resolveConfig: (_, config) => config },
  final: { canonicalType: "final_documents", resolveConfig: (_, config) => config },
  signature: { canonicalType: "signature_block", resolveConfig: (_, config) => config },
};

/** Adapt a pre-STB-19 row once at the read boundary, returning a canonical step. */
export function adaptLegacyStep<T extends { type: string; config?: unknown }>(step: T): T {
  const adapter = LEGACY_STEP_ADAPTERS[step.type];
  if (adapter === undefined) { return step; }
  return {
    ...step,
    type: adapter.canonicalType,
    config: adapter.resolveConfig(step.type, step.config),
  };
}
