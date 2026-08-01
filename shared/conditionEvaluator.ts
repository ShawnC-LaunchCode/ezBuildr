/**
 * Condition Expression Evaluator
 *
 * Evaluates visibility conditions against workflow run data.
 * Supports nested groups, all comparison operators, and variable references.
 */

import type {
  Condition,
  ConditionGroup,
  ConditionExpression,
  ComparisonOperator,
} from "./types/conditions";

// =====================================================================
// TYPES
// =====================================================================

/**
 * Data map containing step values
 * Keys can be step IDs or step aliases
 */
export type DataMap = Record<string, unknown>;

/**
 * Alias resolver function - converts step alias to step ID
 */
export type AliasResolver = (aliasOrId: string) => string | undefined;

/**
 * Evaluation result with debugging info
 */
export interface EvaluationResult {
  visible: boolean;
  reason?: string;
  evaluatedConditions?: number;
}

// =====================================================================
// MAIN EVALUATION FUNCTION
// =====================================================================

/**
 * Evaluate a condition expression against data
 *
 * @param expression - The condition expression to evaluate
 * @param data - Map of step values (by ID or alias)
 * @param aliasResolver - Optional function to resolve aliases to IDs
 * @returns Whether the condition is satisfied (element should be visible)
 */
export function evaluateConditionExpression(
  expression: ConditionExpression,
  data: DataMap,
  aliasResolver?: AliasResolver
): boolean {
  // Null expression means always visible
  if (!expression) {
    return true;
  }

  try {
    return evaluateGroup(expression, data, aliasResolver);
  } catch (error) {
    console.error("[conditionEvaluator] Failed to evaluate condition expression", error);
    return false;
  }
}

/**
 * Evaluate with detailed result
 */
export function evaluateConditionExpressionWithDetails(
  expression: ConditionExpression,
  data: DataMap,
  aliasResolver?: AliasResolver
): EvaluationResult {
  if (!expression) {
    return { visible: true, reason: "No conditions defined" };
  }

  let evaluatedCount = 0;

  function evaluateGroupDetailed(group: ConditionGroup): boolean {
    const results = group.conditions.map((item) => {
      if (item.type === "condition") {
        evaluatedCount++;
        return evaluateSingleCondition(item, data, aliasResolver);
      }
      if (item.type === "group") {
        return evaluateGroupDetailed(item);
      }
      console.warn("[conditionEvaluator] Script conditions are not supported in visibility evaluation");
      return false;
    });

    const groupResult = group.operator === "AND"
      ? results.every((r) => r)
      : results.some((r) => r);

    return group.not ? !groupResult : groupResult;
  }

  let visible = false;
  try {
    visible = evaluateGroupDetailed(expression);
  } catch (error) {
    console.error("[conditionEvaluator] Failed to evaluate condition expression", error);
    visible = false;
  }

  return {
    visible,
    reason: visible ? "Conditions satisfied" : "Conditions not satisfied",
    evaluatedConditions: evaluatedCount,
  };
}

// =====================================================================
// ALIAS RENAME PROPAGATION
// =====================================================================

/**
 * Rewrite every reference to `oldAlias` inside a condition expression tree to
 * `newAlias` — both the `variable` a condition compares, and `value`/`value2`
 * when `valueType` is `"variable"` (a reference to another step). Constants
 * and references to other aliases are left untouched.
 *
 * Returns the same object reference when nothing changed — including when
 * `expression` is `null`/empty or isn't a recognizable `ConditionGroup` shape
 * (e.g. a legacy string-form expression, or malformed jsonb) — so callers can
 * cheaply detect "no update needed" with `!==` before writing back to the DB.
 */
export function renameAliasInExpression(
  expression: ConditionExpression,
  oldAlias: string,
  newAlias: string
): ConditionExpression {
  if (!expression || expression.type !== "group" || !Array.isArray(expression.conditions)) {
    return expression;
  }
  return renameInGroup(expression, oldAlias, newAlias);
}

function renameInGroup(
  group: ConditionGroup,
  oldAlias: string,
  newAlias: string
): ConditionGroup {
  let changed = false;
  const conditions = group.conditions.map((item) => {
    if (item.type === "condition") {
      const renamed = renameInCondition(item, oldAlias, newAlias);
      if (renamed !== item) { changed = true; }
      return renamed;
    }
    if (item.type === "group") {
      const renamed = renameInGroup(item, oldAlias, newAlias);
      if (renamed !== item) { changed = true; }
      return renamed;
    }
    // Script conditions don't reference aliases through `variable`/`value`.
    return item;
  });

  return changed ? { ...group, conditions } : group;
}

function renameInCondition(
  condition: Condition,
  oldAlias: string,
  newAlias: string
): Condition {
  const variableMatches = condition.variable === oldAlias;
  const valueMatches =
    condition.valueType === "variable" &&
    typeof condition.value === "string" &&
    condition.value === oldAlias;
  const value2Matches =
    condition.valueType === "variable" &&
    typeof condition.value2 === "string" &&
    condition.value2 === oldAlias;

  if (!variableMatches && !valueMatches && !value2Matches) {
    return condition;
  }

  return {
    ...condition,
    variable: variableMatches ? newAlias : condition.variable,
    value: valueMatches ? newAlias : condition.value,
    value2: value2Matches ? newAlias : condition.value2,
  };
}

// =====================================================================
// INTERNAL EVALUATION FUNCTIONS
// =====================================================================

/**
 * Evaluate a condition group (recursive)
 */
function evaluateGroup(
  group: ConditionGroup,
  data: DataMap,
  aliasResolver?: AliasResolver
): boolean {
  if (group.conditions.length === 0) {
    // Empty group is always true
    return true;
  }

  const results = group.conditions.map((item) => {
    if (item.type === "condition") {
      return evaluateSingleCondition(item, data, aliasResolver);
    }
    if (item.type === "group") {
      // Recursively evaluate nested group
      return evaluateGroup(item, data, aliasResolver);
    }
    // Script conditions - not yet implemented, equivalent to false/hidden for safety
    console.warn("[conditionEvaluator] Script conditions are not supported in visibility evaluation");
    return false;
  });

  const groupResult = group.operator === "AND"
    ? results.every((r) => r)
    : results.some((r) => r);

  return group.not ? !groupResult : groupResult;
}

/**
 * Evaluate a single condition
 */
function evaluateSingleCondition(
  condition: Condition,
  data: DataMap,
  aliasResolver?: AliasResolver
): boolean {
  // Conditions without a selected variable are malformed. Hide the target.
  if (!condition.variable) {
    console.warn("[conditionEvaluator] Condition is missing a variable");
    return false;
  }

  // Resolve the variable to get the actual value
  const variableKey = resolveVariable(condition.variable, aliasResolver);
  const actualValue = getValueByPath(data, variableKey);

  // Get the comparison value
  let compareValue: unknown = condition.value;
  let compareValue2: unknown = condition.value2;

  // If valueType is 'variable', resolve the comparison value from data
  if (condition.valueType === "variable" && typeof condition.value === "string") {
    const resolvedKey = resolveVariable(condition.value, aliasResolver);
    compareValue = getValueByPath(data, resolvedKey);
  }

  if (condition.valueType === "variable" && typeof condition.value2 === "string") {
    const resolvedKey = resolveVariable(condition.value2, aliasResolver);
    compareValue2 = getValueByPath(data, resolvedKey);
  }

  return evaluateOperator(condition.operator, actualValue, compareValue, compareValue2);
}

/**
 * Resolve a variable name to its key in the data map
 */
function resolveVariable(
  aliasOrId: string,
  aliasResolver?: AliasResolver
): string {
  if (aliasResolver) {
    return aliasResolver(aliasOrId) ?? aliasOrId;
  }
  return aliasOrId;
}

// =====================================================================
// OPERATOR EVALUATION
// =====================================================================

/**
 * Evaluate a comparison operator
 */
// eslint-disable-next-line complexity -- operator dispatch table
function evaluateOperator(
  operator: ComparisonOperator,
  actualValue: unknown,
  compareValue: unknown,
  compareValue2?: unknown
): boolean {
  switch (operator) {
    // Equality
    case "equals":
      return isEqual(actualValue, compareValue);

    case "not_equals":
      return !isEqual(actualValue, compareValue);

    // Text operations
    case "contains":
      return toString(actualValue).toLowerCase().includes(toString(compareValue).toLowerCase());

    case "not_contains":
      return !toString(actualValue).toLowerCase().includes(toString(compareValue).toLowerCase());

    case "starts_with":
      return toString(actualValue).toLowerCase().startsWith(toString(compareValue).toLowerCase());

    case "ends_with":
      return toString(actualValue).toLowerCase().endsWith(toString(compareValue).toLowerCase());

    // Numeric comparisons. Fail closed when the answer (or threshold) is empty
    // or non-numeric: an unanswered field must NOT satisfy `age < 18` etc.
    // `toComparableNumber` returns null for null/undefined/""/unparseable (but
    // still handles numeric and date strings), so the condition only fires once
    // a real value has been entered — matching the logic_rules engine (which
    // early-returns false on null/undefined).
    case "greater_than": {
      const a = toComparableNumber(actualValue);
      const b = toComparableNumber(compareValue);
      return a !== null && b !== null && a > b;
    }

    case "less_than": {
      const a = toComparableNumber(actualValue);
      const b = toComparableNumber(compareValue);
      return a !== null && b !== null && a < b;
    }

    case "greater_or_equal": {
      const a = toComparableNumber(actualValue);
      const b = toComparableNumber(compareValue);
      return a !== null && b !== null && a >= b;
    }

    case "less_or_equal": {
      const a = toComparableNumber(actualValue);
      const b = toComparableNumber(compareValue);
      return a !== null && b !== null && a <= b;
    }

    case "between": {
      const num = toComparableNumber(actualValue);
      const min = toComparableNumber(compareValue);
      const max = toComparableNumber(compareValue2);
      return num !== null && min !== null && max !== null && num >= min && num <= max;
    }

    // Date comparisons
    case "before":
      return compareDates(actualValue, compareValue, (actual, compare) => actual < compare);

    case "after":
      return compareDates(actualValue, compareValue, (actual, compare) => actual > compare);

    case "on_or_before":
      return compareDates(actualValue, compareValue, (actual, compare) => actual <= compare);

    case "on_or_after":
      return compareDates(actualValue, compareValue, (actual, compare) => actual >= compare);

    case "diff_days":
      return evaluateDateDifference(actualValue, compareValue, compareValue2, "days");

    case "diff_weeks":
      return evaluateDateDifference(actualValue, compareValue, compareValue2, "weeks");

    case "diff_months":
      return evaluateDateDifference(actualValue, compareValue, compareValue2, "months");

    case "diff_years":
      return evaluateDateDifference(actualValue, compareValue, compareValue2, "years");

    // Boolean shortcuts
    case "is_true":
      return toBoolean(actualValue) === true;

    case "is_false":
      return toBoolean(actualValue) === false;

    // Empty checks
    case "is_empty":
      return isEmpty(actualValue);

    case "is_not_empty":
      return !isEmpty(actualValue);

    // Array/multi-select operations
    case "includes":
      return toArray(actualValue).some((v) => isEqual(v, compareValue));

    case "not_includes":
      return !toArray(actualValue).some((v) => isEqual(v, compareValue));

    case "includes_all": {
      const requiredAll = toArray(compareValue);
      const actualArr = toArray(actualValue);
      return requiredAll.every((req) => actualArr.some((act) => isEqual(act, req)));
    }

    case "includes_any": {
      const requiredAny = toArray(compareValue);
      const actualArrAny = toArray(actualValue);
      return requiredAny.some((req) => actualArrAny.some((act) => isEqual(act, req)));
    }

    default:
      console.warn("[conditionEvaluator] Unknown operator");
      return false;
  }
}

// =====================================================================
// TYPE CONVERSION HELPERS
// =====================================================================

/**
 * Check if two values are equal (with type coercion)
 */
// eslint-disable-next-line complexity -- multi-type equality requires branching
function isEqual(a: unknown, b: unknown): boolean {
  // Handle null/undefined
  if ((a === null || a === undefined) && (b === null || b === undefined)) {return true;}
  if (a === null || a === undefined || b === null || b === undefined) {return false;}

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {return false;}
    return a.every((val, idx) => isEqual(val, b[idx]));
  }

  // Handle objects
  if (typeof a === "object" && typeof b === "object") {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) {return false;}
    return keysA.every((key) => isEqual(objA[key], objB[key]));
  }

  // String comparison (case-insensitive for strings)
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase() === b.toLowerCase();
  }

  // Boolean handling - "true"/"false" strings
  if (typeof a === "boolean" || typeof b === "boolean") {
    return toBoolean(a) === toBoolean(b);
  }

  // Numeric comparison
  if (!isNaN(Number(a)) && !isNaN(Number(b))) {
    return Number(a) === Number(b);
  }

  // Fallback to strict equality
  return a === b;
}

/**
 * Convert value to string
 */
function toString(value: unknown): string {
  if (value === null || value === undefined) {return "";}
  if (typeof value === "string") {return value;}
  if (typeof value === "object") {return JSON.stringify(value);}
  return String(value);
}

/**
 * Convert value to number
 */

function toNumber(value: unknown): number {
  if (value === null || value === undefined) {return 0;}
  if (typeof value === "number") {return value;}
  if (typeof value === "string") {
    // Handle date strings
    if (value.includes("-") || value.includes("/")) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
  if (typeof value === "boolean") {return value ? 1 : 0;}
  if (value instanceof Date) {return value.getTime();}
  return 0;
}

/**
 * Like {@link toNumber} (handles numeric strings, ISO date strings → epoch ms,
 * booleans, Date), but returns `null` — instead of `0` — for unanswered/empty
 * or unparseable input. Numeric comparison operators use this so an empty field
 * fails the comparison rather than silently reading as 0.
 */
function toComparableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") { return null; }
  if (typeof value === "number") { return Number.isFinite(value) ? value : null; }
  if (typeof value === "string") {
    if (value.includes("-") || value.includes("/")) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) { return date.getTime(); }
    }
    const num = parseFloat(value);
    return Number.isNaN(num) ? null : num;
  }
  if (typeof value === "boolean") { return value ? 1 : 0; }
  if (value instanceof Date) { const t = value.getTime(); return Number.isNaN(t) ? null : t; }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numberValue = typeof value === "string" ? Number(value) : toNumber(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toDateMs(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

function compareDates(
  actualValue: unknown,
  compareValue: unknown,
  predicate: (actual: number, compare: number) => boolean
): boolean {
  const actualDate = toDateMs(actualValue);
  const compareDate = toDateMs(compareValue);

  if (actualDate === null || compareDate === null) {
    return false;
  }

  return predicate(actualDate, compareDate);
}

function evaluateDateDifference(
  actualValue: unknown,
  compareValue: unknown,
  expectedDifference: unknown,
  unit: "days" | "weeks" | "months" | "years"
): boolean {
  const actualDate = toDateMs(actualValue);
  const compareDate = toDateMs(compareValue);
  const expected = toFiniteNumber(expectedDifference);

  if (actualDate === null || compareDate === null || expected === null) {
    return false;
  }

  return getDateDifference(actualDate, compareDate, unit) === expected;
}

function getDateDifference(
  actualDate: number,
  compareDate: number,
  unit: "days" | "weeks" | "months" | "years"
): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(Math.abs(actualDate - compareDate) / millisecondsPerDay);

  if (unit === "days") {
    return diffDays;
  }
  if (unit === "weeks") {
    return Math.floor(diffDays / 7);
  }

  const earlier = new Date(Math.min(actualDate, compareDate));
  const later = new Date(Math.max(actualDate, compareDate));
  let months =
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    later.getUTCMonth() -
    earlier.getUTCMonth();

  if (later.getUTCDate() < earlier.getUTCDate()) {
    months -= 1;
  }

  if (unit === "months") {
    return months;
  }

  return Math.floor(months / 12);
}

/**
 * Convert value to boolean
 */
function toBoolean(value: unknown): boolean {
  if (value === null || value === undefined) {return false;}
  if (typeof value === "boolean") {return value;}
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "yes" || lower === "1";
  }
  if (typeof value === "number") {return value !== 0;}
  return Boolean(value);
}

/**
 * Check if value is empty
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {return true;}
  if (typeof value === "string") {return value.trim() === "";}
  if (Array.isArray(value)) {return value.length === 0;}
  if (typeof value === "object") {return Object.keys(value).length === 0;}
  return false;
}

/**
 * Convert value to array
 */
function toArray(value: unknown): unknown[] {
  if (value === null || value === undefined) {return [];}
  if (Array.isArray(value)) {return value as unknown[];}
  return [value];
}

/**
 * Get value from data object using dot notation path
 * @param data - Source data object
 * @param path - Key or dot-notation path (e.g. "user.email" or "list.rowCount")
 */
export function getValueByPath(data: Record<string, unknown>, path: string): unknown {
  if (data === null || data === undefined) {return undefined;}

  // Direct match priority (in case key contains dots)
  if (path in data) {return data[path];}

  // Split by dot and traverse
  const parts = path.split('.');
  if (parts.length === 1) {return data[path];} // Fallback for simple keys not in data

  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// =====================================================================
// BATCH EVALUATION FOR WORKFLOW RUNS
// =====================================================================

/**
 * Evaluate visibility for multiple sections/steps at once
 */
export interface VisibilityMap {
  sections: Record<string, boolean>;
  steps: Record<string, boolean>;
}

export interface ElementWithCondition {
  id: string;
  visibleIf: ConditionExpression;
}

/**
 * Evaluate visibility for all sections and steps in a workflow
 */
export function evaluateWorkflowVisibility(
  sections: ElementWithCondition[],
  steps: ElementWithCondition[],
  data: DataMap,
  aliasResolver?: AliasResolver
): VisibilityMap {
  const result: VisibilityMap = {
    sections: {},
    steps: {},
  };

  // Evaluate sections
  for (const section of sections) {
    result.sections[section.id] = evaluateConditionExpression(
      section.visibleIf,
      data,
      aliasResolver
    );
  }

  // Evaluate steps (only in visible sections)
  for (const step of steps) {
    result.steps[step.id] = evaluateConditionExpression(
      step.visibleIf,
      data,
      aliasResolver
    );
  }

  return result;
}

// =====================================================================
// HUMAN-READABLE DESCRIPTION
// =====================================================================

/**
 * Generate a human-readable description of a condition expression
 */
export function describeConditionExpression(
  expression: ConditionExpression,
  variableLabels?: Record<string, string>
): string {
  if (!expression) {
    return "Always visible";
  }

  return describeGroup(expression, variableLabels);
}

function describeGroup(
  group: ConditionGroup,
  variableLabels?: Record<string, string>,
  depth = 0
): string {
  if (group.conditions.length === 0) {
    return "Always visible";
  }

  const parts = group.conditions.map((item) => {
    if (item.type === "condition") {
      return describeCondition(item, variableLabels);
    }
    if (item.type === "group") {
      const nested = describeGroup(item, variableLabels, depth + 1);
      return depth > 0 ? `(${nested})` : nested;
    }
    return "Script Expression";
  });

  const connector = group.operator === "AND" ? " AND " : " OR ";
  const description = parts.join(connector);

  return depth > 0 ? `(${description})` : description;
}

function describeCondition(
  condition: Condition,
  variableLabels?: Record<string, string>
): string {
  const varLabel = variableLabels?.[condition.variable] ?? condition.variable;
  const operator = getOperatorLabel(condition.operator);

  // Operators that don't need a value
  if (["is_true", "is_false", "is_empty", "is_not_empty"].includes(condition.operator)) {
    return `${varLabel} ${operator}`;
  }

  // Between operator
  if (condition.operator === "between") {
    return `${varLabel} ${operator} ${String(condition.value)} and ${String(condition.value2)}`;
  }

  // Variable reference
  if (condition.valueType === "variable") {
    const refLabel = variableLabels?.[String(condition.value)] ?? String(condition.value);
    return `${varLabel} ${operator} ${refLabel}`;
  }

  // Constant value
  const valueStr = formatValue(condition.value);
  return `${varLabel} ${operator} ${valueStr}`;
}


function getOperatorLabel(operator: ComparisonOperator): string {
  const labels: Record<ComparisonOperator, string> = {
    equals: "=",
    not_equals: "≠",
    contains: "contains",
    not_contains: "doesn't contain",
    starts_with: "starts with",
    ends_with: "ends with",
    greater_than: ">",
    less_than: "<",
    greater_or_equal: "≥",
    less_or_equal: "≤",
    between: "is between",
    is_true: "is true",
    is_false: "is false",
    is_empty: "is empty",
    is_not_empty: "is not empty",
    includes: "includes",
    not_includes: "doesn't include",
    includes_all: "includes all of",
    includes_any: "includes any of",
    diff_days: "difference in days",
    diff_weeks: "difference in weeks",
    diff_months: "difference in months",
    diff_years: "difference in years",
    before: "is before",
    after: "is after",
    on_or_before: "is on or before",
    on_or_after: "is on or after",
  };
  return labels[operator] ?? operator;
}


function formatValue(value: unknown): string {
  if (value === null || value === undefined) {return "null";}
  if (typeof value === "string") {return `"${value}"`;}
  if (typeof value === "boolean") {return value ? "Yes" : "No";}
  if (Array.isArray(value)) {return `[${(value as unknown[]).join(", ")}]`;}
  return String(value);
}
