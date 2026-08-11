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
  allowMultiple: boolean;  // Enable multi-select
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
  config: Pick<ChoiceAdvancedConfig, 'display' | 'allowMultiple' | 'searchable'> | undefined | null,
  stepType?: string,
): ChoiceDisplay {
  if (stepType === 'multiple_choice') { return 'multiple'; }
  if (config?.allowMultiple === true || config?.display === 'multiple') { return 'multiple'; }
  if (config?.display === 'combobox') { return 'combobox'; }
  if (config?.display === 'dropdown') {
    return config.searchable === true ? 'combobox' : 'dropdown';
  }
  return 'radio';
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
    // sections.visible_if already use (28 operators, nested AND/OR groups),
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

export type ListFieldQuestionType = (typeof LIST_FIELD_QUESTION_TYPES)[number];

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
  // Structural
  | ListConfig
  // Allow empty config
  | Record<string, never>
  | null
  | undefined;

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
export function isAddressConfig(config: unknown): config is AddressConfig | AddressAdvancedConfig {
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
export function isDateTimeConfig(config: unknown): config is DateTimeUnifiedConfig | DateTimeConfig | LegacyDateTimeConfig {
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


