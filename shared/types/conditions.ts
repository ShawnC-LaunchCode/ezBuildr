/**
 * Condition Expression Type Definitions
 *
 * Type-safe definitions for the visibility logic system.
 * Supports nested condition groups with AND/OR operators,
 * type-aware comparison operators, and variable/constant values.
 */

import { z } from "zod";

// =====================================================================
// STEP TYPES (mirrors schema.ts stepTypeEnum)
// =====================================================================

export type ConditionSupportedStepType =
  | "text"
  | "choice"
  | "boolean"
  | "computed"
  | "date_time"
  | "file_upload"
  | "js_question"
  | "list"
  | "number";

// =====================================================================
// OPERATORS
// =====================================================================

/**
 * All available comparison operators
 */
export type ComparisonOperator =
  // Equality
  | "equals"
  | "not_equals"
  // Text
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  // Numeric
  | "greater_than"
  | "less_than"
  | "greater_or_equal"
  | "less_or_equal"
  | "between"
  // Boolean shortcuts (no value needed)
  | "is_true"
  | "is_false"
  // Empty checks (no value needed)
  | "is_empty"
  | "is_not_empty"
  // Multi-select
  | "includes"
  | "not_includes"
  | "includes_all"
  | "includes_any"
  // Date Difference
  | "diff_days"
  | "diff_weeks"
  | "diff_months"
  | "diff_years"
  // Date Helpers
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after";

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = "AND" | "OR";

/**
 * Value source type
 */
export type ValueType = "constant" | "variable";

// =====================================================================
// OPERATOR CONFIGURATION BY STEP TYPE
// =====================================================================

export interface OperatorConfig {
  value: ComparisonOperator;
  label: string;
  needsValue: boolean;
  impliedValue?: unknown; // For operators like is_true/is_false
  valueType?: "text" | "number" | "boolean" | "date" | "choices" | "multi_choices";
  // Type of the second value input, when it differs from `valueType` (e.g. the
  // date-diff operators compare a date in `value` against a day/week/month/year
  // count in `value2`). Defaults to `valueType` when omitted (e.g. `between`).
  value2Type?: "text" | "number" | "boolean" | "date" | "choices" | "multi_choices";
  needsTwoValues?: boolean; // For 'between' and date-diff operators
}

/**
 * Operators available for each step type
 */
const IS_NOT_EMPTY_LABEL = "is not empty";

export const OPERATORS_BY_STEP_TYPE: Record<ConditionSupportedStepType, OperatorConfig[]> = {
  // Boolean type - simplified operators
  boolean: [
    { value: "is_true", label: "is Yes", needsValue: false, impliedValue: true },
    { value: "is_false", label: "is No", needsValue: false, impliedValue: false },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // Text
  text: [
    { value: "equals", label: "equals", needsValue: true, valueType: "text" },
    { value: "not_equals", label: "does not equal", needsValue: true, valueType: "text" },
    { value: "contains", label: "contains", needsValue: true, valueType: "text" },
    { value: "not_contains", label: "does not contain", needsValue: true, valueType: "text" },
    { value: "starts_with", label: "starts with", needsValue: true, valueType: "text" },
    { value: "ends_with", label: "ends with", needsValue: true, valueType: "text" },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // Number
  number: [
    { value: "equals", label: "equals", needsValue: true, valueType: "number" },
    { value: "not_equals", label: "does not equal", needsValue: true, valueType: "number" },
    { value: "greater_than", label: "is greater than", needsValue: true, valueType: "number" },
    { value: "less_than", label: "is less than", needsValue: true, valueType: "number" },
    { value: "greater_or_equal", label: "is greater than or equal to", needsValue: true, valueType: "number" },
    { value: "less_or_equal", label: "is less than or equal to", needsValue: true, valueType: "number" },
    { value: "between", label: "is between", needsValue: true, valueType: "number", needsTwoValues: true },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // Choice
  choice: [
    { value: "equals", label: "is", needsValue: true, valueType: "choices" },
    { value: "not_equals", label: "is not", needsValue: true, valueType: "choices" },
    { value: "includes", label: "includes", needsValue: true, valueType: "multi_choices" },
    { value: "not_includes", label: "does not include", needsValue: true, valueType: "multi_choices" },
    { value: "includes_all", label: "includes all of", needsValue: true, valueType: "multi_choices" },
    { value: "includes_any", label: "includes any of", needsValue: true, valueType: "multi_choices" },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // Date/time
  date_time: [
    { value: "equals", label: "is", needsValue: true, valueType: "date" },
    { value: "not_equals", label: "is not", needsValue: true, valueType: "date" },
    { value: "after", label: "is after", needsValue: true, valueType: "date" },
    { value: "before", label: "is before", needsValue: true, valueType: "date" },
    { value: "on_or_after", label: "is on or after", needsValue: true, valueType: "date" },
    { value: "on_or_before", label: "is on or before", needsValue: true, valueType: "date" },
    { value: "between", label: "is between", needsValue: true, valueType: "date", needsTwoValues: true },
    {
      value: "diff_days",
      label: "differs by N days from",
      needsValue: true,
      valueType: "date",
      value2Type: "number",
      needsTwoValues: true,
    },
    {
      value: "diff_weeks",
      label: "differs by N weeks from",
      needsValue: true,
      valueType: "date",
      value2Type: "number",
      needsTwoValues: true,
    },
    {
      value: "diff_months",
      label: "differs by N months from",
      needsValue: true,
      valueType: "date",
      value2Type: "number",
      needsTwoValues: true,
    },
    {
      value: "diff_years",
      label: "differs by N years from",
      needsValue: true,
      valueType: "date",
      value2Type: "number",
      needsTwoValues: true,
    },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // File upload - limited operators
  file_upload: [
    { value: "is_empty", label: "has no file", needsValue: false },
    { value: "is_not_empty", label: "has a file", needsValue: false },
  ],

  // Computed values - full operator set based on output type (fallback to text)
  computed: [
    { value: "equals", label: "equals", needsValue: true, valueType: "text" },
    { value: "not_equals", label: "does not equal", needsValue: true, valueType: "text" },
    { value: "contains", label: "contains", needsValue: true, valueType: "text" },
    { value: "not_contains", label: "does not contain", needsValue: true, valueType: "text" },
    { value: "greater_than", label: "is greater than", needsValue: true, valueType: "number" },
    { value: "less_than", label: "is less than", needsValue: true, valueType: "number" },
    { value: "greater_or_equal", label: "is greater than or equal to", needsValue: true, valueType: "number" },
    { value: "less_or_equal", label: "is less than or equal to", needsValue: true, valueType: "number" },
    { value: "is_true", label: "is true", needsValue: false, impliedValue: true },
    { value: "is_false", label: "is false", needsValue: false, impliedValue: false },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // JS Question - same as computed
  js_question: [
    { value: "equals", label: "equals", needsValue: true, valueType: "text" },
    { value: "not_equals", label: "does not equal", needsValue: true, valueType: "text" },
    { value: "contains", label: "contains", needsValue: true, valueType: "text" },
    { value: "greater_than", label: "is greater than", needsValue: true, valueType: "number" },
    { value: "less_than", label: "is less than", needsValue: true, valueType: "number" },
    { value: "is_true", label: "is true", needsValue: false, impliedValue: true },
    { value: "is_false", label: "is false", needsValue: false, impliedValue: false },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],

  // List - check top-level item count (cross-item references are LIST-B1, out of scope)
  list: [
    { value: "equals", label: "has count of", needsValue: true, valueType: "number" },
    { value: "greater_than", label: "has more than", needsValue: true, valueType: "number" },
    { value: "less_than", label: "has less than", needsValue: true, valueType: "number" },
    { value: "is_empty", label: "is empty", needsValue: false },
    { value: "is_not_empty", label: IS_NOT_EMPTY_LABEL, needsValue: false },
  ],
};
/**
 * Get operators for a given step type
 */
export function getOperatorsForStepType(stepType: ConditionSupportedStepType): OperatorConfig[] {
  return OPERATORS_BY_STEP_TYPE[stepType] ?? OPERATORS_BY_STEP_TYPE.text;
}

/**
 * Date conditions saved before the dedicated date operators (`after`, `before`,
 * `on_or_after`, `on_or_before`) were exposed here used the generic
 * numeric-comparison operators instead (`greater_than`, etc). The evaluator
 * treats both identically for date/datetime values (see
 * `shared/conditionEvaluator.ts`'s `toNumber`), so this fallback lets already
 * saved conditions keep resolving to a correct label and value input even
 * though the curated `date_time` operator list now only offers the dedicated
 * operator going forward.
 */
const LEGACY_OPERATOR_FALLBACK: Partial<Record<ComparisonOperator, ComparisonOperator>> = {
  greater_than: "after",
  less_than: "before",
  greater_or_equal: "on_or_after",
  less_or_equal: "on_or_before",
};

/**
 * Get operator config by value
 */
export function getOperatorConfig(
  stepType: ConditionSupportedStepType,
  operator: ComparisonOperator
): OperatorConfig | undefined {
  const operators = getOperatorsForStepType(stepType);
  const direct = operators.find((op) => op.value === operator);
  if (direct) {
    return direct;
  }
  const fallbackOperator = LEGACY_OPERATOR_FALLBACK[operator];
  return fallbackOperator ? operators.find((op) => op.value === fallbackOperator) : undefined;
}

// =====================================================================
// CONDITION EXPRESSION TYPES
// =====================================================================

/**
 * A condition evaluating a JavaScript script
 */
export interface ScriptCondition {
  type: "script";
  id: string;
  code: string;
  description?: string;
}

/**
 * A single condition comparing a variable to a value
 */
export interface Condition {
  type: "condition";
  id: string; // Unique ID for React keys and reordering
  variable: string; // Step alias or step ID
  operator: ComparisonOperator;
  value?: unknown; // The comparison value (not needed for is_empty, is_true, etc.)
  value2?: unknown; // Second value for 'between' operator
  valueType: ValueType; // 'constant' or 'variable' (reference another step)
}

/**
 * A group of conditions/groups combined with AND or OR
 */
export interface ConditionGroup {
  type: "group";
  id: string; // Unique ID for React keys and reordering
  operator: LogicalOperator;
  not?: boolean; // Negate the entire group result
  conditions: Array<Condition | ConditionGroup | ScriptCondition>; // Recursive for nesting
}

/**
 * Root expression stored in visibleIf fields
 * Can be null (always visible) or a condition group
 */
export type ConditionExpression = ConditionGroup | null;

// =====================================================================
// ZOD SCHEMAS FOR VALIDATION
// =====================================================================

export const comparisonOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_or_equal",
  "less_or_equal",
  "between",
  "is_true",
  "is_false",
  "is_empty",
  "is_not_empty",
  "includes",
  "not_includes",
  "includes_all",
  "includes_any",
  "diff_days",
  "diff_weeks",
  "diff_months",
  "diff_years",
  "before",
  "after",
  "on_or_before",
  "on_or_after",
]);

export const logicalOperatorSchema = z.enum(["AND", "OR"]);

export const valueTypeSchema = z.enum(["constant", "variable"]);

export const conditionSchema: z.ZodType<Condition> = z.object({
  type: z.literal("condition"),
  id: z.string(),
  variable: z.string().min(1, "Variable is required"),
  operator: comparisonOperatorSchema,
  value: z.unknown().optional(),
  value2: z.unknown().optional(),
  valueType: valueTypeSchema,
});

export const scriptConditionSchema: z.ZodType<ScriptCondition> = z.object({
  type: z.literal("script"),
  id: z.string(),
  code: z.string().min(1, "Script code is required"),
  description: z.string().optional(),
});

// Recursive schema for condition groups
export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    id: z.string(),
    operator: logicalOperatorSchema,
    not: z.boolean().optional(),
    conditions: z.array(z.union([conditionSchema, conditionGroupSchema, scriptConditionSchema])),
  })
);

export const conditionExpressionSchema: z.ZodType<ConditionExpression> = z
  .union([conditionGroupSchema, z.null()])
  .nullable();

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Generate a unique ID for conditions/groups
 */
export function generateConditionId(): string {
  return `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty condition
 */
export function createEmptyCondition(): Condition {
  return {
    type: "condition",
    id: generateConditionId(),
    variable: "",
    operator: "equals",
    value: "",
    valueType: "constant",
  };
}

/**
 * Create an empty condition group
 */
export function createEmptyGroup(operator: LogicalOperator = "AND"): ConditionGroup {
  return {
    type: "group",
    id: generateConditionId(),
    operator,
    conditions: [createEmptyCondition()],
  };
}

/**
 * Create initial expression (single group with one condition)
 */
export function createInitialExpression(): ConditionGroup {
  return createEmptyGroup("AND");
}

/**
 * Check if expression has any valid conditions
 */
export function hasValidConditions(expression: ConditionExpression): boolean {
  if (!expression) { return false; }

  function checkGroup(group: ConditionGroup): boolean {
    return group.conditions.some((item) => {
      if (item.type === "condition") {
        return item.variable && item.variable.length > 0;
      }
      if (item.type === "script") {
        return item.code && item.code.length > 0;
      }
      return checkGroup(item);
    });
  }

  return checkGroup(expression);
}

/**
 * Count total conditions in expression
 */
export function countConditions(expression: ConditionExpression): number {
  if (!expression) { return 0; }

  function countInGroup(group: ConditionGroup): number {
    return group.conditions.reduce((count, item) => {
      if (item.type === "condition" || item.type === "script") {
        return count + 1;
      }
      return count + countInGroup(item);
    }, 0);
  }

  return countInGroup(expression);
}

// =====================================================================
// VARIABLE INFO (for UI)
// =====================================================================

/**
 * Variable information for the UI dropdown
 */
export interface VariableInfo {
  id: string; // Step ID (used internally)
  alias: string | null; // Human-friendly alias
  label: string; // Display label (alias or title)
  title: string; // Step title
  type: ConditionSupportedStepType;
  pageId: string;
  pageTitle: string;
  choices?: Array<{ value: string; label: string }>; // For choice-based steps
}
