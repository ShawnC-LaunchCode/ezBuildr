/**
 * Base class for all block runners
 * Provides common utilities and helper methods
 */

import { logger } from "../../logger";

import type { BlockContext, BlockResult, Block, IBlockRunner, ComparisonOperator, WhenCondition, AssertExpression } from "./types";

// Security: limit regex pattern size to prevent ReDoS
const MAX_REGEX_PATTERN_LENGTH = 100;

/**
 * Abstract base class for block runners
 */
export abstract class BaseBlockRunner implements IBlockRunner {
  /**
   * Execute the block - must be implemented by subclasses
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config structure varies by block type
  abstract execute(config: any, context: BlockContext, block: Block): Promise<BlockResult>;

  /**
   * Get the block type this runner handles - must be implemented by subclasses
   */
  abstract getBlockType(): string;

  /**
   * Evaluate a when condition
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data structure varies by block execution context
  protected evaluateCondition(condition: WhenCondition, data: Record<string, any>): boolean {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Block configuration values are intentionally dynamic.
    const actualValue = this.getValueByPath(data, condition.key);
    return this.compareValues(actualValue, condition.op, condition.value);
  }

  /**
   * Evaluate an assertion
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data structure varies by block execution context
  protected evaluateAssertion(assertion: AssertExpression, data: Record<string, any>): boolean {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Block configuration values are intentionally dynamic.
    const actualValue = this.getValueByPath(data, assertion.key);

    switch (assertion.op) {
      case "is_not_empty":
        return !this.isEmpty(actualValue);

      case "greater_than":
        return this.compareNumeric(actualValue, assertion.value) > 0;

      case "less_than":
        return this.compareNumeric(actualValue, assertion.value) < 0;

      case "equals":
        return this.isEqual(actualValue, assertion.value);

      case "not_equals":
        return !this.isEqual(actualValue, assertion.value);

      case "regex":
        return this.matchesRegex(actualValue, assertion.value);

      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.warn(`Unknown assertion operator: ${assertion.op}`);
        return false;
    }
  }

  /**
   * Compare two values using the specified operator
   */

  protected compareValues(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actualValue: any,
    operator: ComparisonOperator,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectedValue?: any
  ): boolean {
    switch (operator) {
      case "equals":
        return this.isEqual(actualValue, expectedValue);

      case "not_equals":
        return !this.isEqual(actualValue, expectedValue);

      case "contains":
        return this.contains(actualValue, expectedValue);

      case "greater_than":
        return this.compareNumeric(actualValue, expectedValue) > 0;

      case "less_than":
        return this.compareNumeric(actualValue, expectedValue) < 0;

      case "is_empty":
        return this.isEmpty(actualValue);

      case "is_not_empty":
        return !this.isEmpty(actualValue);

      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.warn(`Unknown comparison operator: ${operator}`);
        return false;
    }
  }

  /**
   * Check if two values are equal
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value types vary by comparison context
  protected isEqual(actual: any, expected: any): boolean {
    // Handle arrays
    if (Array.isArray(actual) && Array.isArray(expected)) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Block configuration values are intentionally dynamic.
      return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
    }

    // Handle strings (case-insensitive)
    if (typeof actual === "string" && typeof expected === "string") {
      return actual.toLowerCase() === expected.toLowerCase();
    }

    // Handle booleans
    if (typeof actual === "boolean" || typeof expected === "boolean") {
      return Boolean(actual) === Boolean(expected);
    }

    // Standard equality
    return actual === expected;
  }

  /**
   * Check if actual contains expected value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value types vary by comparison context
  protected contains(actual: any, expected: any): boolean {
    if (Array.isArray(actual)) {
      return actual.some((item) => this.isEqual(item, expected));
    }

    if (typeof actual === "string" && typeof expected === "string") {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }

    return false;
  }

  /**
   * Compare two values numerically
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value types vary by comparison context
  protected compareNumeric(actual: any, expected: any): number {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Block configuration values are intentionally dynamic.
    const numActual = parseFloat(actual);
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Block configuration values are intentionally dynamic.
    const numExpected = parseFloat(expected);

    if (isNaN(numActual) || isNaN(numExpected)) {
      return 0;
    }

    return numActual - numExpected;
  }

  /**
   * Check if value is empty
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value types vary by comparison context
  protected isEmpty(value: any): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === "string") {
      return value.trim() === "";
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    if (typeof value === "object") {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Block configuration values are intentionally dynamic.
      return Object.keys(value).length === 0;
    }

    return false;
  }

  /**
   * Check if value matches regex pattern
   * Security: Enforces max pattern length
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value and pattern types vary by context
  protected matchesRegex(value: any, pattern: any): boolean {
    if (typeof value !== "string") {
      return false;
    }

    try {
      const patternStr = String(pattern);
      if (patternStr.length > MAX_REGEX_PATTERN_LENGTH) {
        logger.warn(`Regex pattern too long (DoS prevention): ${patternStr.slice(0, 50)}...`);
        return false;
      }
      const regex = new RegExp(patternStr);
      return regex.test(value);
    } catch (_error) {
      logger.warn(`Invalid regex pattern: ${pattern}`);
      return false;
    }
  }

  /**
   * Get value by path (dot notation support)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data structure varies by context
  protected getValueByPath(data: Record<string, any>, path: string): any {
    const keys = path.split(".");
    let result = data;

    for (const key of keys) {
      if (result == null) {
        return undefined;
      }
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Block configuration values are intentionally dynamic.
      result = result[key];
    }

    return result;
  }

  /**
   * Set value by path (dot notation support)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object structure varies by context
  protected setValueByPath(obj: any, path: string, value: any): void {
    const parts = path.split(".");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Block configuration values are intentionally dynamic.
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Block configuration values are intentionally dynamic.
        current[part] = {};
      }
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Block configuration values are intentionally dynamic.
      current = current[part];
    }

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Block configuration values are intentionally dynamic.
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Redact sensitive PII from logs
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- data structure varies by context
  protected redact(data: any): any {
    if (!data) {return data;}
    if (typeof data !== "object") {return data;}

    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "key",
      "ssn",
      "social",
      "credit",
      "card",
      "cvv",
      "email",
      "phone",
      "address",
      "dob",
      "birth",
    ];

    if (Array.isArray(data)) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Block configuration values are intentionally dynamic.
      return data.map((item) => this.redact(item));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- Block configuration values are intentionally dynamic.
    const result: any = { ...data };
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Block configuration values are intentionally dynamic.
    for (const key of Object.keys(result)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Block configuration values are intentionally dynamic.
        result[key] = "[REDACTED]";
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Block configuration values are intentionally dynamic.
      } else if (typeof result[key] === "object") {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Block configuration values are intentionally dynamic.
        result[key] = this.redact(result[key]);
      }
    }
    return result;
  }
}
