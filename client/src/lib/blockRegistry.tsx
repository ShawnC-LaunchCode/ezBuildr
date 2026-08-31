/**
 * Block Registry
 * Centralized registry for all block types available in the workflow builder
 *
 * This registry defines:
 * - Block types and their metadata (label, icon, description)
 * - Mode filtering (Easy vs Advanced)
 * - Default configuration generators
 * - Block categories for UI grouping
 *
 * @version 2.0.0 - Block System Overhaul
 * @date December 2025
 */

import { Type, AlignLeft, ToggleLeft, Phone, Mail, Globe, Calendar, Clock, CalendarClock, CircleDot, CheckSquare, ListChecks, Hash, DollarSign, Gauge, FileText, MapPin, Grid3x3, Code2, ListTree, Paperclip } from "lucide-react";

import type {
  CanonicalStepType,
  ListConfig,
  StepConfig,
  StepConfigByType,
} from "@shared/types/stepConfigs";
import type { StepType } from "@shared/types/workflow";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Block Registry Entry
 * Defines a single block type and its properties
 */
export interface BlockRegistryEntry {
  /** Stable palette identity; defaults to `type` for non-preset entries. */
  id?: string;

  /** Unique type identifier (stored in database) */
  type: string;

  /** Display label in UI */
  label: string;

  /** Icon component from lucide-react. Fallback when `glyph` is absent. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;

  /**
   * Short typographic mark shown instead of `icon` (e.g. "T", "@", "Y/N").
   *
   * Set this only where a canonical notation for the data actually exists AND
   * stays legible at ~8px — "@" for email, "#" for a number. Where no such
   * mark exists (a date, an address) the stroke icon reads better than a
   * forced abbreviation, so leave `glyph` unset. Keep to 3 characters; the
   * tile scales its type down as the glyph gets longer.
   */
  glyph?: string;

  /** Optional description/tooltip */
  description?: string;

  /** Category for grouping in UI */
  category: BlockCategory;

  /** Mode availability */
  modes: {
    easy: boolean;
    advanced: boolean;
  };

  /** Generate default config for this block type */
  createDefaultConfig: () => StepConfig;
}

/** Display metadata for a type or preset, independent from stored identity. */
export type QuestionTypePresentation = Pick<
  BlockRegistryEntry,
  "label" | "icon" | "glyph" | "category"
>;

/**
 * A palette-facing choice that is independent from its stored identity.
 *
 * `persistedType` remains explicit during the rollout so adding metadata
 * cannot silently change what existing builder actions write. Family tickets
 * will move those identities to `canonicalType` one vertical slice at a time.
 */
export interface QuestionPreset<Type extends CanonicalStepType = CanonicalStepType> {
  /** Stable UI identity; never used as a persisted step type. */
  id: string;
  label: string;
  /** Palette copy shown under the label. Preset data, not derived from `id`. */
  description: string;
  modes: {
    easy: boolean;
    advanced: boolean;
  };
  canonicalType: Type;
  persistedType: StepType;
  /**
   * Set by a family's canonicalization ticket, and the single gate for whether
   * this preset drives authoring: once true the preset — not a BLOCK_REGISTRY
   * entry — is the palette action, and stored rows of this family resolve their
   * presentation through the sibling discriminator.
   *
   * It is deliberately explicit rather than inferred from
   * `persistedType === canonicalType`, because some families already satisfy
   * that incidentally (`file_upload`) without having an authoring path yet.
   * `blockRegistry.test.ts` asserts the two agree wherever this is true.
   */
  canonicalized?: boolean;
  /** Optional preset-specific mark when several presets share one stored type. */
  presentation?: Omit<QuestionTypePresentation, "label">;
  createDefaultConfig: () => StepConfigByType[Type];
}

/**
 * Block Categories for UI grouping
 */
export type BlockCategory =
  | "text"
  | "boolean"
  | "structure"
  | "validated"
  | "datetime"
  | "choice"
  | "numeric"
  | "display"
  | "advanced"
  | "output";

// ============================================================================
// BLOCK REGISTRY
// ============================================================================

/**
 * Central registry of all block types
 * Organized by category for clarity
 */
export const BLOCK_REGISTRY: BlockRegistryEntry[] = [
  // -------------------------------------------------------------------------
  // TEXT INPUTS
  // -------------------------------------------------------------------------
  {
    type: "text",
    label: "Text",
    icon: Type,
    glyph: "T",
    description: "Unified text input (short/long)",
    category: "text",
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      variant: "short" as const,
    }),
  },

  // -------------------------------------------------------------------------
  // BOOLEAN INPUTS
  // -------------------------------------------------------------------------
  {
    type: "boolean",
    label: "Boolean",
    icon: ToggleLeft,
    glyph: "0/1",
    description: "Customizable boolean toggle",
    category: "boolean",
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      trueLabel: "Yes",
      falseLabel: "No",
      storeAsBoolean: true,
      displayStyle: "buttons" as const,
    }),
  },

  // -------------------------------------------------------------------------
  // STRUCTURE
  // -------------------------------------------------------------------------
  {
    type: "list",
    label: "List",
    icon: ListTree,
    description: "Repeating set of questions, nestable",
    category: "structure",
    modes: { easy: true, advanced: true },
    createDefaultConfig: (): ListConfig => ({
      fields: [
        {
          kind: "question",
          id: "field-1",
          alias: "field_1",
          type: "text",
          title: "Field 1",
          order: 0,
          config: { variant: "short" },
        },
      ],
    }),
  },

  // -------------------------------------------------------------------------
  // VALIDATED INPUTS
  // -------------------------------------------------------------------------
  {
    type: "phone",
    label: "Phone Number",
    icon: Phone,
    glyph: "+1",
    description: "Phone number with validation",
    category: "validated",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      format: "US" as const,
    }),
  },
  {
    type: "email",
    label: "Email",
    icon: Mail,
    glyph: "@",
    description: "Email address with validation",
    category: "validated",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      allowMultiple: false,
    }),
  },
  {
    type: "website",
    label: "Website",
    icon: Globe,
    description: "Website URL with validation",
    category: "validated",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      requireProtocol: false,
    }),
  },

  // -------------------------------------------------------------------------
  // DATE/TIME INPUTS
  // -------------------------------------------------------------------------
  {
    type: "date_time",
    label: "Date/Time",
    icon: CalendarClock,
    description: "Combined date and time picker",
    category: "datetime",
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      kind: "datetime" as const,
      timeFormat: "12h" as const,
      timeStep: 15,
    }),
  },

  // -------------------------------------------------------------------------
  // CHOICE INPUTS
  // -------------------------------------------------------------------------
  {
    type: "radio",
    label: "Single Select",
    icon: CircleDot,
    description: "Single choice (radio buttons)",
    category: "choice",
    modes: { easy: false, advanced: false },
    createDefaultConfig: () => ({
      options: [
        { id: "1", label: "Option 1" },
        { id: "2", label: "Option 2" },
        { id: "3", label: "Option 3" }
      ],
    }),
  },
  {
    type: "multiple_choice",
    label: "Multiple Choice",
    icon: CheckSquare,
    description: "Multiple selection (checkboxes)",
    category: "choice",
    modes: { easy: false, advanced: false },
    createDefaultConfig: () => ({
      options: [
        { id: "1", label: "Option 1" },
        { id: "2", label: "Option 2" },
        { id: "3", label: "Option 3" }
      ],
    }),
  },
  {
    type: "choice",
    label: "Choice",
    icon: ListChecks,
    description: "Unified choice (radio/dropdown/multiple)",
    category: "choice",
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      display: "radio" as const,
      allowMultiple: false,
      options: [
        { id: "opt1", label: "Option 1" },
        { id: "opt2", label: "Option 2" },
        { id: "opt3", label: "Option 3" },
      ],
    }),
  },

  // -------------------------------------------------------------------------
  // NUMERIC INPUTS
  // -------------------------------------------------------------------------
  {
    type: "number",
    label: "Number",
    icon: Hash,
    glyph: "#",
    description: "Numeric input",
    category: "numeric",
    // Easy authors the canonical type through the `easy.number` preset (STB-9);
    // this entry is the Advanced canonical editor, as `text` is for its family.
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      mode: "number" as const,
      validation: { step: 1 },
    }),
  },
  {
    type: "scale",
    label: "Rating Scale",
    icon: Gauge,
    description: "Rating scale (1-10 slider)",
    category: "numeric",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      min: 1,
      max: 10,
      step: 1,
      display: "slider" as const,
      showValue: true,
    }),
  },

  // -------------------------------------------------------------------------
  // DISPLAY & LAYOUT
  // -------------------------------------------------------------------------
  {
    type: "display",
    label: "Display Block",
    icon: FileText,
    description: "Markdown content display",
    category: "display",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      markdown: "",
    }),
  },
  {
    type: "address",
    label: "Address",
    icon: MapPin,
    description: "US address input (street, city, state, zip)",
    category: "validated",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      country: "US" as const,
      fields: ["street", "city", "state", "zip"] as const,
      requireAll: true,
    }),
  },

  // -------------------------------------------------------------------------
  // ADVANCED ONLY
  // -------------------------------------------------------------------------
  {
    type: "multi_field",
    label: "Multi-Field",
    icon: Grid3x3,
    description: "Grouped fields (name, contact, date range)",
    category: "advanced",
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      layout: "first_last" as const,
      fields: [
        { key: "first", label: "First Name", type: "text" as const, required: true },
        { key: "last", label: "Last Name", type: "text" as const, required: true },
      ],
      storeAs: "separate" as const,
    }),
  },
  {
    type: "js_question",
    label: "JS Block",
    icon: Code2,
    glyph: "{}",
    description: "JavaScript code execution",
    category: "advanced",
    modes: { easy: false, advanced: true },
    createDefaultConfig: () => ({
      display: "hidden" as const,
      code: "// Write your JavaScript code here\n// Use 'input' object to access step values\n// Call emit(value) to set the output\n\nconst result = {};\nemit(result);",
      inputKeys: [],
      outputKey: "computed_value",
      timeoutMs: 3000,
      helpText: "",
    }),
  },

  // -------------------------------------------------------------------------
  // OUTPUT & COMPLETION
  // -------------------------------------------------------------------------
  // NOTE: final_documents and signature_block are NOT questions/steps
  // They are special page types added via "Add Page" menu
  // Removed from registry to prevent confusion (Dec 9, 2025)
];

function defineQuestionPreset<Type extends CanonicalStepType>(
  preset: QuestionPreset<Type>,
): QuestionPreset<Type> {
  return preset;
}

const SHORT_TEXT_PRESET_PRESENTATION = {
  icon: Type,
  glyph: "T",
  category: "text",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const LONG_TEXT_PRESET_PRESENTATION = {
  icon: AlignLeft,
  glyph: "¶",
  category: "text",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const YES_NO_PRESET_PRESENTATION = {
  icon: ToggleLeft,
  glyph: "Y/N",
  category: "boolean",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const TRUE_FALSE_PRESET_PRESENTATION = {
  icon: ToggleLeft,
  glyph: "T/F",
  category: "boolean",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const DATE_PRESET_PRESENTATION = {
  icon: Calendar,
  category: "datetime",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const TIME_PRESET_PRESENTATION = {
  icon: Clock,
  category: "datetime",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const DATE_TIME_PRESET_PRESENTATION = {
  icon: CalendarClock,
  category: "datetime",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const SINGLE_SELECT_PRESET_PRESENTATION = {
  icon: CircleDot,
  category: "choice",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const MULTIPLE_CHOICE_PRESET_PRESENTATION = {
  icon: CheckSquare,
  category: "choice",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const CURRENCY_PRESET_PRESENTATION = {
  icon: DollarSign,
  glyph: "$",
  category: "numeric",
} as const satisfies Omit<QuestionTypePresentation, "label">;

const FILE_UPLOAD_PRESET_PRESENTATION = {
  icon: Paperclip,
  category: "validated",
} as const satisfies Omit<QuestionTypePresentation, "label">;

/**
 * Friendly Easy-mode choices described independently from BLOCK_REGISTRY.
 *
 * Each family remains additive metadata until its canonical-family ticket
 * switches the relevant creation path. STB-3 routes the text presets through
 * the builder; later family tickets do the same for their own presets.
 */
export const QUESTION_PRESETS = [
  defineQuestionPreset({
    id: "easy.short-text",
    label: "Short Text",
    description: "Single-line text input",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "text",
    persistedType: "text",
    presentation: SHORT_TEXT_PRESET_PRESENTATION,
    createDefaultConfig: () => ({ variant: "short" }),
  }),
  defineQuestionPreset({
    id: "easy.long-text",
    label: "Long Text",
    description: "Multi-line text area",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "text",
    persistedType: "text",
    presentation: LONG_TEXT_PRESET_PRESENTATION,
    createDefaultConfig: () => ({ variant: "long" }),
  }),
  defineQuestionPreset({
    id: "easy.yes-no",
    label: "Yes/No",
    description: "Yes or no choice",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "boolean",
    persistedType: "boolean",
    presentation: YES_NO_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      trueLabel: "Yes",
      falseLabel: "No",
      storeAsBoolean: true,
      displayStyle: "buttons",
    }),
  }),
  defineQuestionPreset({
    id: "easy.true-false",
    label: "True/False",
    description: "True or false choice",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "boolean",
    persistedType: "boolean",
    presentation: TRUE_FALSE_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      trueLabel: "True",
      falseLabel: "False",
      storeAsBoolean: true,
      displayStyle: "buttons",
    }),
  }),
  defineQuestionPreset({
    id: "easy.date",
    label: "Date",
    description: "Calendar date",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "date_time",
    persistedType: "date_time",
    presentation: DATE_PRESET_PRESENTATION,
    createDefaultConfig: () => ({ kind: "date", defaultToToday: false }),
  }),
  defineQuestionPreset({
    id: "easy.time",
    label: "Time",
    description: "Time of day",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "date_time",
    persistedType: "date_time",
    presentation: TIME_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      kind: "time",
      timeFormat: "12h",
      timeStep: 15,
    }),
  }),
  defineQuestionPreset({
    id: "easy.date-time",
    label: "Date/Time",
    description: "Date and time together",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "date_time",
    persistedType: "date_time",
    presentation: DATE_TIME_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      kind: "datetime",
      timeFormat: "12h",
      timeStep: 15,
    }),
  }),
  defineQuestionPreset({
    id: "easy.single-select",
    label: "Single Select",
    description: "Pick exactly one option",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "choice",
    persistedType: "choice",
    presentation: SINGLE_SELECT_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      display: "radio",
      layout: "vertical",
      options: {
        type: "static",
        options: [
          { id: "1", label: "Option 1", alias: "Option 1" },
          { id: "2", label: "Option 2", alias: "Option 2" },
          { id: "3", label: "Option 3", alias: "Option 3" },
        ],
      },
    }),
  }),
  defineQuestionPreset({
    id: "easy.multiple-choice",
    label: "Multiple Choice",
    description: "Pick one or more options",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "choice",
    persistedType: "choice",
    presentation: MULTIPLE_CHOICE_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      display: "multiple",
      layout: "vertical",
      options: {
        type: "static",
        options: [
          { id: "1", label: "Option 1", alias: "Option 1" },
          { id: "2", label: "Option 2", alias: "Option 2" },
          { id: "3", label: "Option 3", alias: "Option 3" },
        ],
      },
    }),
  }),
  defineQuestionPreset({
    id: "easy.number",
    label: "Number",
    description: "Plain number input",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "number",
    persistedType: "number",
    createDefaultConfig: () => ({
      mode: "number",
      validation: { step: 1 },
    }),
  }),
  defineQuestionPreset({
    id: "easy.currency",
    label: "Currency",
    description: "Money amount",
    canonicalized: true,
    modes: { easy: true, advanced: false },
    canonicalType: "number",
    persistedType: "number",
    presentation: CURRENCY_PRESET_PRESENTATION,
    createDefaultConfig: () => ({
      mode: "currency_decimal",
      currency: "USD",
      thousandsSeparator: true,
    }),
  }),
  defineQuestionPreset({
    id: "easy.file-upload",
    label: "File Upload",
    description: "File attachment",
    canonicalized: true,
    modes: { easy: true, advanced: true },
    canonicalType: "file_upload",
    persistedType: "file_upload",
    presentation: FILE_UPLOAD_PRESET_PRESENTATION,
    createDefaultConfig: () => ({ maxFiles: 1 }),
  }),
] as const satisfies readonly QuestionPreset[];

export function getQuestionPresetPresentation(
  preset: QuestionPreset,
): QuestionTypePresentation {
  const presentation = preset.presentation;
  if (presentation === undefined) {
    const registered = getBlockByType(preset.persistedType);
    if (registered === undefined) {
      throw new Error(`No presentation registered for question preset "${preset.id}"`);
    }
    return registered;
  }
  return { label: preset.label, ...presentation };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get block registry entries filtered by mode
 */
/** A canonicalized preset rendered as a palette action. */
function toPaletteEntry(preset: QuestionPreset): BlockRegistryEntry {
  return {
    id: preset.id,
    type: preset.persistedType,
    ...getQuestionPresetPresentation(preset),
    description: preset.description,
    modes: preset.modes,
    createDefaultConfig: preset.createDefaultConfig,
  };
}

/**
 * Get block registry entries filtered by mode.
 *
 * This names no step type and no preset id: a family joins the palette purely
 * by setting `canonicalized` on its own presets, which is the edit its own
 * ticket already makes. That is what lets STB-4..STB-10 run as parallel lanes
 * without contending over this function.
 */
export function getBlocksByMode(mode: "easy" | "advanced"): BlockRegistryEntry[] {
  const registered = BLOCK_REGISTRY.filter((block) => block.modes[mode]);
  const presets = QUESTION_PRESETS
    .filter((preset) => preset.canonicalized === true && preset.modes[mode])
    .map(toPaletteEntry);

  return [...presets, ...registered];
}

/**
 * Get block registry entry by type
 */
export function getBlockByType(type: string): BlockRegistryEntry | undefined {
  return BLOCK_REGISTRY.find((block) => block.type === type);
}

/**
 * Temporary display compatibility for stored rows awaiting STB-19.
 *
 * These aliases deliberately do not participate in BLOCK_REGISTRY or any
 * authoring lookup. They only keep legacy rows recognizable in builder UI.
 */
const LEGACY_TYPE_PRESENTATIONS: Readonly<Record<string, QuestionTypePresentation>> = {
  short_text: { label: "Short Text", ...SHORT_TEXT_PRESET_PRESENTATION },
  long_text: { label: "Long Text", ...LONG_TEXT_PRESET_PRESENTATION },
  yes_no: { label: "Yes/No", ...YES_NO_PRESET_PRESENTATION },
  true_false: { label: "True/False", ...TRUE_FALSE_PRESET_PRESENTATION },
  date: { label: "Date", ...DATE_PRESET_PRESENTATION },
  time: { label: "Time", ...TIME_PRESET_PRESENTATION },
  datetime: { label: "Date/Time", ...DATE_TIME_PRESET_PRESENTATION },
  datetime_unified: { label: "Date/Time", ...DATE_TIME_PRESET_PRESENTATION },
  currency: { label: "Currency", ...CURRENCY_PRESET_PRESENTATION },
};

function isConfigRecord(config: unknown): config is Readonly<Record<string, unknown>> {
  return typeof config === "object" && config !== null && !Array.isArray(config);
}

function isScalarDiscriminator(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/**
 * Resolve a stored canonical row to the preset whose discriminator it carries.
 *
 * Discriminator keys are inferred from scalar defaults that uniquely distinguish
 * every sibling preset in the same canonical family. That keeps presentation
 * coupled to QUESTION_PRESETS as new families canonicalize, without rebuilding
 * their variant/kind/style switches in the display layer.
 */
interface FamilyDiscriminators {
  presentations: readonly QuestionTypePresentation[];
  defaults: readonly Readonly<Record<string, unknown>>[];
  keys: readonly string[];
}

/**
 * Discriminator scan per canonical family, computed once.
 *
 * `QUESTION_PRESETS` is a module constant, so the scan — and the
 * `createDefaultConfig()` allocations it makes per sibling — is static. It
 * previously ran on every icon render.
 */
const FAMILY_DISCRIMINATORS: ReadonlyMap<string, FamilyDiscriminators> = (() => {
  const byType = new Map<string, FamilyDiscriminators>();

  for (const canonicalType of new Set(QUESTION_PRESETS.map((preset) => preset.canonicalType))) {
    const family = QUESTION_PRESETS.filter(
      (preset) => preset.canonicalized === true && preset.canonicalType === canonicalType,
    );
    if (family.length < 2) { continue; }

    const defaults = family.map(
      (preset) => preset.createDefaultConfig() as Readonly<Record<string, unknown>>,
    );
    const keys = Object.keys(defaults[0]).filter((key) => {
      const values = defaults.map((defaultConfig) => defaultConfig[key]);
      return values.every(isScalarDiscriminator) && new Set(values).size === family.length;
    });
    if (keys.length === 0) { continue; }

    byType.set(canonicalType, {
      presentations: family.map(getQuestionPresetPresentation),
      defaults,
      keys,
    });
  }

  return byType;
})();

function getStoredPresetPresentation(
  type: string,
  config: unknown,
): QuestionTypePresentation | undefined {
  if (!isConfigRecord(config)) { return undefined; }

  const family = FAMILY_DISCRIMINATORS.get(type);
  if (!family) { return undefined; }

  const matches = new Set<number>();
  for (const key of family.keys) {
    const matchingIndex = family.defaults.findIndex(
      (defaultConfig) => Object.is(defaultConfig[key], config[key]),
    );
    if (matchingIndex !== -1) { matches.add(matchingIndex); }
  }

  if (matches.size !== 1) { return undefined; }
  const [matchingIndex] = matches;
  return family.presentations[matchingIndex];
}

export function getQuestionTypePresentation(
  type: string,
  config?: unknown,
): QuestionTypePresentation | undefined {
  return getStoredPresetPresentation(type, config)
    ?? getBlockByType(type)
    ?? LEGACY_TYPE_PRESENTATIONS[type];
}

/**
 * Get blocks grouped by category for a specific mode
 */
export function getBlocksByCategory(
  mode: "easy" | "advanced"
): Record<BlockCategory, BlockRegistryEntry[]> {
  const blocks = getBlocksByMode(mode);
  const grouped: Record<string, BlockRegistryEntry[]> = {};

  for (const block of blocks) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!grouped[block.category]) {
      grouped[block.category] = [];
    }
    grouped[block.category].push(block);
  }

  return grouped as Record<BlockCategory, BlockRegistryEntry[]>;
}

/**
 * Category labels for UI display
 */
export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  text: "Text Inputs",
  boolean: "Boolean Inputs",
  structure: "Structure",
  validated: "Validated Inputs",
  datetime: "Date/Time",
  choice: "Choice Inputs",
  numeric: "Numeric Inputs",
  display: "Display",
  advanced: "Advanced",
  output: "Output & Completion", // Empty - final blocks are pages, not questions
};

/**
 * Category order for UI display.
 *
 * QuestionAddMenu splits this (mode-filtered) list into two columns by
 * even/odd index, so position matters for balance, not just grouping.
 * "structure" sits right after "boolean" deliberately: with the current
 * block counts that placement lands 9 easy-mode items and 7 advanced-mode
 * items per column (both sides even) — verified by hand when this was
 * added (LIST-5). Re-check both modes' column balance before moving it or
 * adding/removing blocks from the categories in between.
 */
export const CATEGORY_ORDER: BlockCategory[] = [
  "text",
  "boolean",
  "structure",
  "validated",
  "datetime",
  "choice",
  "numeric",
  "display",
  "advanced",
  // "output" omitted - no blocks in this category
];
