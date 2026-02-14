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
  /** Workflow variables (step values by alias or ID) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- step values are dynamic per question type
  variables: Record<string, any>;
  /** Collection record data (if prefilled from a collection) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- collection record fields are dynamic
  record?: Record<string, any>;
}

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================

/**
 * Resolves a variable path to its value in the context
 * Supports dot notation: "address.city", "items[0].name"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- traverses arbitrary nested variable structures via dot notation, sonarjs/cognitive-complexity
function resolveVariable(path: string, context: EvaluationContext): any {
  // First try to resolve from variables
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- traversing dynamic nested structures
  let current: any = context.variables;

  for (const part of parts) {
    // Handle array indexing: items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const [, name, index] = arrayMatch;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      current = current?.[name]?.[parseInt(index, 10)];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      current = current?.[part];
    }

    if (current === undefined) {
      break;
    }
  }

  // If found in variables, return it
  if (current !== undefined) {
    return current;
  }

  // Otherwise try record data
  if (context.record) {
    current = context.record;
    for (const part of parts) {
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const [, name, index] = arrayMatch;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        current = current?.[name]?.[parseInt(index, 10)];
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        current = current?.[part];
      }

      if (current === undefined) {
        break;
      }
    }
  }

  return current;
}

/**
 * Resolves an operand to its actual value
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolves to dynamic variable or literal value
function resolveOperand(operand: ConditionOperand, context: EvaluationContext): any {
  if (operand.type === 'value') {
    return operand.value;
  } else {
    return resolveVariable(operand.path, context);
  }
}

/**
 * Checks if a value is empty
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- checks emptiness across all value types
function isEmpty(value: any): boolean {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return Object.keys(value).length === 0;
  }

  return false;
}

/**
 * Coerces values to comparable types
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- coerces dynamic condition values for comparison
function coerceToComparable(value: any): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  // Convert other types to string for comparison
  return String(value);
}

/**
 * Normalizes a value for case-insensitive comparison
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- normalizes dynamic values for case-insensitive comparison
function normalize(value: any): any {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any, complexity, sonarjs/cognitive-complexity -- compares dynamic condition operand values
function evaluateComparison(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operator: ConditionOperator,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  left: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  right: any
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return left.some(item => normalize(item) === normalize(right));
      }
      if (typeof left === 'string' && typeof right === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return normalize(left).includes(normalize(right));
      }
      return false;

    case 'notContains':
      if (Array.isArray(left)) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return !left.some(item => normalize(item) === normalize(right));
      }
      if (typeof left === 'string' && typeof right === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return !normalize(left).includes(normalize(right));
      }
      return true;

    case 'isEmpty':
      return isEmpty(left);

    case 'notEmpty':
      return !isEmpty(left);

    case 'startsWith':
      if (typeof left === 'string' && typeof right === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return normalize(left).startsWith(normalize(right));
      }
      return false;

    case 'endsWith':
      if (typeof left === 'string' && typeof right === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return normalize(left).endsWith(normalize(right));
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const left = resolveOperand(expression.left, context);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
 * Validates a condition expression structure
 * Returns an array of error messages (empty if valid)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, complexity, sonarjs/cognitive-complexity -- validates arbitrary condition expression structures
export function validateConditionExpression(expression: any): string[] {
  const errors: string[] = [];

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!expression || typeof expression !== 'object') {
    errors.push('Condition expression must be an object');
    return errors;
  }

  // Check if it's a composite condition
  if ('and' in expression) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!Array.isArray(expression.and)) {
      errors.push('AND condition must have an array of sub-expressions');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- recursive validation of arbitrary expressions
      expression.and.forEach((subExpr: any, i: number) => {
        const subErrors = validateConditionExpression(subExpr);
        errors.push(...subErrors.map(err => `AND[${i}]: ${err}`));
      });
    }
    return errors;
  }

  if ('or' in expression) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!Array.isArray(expression.or)) {
      errors.push('OR condition must have an array of sub-expressions');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- recursive validation of arbitrary expressions
      expression.or.forEach((subExpr: any, i: number) => {
        const subErrors = validateConditionExpression(subExpr);
        errors.push(...subErrors.map(err => `OR[${i}]: ${err}`));
      });
    }
    return errors;
  }

  if ('not' in expression) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
    if (!expression.not || typeof expression.not !== 'object') {
      errors.push('NOT condition must have a sub-expression');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const subErrors = validateConditionExpression(expression.not);
      errors.push(...subErrors.map(err => `NOT: ${err}`));
    }
    return errors;
  }

  // Check if it looks like a comparison condition (has left/right but maybe missing op)
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
  if ('left' in expression || 'right' in expression || 'op' in expression) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
    if (!expression.op || typeof expression.op !== 'string') {
      errors.push('Comparison condition must have an operator');
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
    if (!expression.left || typeof expression.left !== 'object') {
      errors.push('Comparison condition must have a left operand');
    } else {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      if (!expression.left.type || !['variable', 'value'].includes(expression.left.type)) {
        errors.push('Left operand must have type "variable" or "value"');
      }
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
    if (!expression.right || typeof expression.right !== 'object') {
      errors.push('Comparison condition must have a right operand');
    } else {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      if (!expression.right.type || !['variable', 'value'].includes(expression.right.type)) {
        errors.push('Right operand must have type "variable" or "value"');
      }
    }

    return errors;
  }

  errors.push('Condition expression must have one of: and, or, not, or op');
  return errors;
}
