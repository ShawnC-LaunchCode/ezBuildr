/**
 * Condition System for Intake Runner 2.0
 *
 * This module provides a flexible, expression-based condition evaluation engine
 * that supports composite conditions (AND/OR/NOT), variable references, and
 * multiple data types.
 *
 * Key features:
 * - Composite conditions (and, or, not)
 * - Variable references with dot notation support
 * - Multiple value types (string, number, boolean, array, date)
 * - Rich operator set
 * - Type-safe evaluation
 * - Integration with workflow data and collection records
 */

import { logger } from '../logger';

// ========================================================================
// TYPE DEFINITIONS
// ========================================================================

/**
 * Supported operators for conditions
 */
export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'gt'           // greater than
  | 'gte'          // greater than or equal
  | 'lt'           // less than
  | 'lte'          // less than or equal
  | 'in'           // value in array
  | 'notIn'        // value not in array
  | 'contains'     // array/string contains value
  | 'notContains'  // array/string doesn't contain value
  | 'isEmpty'      // value is null/undefined/empty string/empty array
  | 'notEmpty'     // value is not empty
  | 'startsWith'   // string starts with
  | 'endsWith'     // string ends with
  | 'matches';     // regex match

/**
 * Value types supported in conditions
 */
export type ConditionValue = string | number | boolean | null | string[] | number[];

/**
 * Variable reference (e.g., "firstName", "address.city", "items[0].name")
 */
export interface VariableReference {
  type: 'variable';
  path: string;
}

/**
 * Literal value
 */
export interface ValueLiteral {
  type: 'value';
  value: ConditionValue;
}

/**
 * Operand can be either a variable reference or a literal value
 */
export type ConditionOperand = VariableReference | ValueLiteral;

/**
 * Basic comparison condition
 */
export interface ComparisonCondition {
  op: ConditionOperator;
  left: ConditionOperand;
  right: ConditionOperand;
}

/**
 * Composite AND condition
 */
export interface AndCondition {
  and: ConditionExpression[];
}

/**
 * Composite OR condition
 */
export interface OrCondition {
  or: ConditionExpression[];
}

/**
 * Negation condition
 */
export interface NotCondition {
  not: ConditionExpression;
}

/**
 * Top-level condition expression type
 */
export type ConditionExpression =
  | ComparisonCondition
  | AndCondition
  | OrCondition
  | NotCondition;

/**
 * Context for condition evaluation
 */
export interface EvaluationContext {
  /** Workflow variables (step values by alias or ID). Values are dynamic per question type. */
  variables: Record<string, unknown>;
  /** Collection record data (if prefilled from a collection). Fields are dynamic. */
  record?: Record<string, unknown>;
}

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================

/**
 * Safely access a named property on an unknown value.
 * Returns undefined if obj is not an object or key is missing.
 */
function getProperty(obj: unknown, key: string): unknown {
  if (typeof obj === 'object' && obj !== null) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Safely access an array index on an unknown value.
 * Returns undefined if obj is not an array.
 */
function getIndex(obj: unknown, index: number): unknown {
  if (Array.isArray(obj)) {
    return obj[index];
  }
  return undefined;
}

/**
 * Traverses a parsed path segment-by-segment from a starting value.
 * Supports dot notation ("address.city") and array indexing ("items[0].name").
 */
function traversePath(parts: string[], start: unknown): unknown {
  let current: unknown = start;
  for (const part of parts) {
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, name, indexStr] = arrayMatch;
      current = getIndex(getProperty(current, name), parseInt(indexStr, 10));
    } else {
      current = getProperty(current, part);
    }
    if (current === undefined) {
      break;
    }
  }
  return current;
}

/**
 * Resolves a variable path to its value in the context.
 * Supports dot notation: "address.city", "items[0].name"
 */
function resolveVariable(path: string, context: EvaluationContext): unknown {
  const parts = path.split('.');
  const fromVariables = traversePath(parts, context.variables);
  if (fromVariables !== undefined) {
    return fromVariables;
  }
  if (context.record) {
    return traversePath(parts, context.record);
  }
  return undefined;
}

/**
 * Resolves an operand to its actual value
 */
function resolveOperand(operand: ConditionOperand, context: EvaluationContext): unknown {
  if (operand.type === 'value') {
    return operand.value;
  } else {
    return resolveVariable(operand.path, context);
  }
}

/**
 * Checks if a value is empty (null, undefined, empty string, empty array, empty object)
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

/**
 * Normalizes a value for case-insensitive string comparison.
 * Non-strings are returned as-is.
 */
function normalize(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.toLowerCase().trim();
  }
  return value;
}

// ========================================================================
// OPERATOR EVALUATION FUNCTIONS
// ========================================================================

/**
 * Evaluates a comparison condition
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
function evaluateComparison(
  operator: ConditionOperator,
  left: unknown,
  right: unknown
): boolean {
  switch (operator) {
    case 'equals':
      return normalize(left) === normalize(right);

    case 'notEquals':
      return normalize(left) !== normalize(right);

    case 'gt':
      return Number(left) > Number(right);

    case 'gte':
      return Number(left) >= Number(right);

    case 'lt':
      return Number(left) < Number(right);

    case 'lte':
      return Number(left) <= Number(right);

    case 'in':
      if (!Array.isArray(right)) {
        return false;
      }
      return right.some(item => normalize(item) === normalize(left));

    case 'notIn':
      if (!Array.isArray(right)) {
        return true;
      }
      return !right.some(item => normalize(item) === normalize(left));

    case 'contains':
      if (Array.isArray(left)) {
        return left.some(item => normalize(item) === normalize(right));
      }
      if (typeof left === 'string' && typeof right === 'string') {
        return left.toLowerCase().trim().includes(right.toLowerCase().trim());
      }
      return false;

    case 'notContains':
      if (Array.isArray(left)) {
        return !left.some(item => normalize(item) === normalize(right));
      }
      if (typeof left === 'string' && typeof right === 'string') {
        return !left.toLowerCase().trim().includes(right.toLowerCase().trim());
      }
      return true;

    case 'isEmpty':
      return isEmpty(left);

    case 'notEmpty':
      return !isEmpty(left);

    case 'startsWith':
      if (typeof left === 'string' && typeof right === 'string') {
        return left.toLowerCase().trim().startsWith(right.toLowerCase().trim());
      }
      return false;

    case 'endsWith':
      if (typeof left === 'string' && typeof right === 'string') {
        return left.toLowerCase().trim().endsWith(right.toLowerCase().trim());
      }
      return false;

    case 'matches':
      if (typeof left === 'string' && typeof right === 'string') {
        try {
          // eslint-disable-next-line security/detect-non-literal-regexp
          const regex = new RegExp(right);
          return regex.test(left);
        } catch {
          return false;
        }
      }
      return false;

    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      logger.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

// ========================================================================
// MAIN EVALUATION FUNCTION
// ========================================================================

/**
 * Evaluates a condition expression against the given context
 *
 * @param expression - The condition expression to evaluate
 * @param context - The evaluation context (variables, record data)
 * @returns boolean result of the condition evaluation
 */
export function evaluateCondition(
  expression: ConditionExpression,
  context: EvaluationContext
): boolean {
  // Handle composite AND condition
  if ('and' in expression) {
    return expression.and.every(subExpr => evaluateCondition(subExpr, context));
  }

  // Handle composite OR condition
  if ('or' in expression) {
    return expression.or.some(subExpr => evaluateCondition(subExpr, context));
  }

  // Handle NOT condition
  if ('not' in expression) {
    return !evaluateCondition(expression.not, context);
  }

  // Handle basic comparison condition
  if ('op' in expression) {
    const left = resolveOperand(expression.left, context);
    const right = resolveOperand(expression.right, context);
    return evaluateComparison(expression.op, left, right);
  }

  // Unknown expression type
  logger.warn('Unknown condition expression type');
  return false;
}

// ========================================================================
// UTILITY FUNCTIONS
// ========================================================================

/**
 * Creates a variable reference operand
 */
export function varRef(path: string): VariableReference {
  return { type: 'variable', path };
}

/**
 * Creates a value literal operand
 */
export function value(val: ConditionValue): ValueLiteral {
  return { type: 'value', value: val };
}

/**
 * Validates a condition expression structure.
 * Returns an array of error messages (empty if valid).
 * Accepts `unknown` because it validates arbitrary user-supplied input.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function validateConditionExpression(expression: unknown): string[] {
  const errors: string[] = [];

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!expression || typeof expression !== 'object') {
    errors.push('Condition expression must be an object');
    return errors;
  }

  // After the above guard TypeScript narrows expression to object.
  // Use 'in' operator narrowing to check for known discriminant keys.

  if ('and' in expression) {
    const { and } = expression as { and: unknown };
    if (!Array.isArray(and)) {
      errors.push('AND condition must have an array of sub-expressions');
    } else {
      and.forEach((subExpr: unknown, i: number) => {
        const subErrors = validateConditionExpression(subExpr);
        errors.push(...subErrors.map(err => `AND[${i}]: ${err}`));
      });
    }
    return errors;
  }

  if ('or' in expression) {
    const { or } = expression as { or: unknown };
    if (!Array.isArray(or)) {
      errors.push('OR condition must have an array of sub-expressions');
    } else {
      or.forEach((subExpr: unknown, i: number) => {
        const subErrors = validateConditionExpression(subExpr);
        errors.push(...subErrors.map(err => `OR[${i}]: ${err}`));
      });
    }
    return errors;
  }

  if ('not' in expression) {
    const { not } = expression as { not: unknown };
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!not || typeof not !== 'object') {
      errors.push('NOT condition must have a sub-expression');
    } else {
      const subErrors = validateConditionExpression(not);
      errors.push(...subErrors.map(err => `NOT: ${err}`));
    }
    return errors;
  }

  // Check if it looks like a comparison condition
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if ('left' in expression || 'right' in expression || 'op' in expression) {
    const expr = expression as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!expr['op'] || typeof expr['op'] !== 'string') {
      errors.push('Comparison condition must have an operator');
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!expr['left'] || typeof expr['left'] !== 'object') {
      errors.push('Comparison condition must have a left operand');
    } else {
      const left = expr['left'] as Record<string, unknown>;
      if (!left['type'] || !['variable', 'value'].includes(left['type'] as string)) {
        errors.push('Left operand must have type "variable" or "value"');
      }
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!expr['right'] || typeof expr['right'] !== 'object') {
      errors.push('Comparison condition must have a right operand');
    } else {
      const right = expr['right'] as Record<string, unknown>;
      if (!right['type'] || !['variable', 'value'].includes(right['type'] as string)) {
        errors.push('Right operand must have type "variable" or "value"');
      }
    }

    return errors;
  }

  errors.push('Condition expression must have one of: and, or, not, or op');
  return errors;
}
