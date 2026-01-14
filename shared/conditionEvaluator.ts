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
export type DataMap = Record<string, any>;

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

  return evaluateGroup(expression, data, aliasResolver);
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
      // Script conditions - not yet implemented
      return false;
    });

    if (group.operator === "AND") {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  }

  const visible = evaluateGroupDetailed(expression);

  return {
    visible,
    reason: visible ? "Conditions satisfied" : "Conditions not satisfied",
    evaluatedConditions: evaluatedCount,
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
    return false;
  });

  if (group.operator === "AND") {
    return results.every((r) => r);
  } else {
    // OR
    return results.some((r) => r);
  }
}

/**
 * Evaluate a single condition
 */
function evaluateSingleCondition(
  condition: Condition,
  data: DataMap,
  aliasResolver?: AliasResolver
): boolean {
  // Skip conditions with no variable selected
  if (!condition.variable) {
    return true;
  }

  // Resolve the variable to get the actual value
  const variableKey = resolveVariable(condition.variable, aliasResolver);
  const actualValue = getValueByPath(data, variableKey);

  // Get the comparison value
  let compareValue = condition.value;
  let compareValue2 = condition.value2;

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
    return aliasResolver(aliasOrId) || aliasOrId;
  }
  return aliasOrId;
}

// =====================================================================
// OPERATOR EVALUATION
// =====================================================================

/**
 * Evaluate a comparison operator
 */
function evaluateOperator(
  operator: ComparisonOperator,
  actualValue: any,
  compareValue: any,
  compareValue2?: any
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

    // Numeric comparisons
    case "greater_than":
      return toNumber(actualValue) > toNumber(compareValue);

    case "less_than":
      return toNumber(actualValue) < toNumber(compareValue);

    case "greater_or_equal":
      return toNumber(actualValue) >= toNumber(compareValue);

    case "less_or_equal":
      return toNumber(actualValue) <= toNumber(compareValue);

    case "between":
      const num = toNumber(actualValue);
      const min = toNumber(compareValue);
      const max = toNumber(compareValue2);
      return num >= min && num <= max;

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

    case "includes_all":
      const requiredAll = toArray(compareValue);
      const actualArr = toArray(actualValue);
      return requiredAll.every((req) => actualArr.some((act) => isEqual(act, req)));

    case "includes_any":
      const requiredAny = toArray(compareValue);
      const actualArrAny = toArray(actualValue);
      return requiredAny.some((req) => actualArrAny.some((act) => isEqual(act, req)));

    default:
      // Unknown operator - default to true
      console.warn(`Unknown operator: ${operator}`);
      return true;
  }
}

// =====================================================================
// TYPE CONVERSION HELPERS
// =====================================================================

/**
 * Check if two values are equal (with type coercion)
 */
function isEqual(a: any, b: any): boolean {
  // Handle null/undefined
  if (a == null && b == null) {return true;}
  if (a == null || b == null) {return false;}

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {return false;}
    return a.every((val, idx) => isEqual(val, b[idx]));
  }

  // Handle objects
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {return false;}
    return keysA.every((key) => isEqual(a[key], b[key]));
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
function toString(value: any): string {
  if (value == null) {return "";}
  if (typeof value === "string") {return value;}
  if (typeof value === "object") {return JSON.stringify(value);}
  return String(value);
}

/**
 * Convert value to number
 */
function toNumber(value: any): number {
  if (value == null) {return 0;}
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
 * Convert value to boolean
 */
function toBoolean(value: any): boolean {
  if (value == null) {return false;}
  if (typeof value === "boolean") {return value;}
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "yes" || lower === "1";
  }
  if (typeof value === "number") {return value !== 0;}
  return !!value;
}

/**
 * Check if value is empty
 */
function isEmpty(value: any): boolean {
  if (value == null) {return true;}
  if (typeof value === "string") {return value.trim() === "";}
  if (Array.isArray(value)) {return value.length === 0;}
  if (typeof value === "object") {return Object.keys(value).length === 0;}
  return false;
}

/**
 * Convert value to array
 */
function toArray(value: any): any[] {
  if (value == null) {return [];}
  if (Array.isArray(value)) {return value;}
  return [value];
}

/**
 * Get value from data object using dot notation path
 * @param data - Source data object
 * @param path - Key or dot-notation path (e.g. "user.email" or "list.rowCount")
 */
export function getValueByPath(data: any, path: string): any {
  if (data == null) {return undefined;}

  // Direct match priority (in case key contains dots)
  if (path in data) {return data[path];}

  // Split by dot and traverse
  const parts = path.split('.');
  if (parts.length === 1) {return data[path];} // Fallback for simple keys not in data

  let current = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
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
  const varLabel = variableLabels?.[condition.variable] || condition.variable;
  const operator = getOperatorLabel(condition.operator);

  // Operators that don't need a value
  if (["is_true", "is_false", "is_empty", "is_not_empty"].includes(condition.operator)) {
    return `${varLabel} ${operator}`;
  }

  // Between operator
  if (condition.operator === "between") {
    return `${varLabel} ${operator} ${condition.value} and ${condition.value2}`;
  }

  // Variable reference
  if (condition.valueType === "variable") {
    const refLabel = variableLabels?.[condition.value] || condition.value;
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
  return labels[operator] || operator;
}

function formatValue(value: any): string {
  if (value == null) {return "null";}
  if (typeof value === "string") {return `"${value}"`;}
  if (typeof value === "boolean") {return value ? "Yes" : "No";}
  if (Array.isArray(value)) {return `[${value.join(", ")}]`;}
  return String(value);
}
