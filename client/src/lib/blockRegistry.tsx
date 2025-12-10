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

import {
  Type,
  AlignLeft,
  ToggleLeft,
  Phone,
  Mail,
  Globe,
  Calendar,
  Clock,
  CalendarClock,
  Circle,
  CheckSquare,
  Hash,
  DollarSign,
  Star,
  FileText,
  MapPin,
  Grid3x3,
  Code2,
  FileDown,
  PenTool,
} from "lucide-react";

import type { StepConfig } from "@/../../shared/types/stepConfigs";

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

  /** Icon component from lucide-react */
  icon: React.ComponentType<any>;

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
    description: "Single-line text input",
    category: "text",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({}),
  },
  {
    type: "long_text",
    label: "Long Text",
    icon: AlignLeft,
    description: "Multi-line text area",
    category: "text",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({}),
  },
  {
    type: "text",
    label: "Text",
    icon: Type,
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
  // VALIDATED INPUTS
  // -------------------------------------------------------------------------
  {
    type: "phone",
    label: "Phone Number",
    icon: Phone,
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
    label: "Radio",
    icon: Circle,
    description: "Single choice (radio buttons)",
    category: "choice",
    modes: { easy: true, advanced: false },
    createDefaultConfig: () => ({
      options: ["Option 1", "Option 2", "Option 3"],
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
      options: ["Option 1", "Option 2", "Option 3"],
    }),
  },
  {
    type: "choice",
    label: "Choice",
    icon: CheckSquare,
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
    icon: Star,
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
  // They are special section types added via "Add Section" menu
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
  validated: "Validated Inputs",
  datetime: "Date/Time",
  choice: "Choice Inputs",
  numeric: "Numeric Inputs",
  display: "Display",
  advanced: "Advanced",
  output: "Output & Completion", // Empty - final blocks are sections, not questions
};

/**
 * Category order for UI display
 */
export const CATEGORY_ORDER: BlockCategory[] = [
  "text",
  "boolean",
  "validated",
  "datetime",
  "choice",
  "numeric",
  "display",
  "advanced",
  // "output" omitted - no blocks in this category
];
