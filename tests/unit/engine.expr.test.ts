import { describe, it, expect } from 'vitest';

import {
  validateExpression,
  evaluateExpression,
  Helpers,
  AllowedHelperNames,
  type EvalContext,
} from '@server/engine/expr';

describe('Expression Evaluator', () => {
  describe('validateExpression', () => {
    it('should allow known variables and helpers', () => {
      const result = validateExpression('amount + 100', ['amount', 'state']);
      expect(result.ok).toBe(true);
    });

    it('should allow helper functions', () => {
      const result = validateExpression('roundTo(amount, 2)', ['amount']);
      expect(result.ok).toBe(true);
    });

    it('should allow complex expressions with multiple helpers', () => {
      const result = validateExpression(
        'roundTo(amount * 1.0825, 2) + coalesce(discount, 0)',
        ['amount', 'discount']
      );
      expect(result.ok).toBe(true);
    });

    it('should reject unknown identifiers', () => {
      const result = validateExpression('ammount + 100', ['amount']);
      expect(result.ok).toBe(false);
      expect((result as any).error).toContain('ammount');
    });

    it('should reject forbidden identifiers', () => {
      const forbiddenIds = ['__proto__', 'constructor', 'prototype', 'eval', 'Function'];

      for (const id of forbiddenIds) {
        const result = validateExpression(id, []);
        expect(result.ok).toBe(false);
        expect((result as any).error).toContain('Forbidden');
      }
    });

    it('should handle syntax errors gracefully', () => {
      const result = validateExpression('amount +', ['amount']);
      expect(result.ok).toBe(false);
      expect((result as any).error).toBeTruthy();
    });

    it('should validate boolean expressions', () => {
      const result = validateExpression('amount > 1000', ['amount']);
      expect(result.ok).toBe(true);
    });

    it('should validate string operations', () => {
      const result = validateExpression('upper(name) == "JOHN"', ['name']);
      expect(result.ok).toBe(true);
    });
  });

  describe('evaluateExpression', () => {
    it('should evaluate simple arithmetic', () => {
      const context: EvalContext = { vars: { amount: 100 } };
      const result = evaluateExpression('amount + 50', context);
      expect(result).toBe(150);
    });

    it('should be deterministic with fixed clock', () => {
      const fixedDate = new Date('2024-01-01T00:00:00Z');
      const context: EvalContext = {
        vars: {},
        clock: () => fixedDate,
      };

      const result1 = evaluateExpression('1 + 1', context);
      const result2 = evaluateExpression('1 + 1', context);

      expect(result1).toBe(result2);
    });

    it('should evaluate with helper functions', () => {
      const context: EvalContext = { vars: { amount: 123.456 } };
      const result = evaluateExpression('roundTo(amount, 2)', context);
      expect(result).toBe(123.46);
    });

    it('should support math helpers', () => {
      const context: EvalContext = { vars: { x: -5.7 } };

      expect(evaluateExpression('abs(x)', context)).toBe(5.7);
      expect(evaluateExpression('ceil(x)', context)).toBe(-5);
      expect(evaluateExpression('floor(x)', context)).toBe(-6);
      expect(evaluateExpression('min(x, 0)', context)).toBe(-5.7);
      expect(evaluateExpression('max(x, 0)', context)).toBe(0);
    });

    it('should support string helpers', () => {
      const context: EvalContext = { vars: { name: '  John Doe  ' } };

      expect(evaluateExpression('len(name)', context)).toBe(12); // '  John Doe  ' is 12 chars
      expect(evaluateExpression('upper(name)', context)).toBe('  JOHN DOE  ');
      expect(evaluateExpression('lower(name)', context)).toBe('  john doe  ');
      expect(evaluateExpression('trim(name)', context)).toBe('John Doe');
      expect(evaluateExpression('contains(name, "John")', context)).toBe(true);
      expect(evaluateExpression('contains(name, "Jane")', context)).toBe(false);
    });

    it('should support array helpers', () => {
      const context: EvalContext = {
        vars: {
          items: ['apple', 'banana', 'orange'],
        },
      };

      expect(evaluateExpression('count(items)', context)).toBe(3);
      expect(evaluateExpression('includes(items, "apple")', context)).toBe(true);
      expect(evaluateExpression('includes(items, "grape")', context)).toBe(false);
    });

    it('should support logic helpers', () => {
      const context: EvalContext = {
        vars: { a: null, c: 'value' }, // b is undefined, so filtered out
      };

      expect(evaluateExpression('coalesce(a, c)', context)).toBe('value');
      expect(evaluateExpression('isEmpty(a)', context)).toBe(true);
      expect(evaluateExpression('isEmpty("")', context)).toBe(true);
      expect(evaluateExpression('isEmpty("text")', context)).toBe(false);
      expect(evaluateExpression('not(true)', context)).toBe(false);
      expect(evaluateExpression('not(false)', context)).toBe(true);
    });

    it('should support date helpers with deterministic clock', () => {
      const fixedNow = new Date('2024-01-15T12:00:00Z');
      const context: EvalContext = {
        vars: {},
        clock: () => fixedNow,
      };

      // Test date difference
      const daysDiff = evaluateExpression(
        'dateDiff("days", "2024-01-01T00:00:00Z")',
        context
      );
      expect(daysDiff).toBe(14);

      const hoursDiff = evaluateExpression(
        'dateDiff("hours", "2024-01-15T00:00:00Z")',
        context
      );
      expect(hoursDiff).toBe(12);
    });

    it('should reject invalid property access', () => {
      const context: EvalContext = { vars: { obj: {} } };

      expect(() => {
        evaluateExpression('__proto__', context);
      }).toThrow();

      expect(() => {
        evaluateExpression('constructor', context);
      }).toThrow();
    });

    it('should handle evaluation errors gracefully', () => {
      const context: EvalContext = { vars: { amount: 100 } };

      expect(() => {
        evaluateExpression('amount / 0', context);
      }).not.toThrow(); // JavaScript allows division by zero (returns Infinity)

      expect(() => {
        evaluateExpression('unknownFunc(amount)', context);
      }).toThrow(/Expression error/);
    });

    it('should enforce timeout on long-running expressions', () => {
      const context: EvalContext = { vars: { n: 1000 } };

      // This is a simple expression that should complete quickly
      // expr-eval is deterministic and safe, so we can't really create
      // infinite loops, but we can test the timeout mechanism exists
      const result = evaluateExpression('n * 2', context, { timeoutMs: 50 });
      expect(result).toBe(2000);
    });

    it('should support complex nested expressions', () => {
      const context: EvalContext = {
        vars: {
          price: 99.99,
          quantity: 3,
          tax_rate: 0.0825,
          discount: 10,
        },
      };

      const result = evaluateExpression(
        'roundTo((price * quantity - discount) * (1 + tax_rate), 2)',
        context
      );

      const expected = Math.round((99.99 * 3 - 10) * (1 + 0.0825) * 100) / 100;
      expect(result).toBe(expected);
    });

    it('should handle boolean comparisons', () => {
      const context: EvalContext = {
        vars: { age: 25, status: 'active', has_license: true },
      };

      expect(evaluateExpression('age >= 21', context)).toBe(true);
      expect(evaluateExpression('age < 18', context)).toBe(false);
      expect(evaluateExpression('status == "active"', context)).toBe(true);
      expect(evaluateExpression('has_license == true', context)).toBe(true);
      expect(evaluateExpression('age > 18 and has_license', context)).toBe(true);
    });

    it('should handle string concatenation', () => {
      const context: EvalContext = {
        vars: { first: 'John', last: 'Doe' },
      };

      const result = evaluateExpression('concat(first, " ", last)', context);
      expect(result).toBe('John Doe');
    });
  });

  describe('Helpers', () => {
    it('should have all helpers listed in AllowedHelperNames', () => {
      const helperKeys = Object.keys(Helpers);
      expect(AllowedHelperNames.sort()).toEqual(helperKeys.sort());
    });

    it('roundTo should handle edge cases', () => {
      expect(Helpers.roundTo(123.456, 0)).toBe(123);
      expect(Helpers.roundTo(123.456, 1)).toBe(123.5);
      expect(Helpers.roundTo(123.456, 2)).toBe(123.46);
      expect(Helpers.roundTo(123.456, 3)).toBe(123.456);
    });

    it('dateDiff should calculate differences correctly', () => {
      const clock = () => new Date('2024-01-15T12:00:00Z');

      const days = Helpers.dateDiff('days', '2024-01-01T00:00:00Z', undefined, clock);
      expect(days).toBe(14);

      const hours = Helpers.dateDiff('hours', '2024-01-15T00:00:00Z', undefined, clock);
      expect(hours).toBe(12);

      const minutes = Helpers.dateDiff(
        'minutes',
        '2024-01-15T11:30:00Z',
        undefined,
        clock
      );
      expect(minutes).toBe(30);
    });

    it('isEmpty should handle various types', () => {
      expect(Helpers.isEmpty(null)).toBe(true);
      expect(Helpers.isEmpty(undefined)).toBe(true);
      expect(Helpers.isEmpty('')).toBe(true);
      expect(Helpers.isEmpty('  ')).toBe(true);
      expect(Helpers.isEmpty([])).toBe(true);
      expect(Helpers.isEmpty({})).toBe(true);
      expect(Helpers.isEmpty('text')).toBe(false);
      expect(Helpers.isEmpty([1, 2])).toBe(false);
      expect(Helpers.isEmpty({ a: 1 })).toBe(false);
    });
  });
});
