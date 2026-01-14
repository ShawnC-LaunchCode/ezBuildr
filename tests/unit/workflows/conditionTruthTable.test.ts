/**
 * Truth Table Tests for Condition System
 *
 * Comprehensive test suite covering all operators, composite conditions,
 * and edge cases for the Intake Runner 2.0 condition engine.
 */

import { describe, it, expect } from 'vitest';

import {
  evaluateCondition,
  varRef,
  value,
  validateConditionExpression,
  type ConditionExpression,
  type EvaluationContext,
} from '../../../server/workflows/conditions';

// ========================================================================
// TEST HELPERS
// ========================================================================

const createContext = (variables: Record<string, any>, record?: Record<string, any>): EvaluationContext => ({
  variables,
  record,
});

// ========================================================================
// BASIC COMPARISON OPERATORS
// ========================================================================

describe('Condition System - Basic Comparisons', () => {
  describe('equals operator', () => {
    it('should match equal strings (case-insensitive)', () => {
      const condition: ConditionExpression = {
        op: 'equals',
        left: varRef('name'),
        right: value('john'),
      };

      expect(evaluateCondition(condition, createContext({ name: 'John' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ name: 'JOHN' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ name: 'jane' }))).toBe(false);
    });

    it('should match equal numbers', () => {
      const condition: ConditionExpression = {
        op: 'equals',
        left: varRef('age'),
        right: value(25),
      };

      expect(evaluateCondition(condition, createContext({ age: 25 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ age: 26 }))).toBe(false);
    });

    it('should match equal booleans', () => {
      const condition: ConditionExpression = {
        op: 'equals',
        left: varRef('active'),
        right: value(true),
      };

      expect(evaluateCondition(condition, createContext({ active: true }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ active: false }))).toBe(false);
    });

    it('should handle null values', () => {
      const condition: ConditionExpression = {
        op: 'equals',
        left: varRef('value'),
        right: value(null),
      };

      expect(evaluateCondition(condition, createContext({ value: null }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ value: 'something' }))).toBe(false);
    });
  });

  describe('notEquals operator', () => {
    it('should match non-equal values', () => {
      const condition: ConditionExpression = {
        op: 'notEquals',
        left: varRef('status'),
        right: value('pending'),
      };

      expect(evaluateCondition(condition, createContext({ status: 'approved' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ status: 'pending' }))).toBe(false);
    });
  });

  describe('numeric comparison operators', () => {
    it('should evaluate gt (greater than)', () => {
      const condition: ConditionExpression = {
        op: 'gt',
        left: varRef('score'),
        right: value(50),
      };

      expect(evaluateCondition(condition, createContext({ score: 60 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ score: 50 }))).toBe(false);
      expect(evaluateCondition(condition, createContext({ score: 40 }))).toBe(false);
    });

    it('should evaluate gte (greater than or equal)', () => {
      const condition: ConditionExpression = {
        op: 'gte',
        left: varRef('score'),
        right: value(50),
      };

      expect(evaluateCondition(condition, createContext({ score: 60 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ score: 50 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ score: 40 }))).toBe(false);
    });

    it('should evaluate lt (less than)', () => {
      const condition: ConditionExpression = {
        op: 'lt',
        left: varRef('age'),
        right: value(18),
      };

      expect(evaluateCondition(condition, createContext({ age: 16 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ age: 18 }))).toBe(false);
      expect(evaluateCondition(condition, createContext({ age: 20 }))).toBe(false);
    });

    it('should evaluate lte (less than or equal)', () => {
      const condition: ConditionExpression = {
        op: 'lte',
        left: varRef('age'),
        right: value(18),
      };

      expect(evaluateCondition(condition, createContext({ age: 16 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ age: 18 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ age: 20 }))).toBe(false);
    });
  });

  describe('array and string operators', () => {
    it('should evaluate in (value in array)', () => {
      const condition: ConditionExpression = {
        op: 'in',
        left: varRef('color'),
        right: value(['red', 'green', 'blue']),
      };

      expect(evaluateCondition(condition, createContext({ color: 'red' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ color: 'RED' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ color: 'yellow' }))).toBe(false);
    });

    it('should evaluate notIn', () => {
      const condition: ConditionExpression = {
        op: 'notIn',
        left: varRef('color'),
        right: value(['red', 'green', 'blue']),
      };

      expect(evaluateCondition(condition, createContext({ color: 'yellow' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ color: 'red' }))).toBe(false);
    });

    it('should evaluate contains for arrays', () => {
      const condition: ConditionExpression = {
        op: 'contains',
        left: varRef('tags'),
        right: value('urgent'),
      };

      expect(evaluateCondition(condition, createContext({ tags: ['urgent', 'important'] }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ tags: ['normal'] }))).toBe(false);
    });

    it('should evaluate contains for strings', () => {
      const condition: ConditionExpression = {
        op: 'contains',
        left: varRef('message'),
        right: value('error'),
      };

      expect(evaluateCondition(condition, createContext({ message: 'An error occurred' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ message: 'Success' }))).toBe(false);
    });

    it('should evaluate notContains', () => {
      const condition: ConditionExpression = {
        op: 'notContains',
        left: varRef('message'),
        right: value('error'),
      };

      expect(evaluateCondition(condition, createContext({ message: 'Success' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ message: 'An error occurred' }))).toBe(false);
    });

    it('should evaluate startsWith', () => {
      const condition: ConditionExpression = {
        op: 'startsWith',
        left: varRef('email'),
        right: value('admin'),
      };

      expect(evaluateCondition(condition, createContext({ email: 'admin@example.com' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ email: 'user@example.com' }))).toBe(false);
    });

    it('should evaluate endsWith', () => {
      const condition: ConditionExpression = {
        op: 'endsWith',
        left: varRef('filename'),
        right: value('.pdf'),
      };

      expect(evaluateCondition(condition, createContext({ filename: 'document.pdf' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ filename: 'document.docx' }))).toBe(false);
    });

    it('should evaluate matches (regex)', () => {
      const condition: ConditionExpression = {
        op: 'matches',
        left: varRef('phone'),
        right: value('^\\d{3}-\\d{3}-\\d{4}$'),
      };

      expect(evaluateCondition(condition, createContext({ phone: '555-123-4567' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ phone: '5551234567' }))).toBe(false);
    });
  });

  describe('empty/notEmpty operators', () => {
    it('should evaluate isEmpty for null/undefined', () => {
      const condition: ConditionExpression = {
        op: 'isEmpty',
        left: varRef('value'),
        right: value(null), // right operand ignored for isEmpty
      };

      expect(evaluateCondition(condition, createContext({ value: null }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ value: undefined }))).toBe(true);
      expect(evaluateCondition(condition, createContext({}))).toBe(true);
    });

    it('should evaluate isEmpty for empty strings', () => {
      const condition: ConditionExpression = {
        op: 'isEmpty',
        left: varRef('name'),
        right: value(null),
      };

      expect(evaluateCondition(condition, createContext({ name: '' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ name: '   ' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ name: 'John' }))).toBe(false);
    });

    it('should evaluate isEmpty for empty arrays', () => {
      const condition: ConditionExpression = {
        op: 'isEmpty',
        left: varRef('items'),
        right: value(null),
      };

      expect(evaluateCondition(condition, createContext({ items: [] }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ items: [1, 2] }))).toBe(false);
    });

    it('should evaluate notEmpty', () => {
      const condition: ConditionExpression = {
        op: 'notEmpty',
        left: varRef('name'),
        right: value(null),
      };

      expect(evaluateCondition(condition, createContext({ name: 'John' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ name: '' }))).toBe(false);
      expect(evaluateCondition(condition, createContext({}))).toBe(false);
    });
  });
});

// ========================================================================
// COMPOSITE CONDITIONS
// ========================================================================

describe('Condition System - Composite Conditions', () => {
  describe('AND conditions', () => {
    it('should return true when all sub-conditions are true', () => {
      const condition: ConditionExpression = {
        and: [
          {
            op: 'equals',
            left: varRef('status'),
            right: value('active'),
          },
          {
            op: 'gte',
            left: varRef('age'),
            right: value(18),
          },
        ],
      };

      expect(evaluateCondition(condition, createContext({ status: 'active', age: 20 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ status: 'inactive', age: 20 }))).toBe(false);
      expect(evaluateCondition(condition, createContext({ status: 'active', age: 16 }))).toBe(false);
    });

    it('should handle empty AND array as true', () => {
      const condition: ConditionExpression = {
        and: [],
      };

      expect(evaluateCondition(condition, createContext({}))).toBe(true);
    });

    it('should support nested AND conditions', () => {
      const condition: ConditionExpression = {
        and: [
          {
            op: 'equals',
            left: varRef('country'),
            right: value('USA'),
          },
          {
            and: [
              {
                op: 'gte',
                left: varRef('age'),
                right: value(18),
              },
              {
                op: 'equals',
                left: varRef('citizen'),
                right: value(true),
              },
            ],
          },
        ],
      };

      expect(evaluateCondition(condition, createContext({ country: 'USA', age: 20, citizen: true }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ country: 'USA', age: 20, citizen: false }))).toBe(false);
    });
  });

  describe('OR conditions', () => {
    it('should return true when any sub-condition is true', () => {
      const condition: ConditionExpression = {
        or: [
          {
            op: 'equals',
            left: varRef('role'),
            right: value('admin'),
          },
          {
            op: 'equals',
            left: varRef('role'),
            right: value('manager'),
          },
        ],
      };

      expect(evaluateCondition(condition, createContext({ role: 'admin' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ role: 'manager' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ role: 'user' }))).toBe(false);
    });

    it('should handle empty OR array as false', () => {
      const condition: ConditionExpression = {
        or: [],
      };

      expect(evaluateCondition(condition, createContext({}))).toBe(false);
    });

    it('should support nested OR conditions', () => {
      const condition: ConditionExpression = {
        or: [
          {
            op: 'equals',
            left: varRef('vip'),
            right: value(true),
          },
          {
            or: [
              {
                op: 'gte',
                left: varRef('purchases'),
                right: value(10),
              },
              {
                op: 'gte',
                left: varRef('spent'),
                right: value(1000),
              },
            ],
          },
        ],
      };

      expect(evaluateCondition(condition, createContext({ vip: true, purchases: 0, spent: 0 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ vip: false, purchases: 15, spent: 0 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ vip: false, purchases: 5, spent: 1500 }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ vip: false, purchases: 5, spent: 500 }))).toBe(false);
    });
  });

  describe('NOT conditions', () => {
    it('should negate the sub-condition', () => {
      const condition: ConditionExpression = {
        not: {
          op: 'equals',
          left: varRef('status'),
          right: value('banned'),
        },
      };

      expect(evaluateCondition(condition, createContext({ status: 'active' }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ status: 'banned' }))).toBe(false);
    });

    it('should support double negation', () => {
      const condition: ConditionExpression = {
        not: {
          not: {
            op: 'equals',
            left: varRef('value'),
            right: value(true),
          },
        },
      };

      expect(evaluateCondition(condition, createContext({ value: true }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ value: false }))).toBe(false);
    });

    it('should negate composite conditions', () => {
      const condition: ConditionExpression = {
        not: {
          and: [
            {
              op: 'equals',
              left: varRef('status'),
              right: value('active'),
            },
            {
              op: 'gte',
              left: varRef('age'),
              right: value(18),
            },
          ],
        },
      };

      expect(evaluateCondition(condition, createContext({ status: 'active', age: 20 }))).toBe(false);
      expect(evaluateCondition(condition, createContext({ status: 'inactive', age: 20 }))).toBe(true);
    });
  });

  describe('Complex nested conditions', () => {
    it('should handle deeply nested AND/OR/NOT combinations', () => {
      // (status = 'active' AND age >= 18) OR (vip = true AND NOT banned = true)
      const condition: ConditionExpression = {
        or: [
          {
            and: [
              {
                op: 'equals',
                left: varRef('status'),
                right: value('active'),
              },
              {
                op: 'gte',
                left: varRef('age'),
                right: value(18),
              },
            ],
          },
          {
            and: [
              {
                op: 'equals',
                left: varRef('vip'),
                right: value(true),
              },
              {
                not: {
                  op: 'equals',
                  left: varRef('banned'),
                  right: value(true),
                },
              },
            ],
          },
        ],
      };

      expect(evaluateCondition(condition, createContext({ status: 'active', age: 20, vip: false, banned: false }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ status: 'inactive', age: 16, vip: true, banned: false }))).toBe(true);
      expect(evaluateCondition(condition, createContext({ status: 'inactive', age: 16, vip: true, banned: true }))).toBe(false);
      expect(evaluateCondition(condition, createContext({ status: 'inactive', age: 16, vip: false, banned: false }))).toBe(false);
    });
  });
});

// ========================================================================
// VARIABLE RESOLUTION
// ========================================================================

describe('Condition System - Variable Resolution', () => {
  it('should resolve simple variable paths', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('firstName'),
      right: value('John'),
    };

    expect(evaluateCondition(condition, createContext({ firstName: 'John' }))).toBe(true);
  });

  it('should resolve dot notation paths', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('address.city'),
      right: value('Boston'),
    };

    expect(evaluateCondition(condition, createContext({
      address: {
        city: 'Boston',
        state: 'MA',
      },
    }))).toBe(true);
  });

  it('should resolve array indexing', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('items[0]'),
      right: value('first'),
    };

    expect(evaluateCondition(condition, createContext({
      items: ['first', 'second', 'third'],
    }))).toBe(true);
  });

  it('should resolve nested array indexing with dot notation', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('users[0].name'),
      right: value('Alice'),
    };

    expect(evaluateCondition(condition, createContext({
      users: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    }))).toBe(true);
  });

  it('should fall back to record data if variable not found', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('recordField'),
      right: value('fromRecord'),
    };

    expect(evaluateCondition(condition, createContext(
      {},
      { recordField: 'fromRecord' }
    ))).toBe(true);
  });

  it('should prefer variable over record if both exist', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('field'),
      right: value('fromVariable'),
    };

    expect(evaluateCondition(condition, createContext(
      { field: 'fromVariable' },
      { field: 'fromRecord' }
    ))).toBe(true);
  });

  it('should handle missing variables gracefully', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('nonexistent'),
      right: value('test'),
    };

    expect(evaluateCondition(condition, createContext({}))).toBe(false);
  });
});

// ========================================================================
// VALIDATION
// ========================================================================

describe('Condition System - Validation', () => {
  it('should validate correct comparison condition', () => {
    const condition = {
      op: 'equals',
      left: { type: 'variable', path: 'name' },
      right: { type: 'value', value: 'John' },
    };

    const errors = validateConditionExpression(condition);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing operator', () => {
    const condition = {
      left: { type: 'variable', path: 'name' },
      right: { type: 'value', value: 'John' },
    };

    const errors = validateConditionExpression(condition);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('operator');
  });

  it('should reject invalid operand type', () => {
    const condition = {
      op: 'equals',
      left: { type: 'invalid', path: 'name' },
      right: { type: 'value', value: 'John' },
    };

    const errors = validateConditionExpression(condition);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate AND conditions', () => {
    const condition = {
      and: [
        {
          op: 'equals',
          left: { type: 'variable', path: 'a' },
          right: { type: 'value', value: 1 },
        },
      ],
    };

    const errors = validateConditionExpression(condition);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid AND structure', () => {
    const condition = {
      and: 'not an array',
    };

    const errors = validateConditionExpression(condition);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate nested conditions', () => {
    const condition = {
      and: [
        {
          or: [
            {
              op: 'equals',
              left: { type: 'variable', path: 'a' },
              right: { type: 'value', value: 1 },
            },
          ],
        },
      ],
    };

    const errors = validateConditionExpression(condition);
    expect(errors).toHaveLength(0);
  });

  it('should propagate nested validation errors', () => {
    const condition = {
      and: [
        {
          op: 'equals',
          // Missing left operand
          right: { type: 'value', value: 1 },
        },
      ],
    };

    const errors = validateConditionExpression(condition);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('AND[0]');
  });
});

// ========================================================================
// EDGE CASES
// ========================================================================

describe('Condition System - Edge Cases', () => {
  it('should handle type coercion in comparisons', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('value'),
      right: value('123'),
    };

    expect(evaluateCondition(condition, createContext({ value: 123 }))).toBe(false); // No auto coercion
  });

  it('should handle case-insensitive string comparisons', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('name'),
      right: value('JOHN'),
    };

    expect(evaluateCondition(condition, createContext({ name: 'john' }))).toBe(true);
  });

  it('should handle whitespace trimming', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('name'),
      right: value('john'),
    };

    expect(evaluateCondition(condition, createContext({ name: '  john  ' }))).toBe(true);
  });

  it('should handle invalid regex gracefully', () => {
    const condition: ConditionExpression = {
      op: 'matches',
      left: varRef('value'),
      right: value('[invalid(regex'),
    };

    expect(evaluateCondition(condition, createContext({ value: 'test' }))).toBe(false);
  });

  it('should handle comparison between two variables', () => {
    const condition: ConditionExpression = {
      op: 'equals',
      left: varRef('field1'),
      right: varRef('field2'),
    };

    expect(evaluateCondition(condition, createContext({ field1: 'value', field2: 'value' }))).toBe(true);
    expect(evaluateCondition(condition, createContext({ field1: 'value1', field2: 'value2' }))).toBe(false);
  });

  it('should handle numeric string comparisons', () => {
    const condition: ConditionExpression = {
      op: 'gt',
      left: varRef('value'),
      right: value(10),
    };

    expect(evaluateCondition(condition, createContext({ value: '20' }))).toBe(true);
    expect(evaluateCondition(condition, createContext({ value: 'abc' }))).toBe(false);
  });
});
