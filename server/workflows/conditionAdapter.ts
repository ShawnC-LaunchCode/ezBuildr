/**
 * Condition Adapter
 *
 * Adapts between the new UI-friendly condition format (used by LogicBuilder)
 * and the existing backend condition format (used by IntakeNavigationService).
 *
 * New Format (UI):
 * {
 *   type: "group",
 *   operator: "AND",
 *   conditions: [
 *     { type: "condition", variable: "age", operator: "greater_than", value: 18, valueType: "constant" }
 *   ]
 * }
 *
 * Existing Format (Backend):
 * {
 *   and: [
 *     { op: "gt", left: { type: "variable", path: "age" }, right: { type: "value", value: 18 } }
 *   ]
 * }
 */

import {
  evaluateCondition as evaluateExistingCondition,
  type ConditionExpression as ExistingConditionExpression,
  type EvaluationContext,
} from "./conditions";

import {
  evaluateConditionExpression as evaluateNewCondition,
  type DataMap,
} from "@shared/conditionEvaluator";

import type {
  ConditionExpression as NewConditionExpression,
  Condition as NewCondition,
  ConditionGroup as NewConditionGroup,
  ComparisonOperator as NewOperator,
  ScriptCondition,
} from "@shared/types/conditions";

import { logger } from "../logger";

// ========================================================================
// FORMAT DETECTION
// ========================================================================

/**
 * Detects whether a condition expression uses the new UI format or the existing backend format
 */
export function isNewFormat(expression: any): expression is NewConditionGroup {
  if (!expression || typeof expression !== "object") return false;
  return expression.type === "group" || expression.type === "condition" || expression.type === "script";
}

export function isExistingFormat(expression: any): expression is ExistingConditionExpression {
  if (!expression || typeof expression !== "object") return false;
  return "and" in expression || "or" in expression || "not" in expression || "op" in expression;
}

// ========================================================================
// OPERATOR MAPPING
// ========================================================================

/**
 * Maps new UI operators to existing backend operators
 */
const operatorMap: Record<NewOperator, string | null> = {
  // Equality
  equals: "equals",
  not_equals: "notEquals",

  // Text
  contains: "contains",
  not_contains: "notContains",
  starts_with: "startsWith",
  ends_with: "endsWith",

  // Numeric
  greater_than: "gt",
  less_than: "lt",
  greater_or_equal: "gte",
  less_or_equal: "lte",
  between: null, // Handle specially

  // Boolean shortcuts
  is_true: "equals", // Converts to equals + value: true
  is_false: "equals", // Converts to equals + value: false

  // Empty checks
  is_empty: "isEmpty",
  is_not_empty: "notEmpty",

  // Array
  includes: "contains",
  not_includes: "notContains",
  includes_all: null, // Handle specially
  includes_any: null, // Handle specially

  // Date Difference
  diff_days: null,
  diff_weeks: null,
  diff_months: null,
  diff_years: null,

  // Date Helpers
  before: null,
  after: null,
  on_or_before: null,
  on_or_after: null,
};

// ========================================================================
// CONVERSION FUNCTIONS
// ========================================================================

/**
 * Converts new format condition to existing format
 */
export function convertNewToExisting(
  expression: NewConditionGroup | NewCondition | { type: "script" }
): ExistingConditionExpression | null {
  if (expression.type === "group") {
    return convertGroup(expression as NewConditionGroup);
  } else if (expression.type === "condition") {
    return convertCondition(expression as NewCondition);
  } else {
    // Script conditions not supported in existing backend format
    return null;
  }
}

function convertGroup(group: NewConditionGroup): ExistingConditionExpression | null {
  const convertedConditions = group.conditions
    .map((item) => convertNewToExisting(item))
    .filter((c): c is ExistingConditionExpression => c !== null);

  if (convertedConditions.length === 0) {
    return null;
  }

  if (convertedConditions.length === 1) {
    return convertedConditions[0];
  }

  if (group.operator === "AND") {
    return { and: convertedConditions };
  } else {
    return { or: convertedConditions };
  }
}

function convertCondition(condition: NewCondition): ExistingConditionExpression | null {
  if (!condition.variable) {
    return null;
  }

  const operator = condition.operator;
  const backendOp = operatorMap[operator];

  // Handle special operators
  if (operator === "is_true") {
    return {
      op: "equals",
      left: { type: "variable", path: condition.variable },
      right: { type: "value", value: true },
    };
  }

  if (operator === "is_false") {
    return {
      op: "equals",
      left: { type: "variable", path: condition.variable },
      right: { type: "value", value: false },
    };
  }

  if (operator === "between" && condition.value !== undefined && condition.value2 !== undefined) {
    // Convert to: (value >= min) AND (value <= max)
    return {
      and: [
        {
          op: "gte",
          left: { type: "variable", path: condition.variable },
          right: { type: "value", value: condition.value },
        },
        {
          op: "lte",
          left: { type: "variable", path: condition.variable },
          right: { type: "value", value: condition.value2 },
        },
      ],
    };
  }

  if (operator === "includes_all" && Array.isArray(condition.value)) {
    // Convert to: AND of contains for each value
    const checks = condition.value.map((val: any) => ({
      op: "contains",
      left: { type: "variable", path: condition.variable },
      right: { type: "value", value: val },
    })) as ExistingConditionExpression[];
    return { and: checks };
  }

  if (operator === "includes_any" && Array.isArray(condition.value)) {
    // Convert to: OR of contains for each value
    const checks = condition.value.map((val: any) => ({
      op: "contains",
      left: { type: "variable", path: condition.variable },
      right: { type: "value", value: val },
    })) as ExistingConditionExpression[];
    return { or: checks };
  }

  if (!backendOp) {
    logger.warn(`Unknown operator: ${operator}`);
    return null;
  }

  // Create left operand (always the variable)
  const left: any = { type: "variable", path: condition.variable };

  // Create right operand
  let right: any;
  if (operator === "is_empty" || operator === "is_not_empty") {
    // These don't need a right operand, but the existing format requires one
    right = { type: "value", value: null };
  } else if (condition.valueType === "variable" && typeof condition.value === "string") {
    right = { type: "variable", path: condition.value };
  } else {
    right = { type: "value", value: condition.value };
  }

  return { op: backendOp as any, left, right };
}

// ========================================================================
// UNIFIED EVALUATION FUNCTION
// ========================================================================

/**
 * Evaluates a condition expression (either format) against the given context
 *
 * @param expression - The condition expression (new or existing format)
 * @param variables - The variable values (step values by alias or ID)
 * @returns boolean result of the condition evaluation
 */
export function evaluateVisibility(
  expression: any,
  variables: Record<string, any>
): boolean {
  // Null/undefined means always visible
  if (!expression) {
    return true;
  }

  // Detect format and evaluate
  if (isNewFormat(expression)) {
    // Use the new shared evaluator
    return evaluateNewCondition(expression, variables);
  } else if (isExistingFormat(expression)) {
    // Use the existing backend evaluator
    const context: EvaluationContext = { variables };
    return evaluateExistingCondition(expression, context);
  } else {
    // Unknown format - default to visible
    logger.warn("Unknown condition expression format, defaulting to visible");
    return true;
  }
}

/**
 * Batch evaluate visibility for multiple items
 */
export function evaluateVisibilityBatch<T extends { id: string; visibleIf?: any }>(
  items: T[],
  variables: Record<string, any>
): Map<string, boolean> {
  const results = new Map<string, boolean>();

  for (const item of items) {
    results.set(item.id, evaluateVisibility(item.visibleIf, variables));
  }

  return results;
}
