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

import { Type, AlignLeft, ToggleLeft, Phone, Mail, Globe, Calendar, Clock, CalendarClock, CircleDot, CheckSquare, ListChecks, Hash, DollarSign, Gauge, FileText, MapPin, Grid3x3, Code2, ListTree } from "lucide-react";

import type { ListConfig, StepConfig } from "@shared/types/stepConfigs";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Block Registry Entry
 * Defines a single block type and its properties
 */
export interface BlockRegistryEntry {
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
    type: "short_text",
    label: "Short Text",
    icon: Type,
    glyph: "T",
    description: "Single-line text input",
    category: "text",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({}),
  },
  {
    type: "long_text",
    label: "Long Text",
    icon: AlignLeft,
    glyph: "¶",
    description: "Multi-line text area",
    category: "text",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({}),
  },
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
    type: "yes_no",
    label: "Yes/No",
    icon: ToggleLeft,
    glyph: "Y/N",
    description: "Yes or No toggle",
    category: "boolean",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({
      trueLabel: "Yes",
      falseLabel: "No",
    }),
  },
  {
    type: "true_false",
    label: "True/False",
    icon: ToggleLeft,
    glyph: "T/F",
    description: "True or False toggle",
    category: "boolean",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({
      trueLabel: "True",
      falseLabel: "False",
    }),
  },
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
          type: "short_text",
          title: "Field 1",
          order: 0,
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
    type: "date",
    label: "Date",
    icon: Calendar,
    description: "Date picker",
    category: "datetime",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({
      defaultToToday: false,
    }),
  },
  {
    type: "time",
    label: "Time",
    icon: Clock,
    description: "Time picker",
    category: "datetime",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({
      format: "12h" as const,
      step: 15,
    }),
  },
  {
    type: "date_time",
    label: "Date/Time",
    icon: CalendarClock,
    description: "Combined date and time picker",
    category: "datetime",
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
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
    modes: { easy: true, advanced: false },
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
    modes: { easy: true, advanced: false },
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
    modes: { easy: true, advanced: true },
    createDefaultConfig: () => ({
      step: 1,
      allowDecimal: false,
    }),
  },
  {
    type: "currency",
    label: "Currency",
    icon: DollarSign,
    glyph: "$",
    description: "Currency input with formatting",
    category: "numeric",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({
      currency: "USD" as const,
      allowDecimal: true,
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
      allowHtml: false,
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get block registry entries filtered by mode
 */
export function getBlocksByMode(mode: "easy" | "advanced"): BlockRegistryEntry[] {
  return BLOCK_REGISTRY.filter((block) => block.modes[mode]);
}

/**
 * Get block registry entry by type
 */
export function getBlockByType(type: string): BlockRegistryEntry | undefined {
  return BLOCK_REGISTRY.find((block) => block.type === type);
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
