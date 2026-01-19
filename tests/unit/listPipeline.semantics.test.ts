/**
 * List Pipeline Semantic Behavior Tests
 *
 * These tests validate the exact semantic behaviors predicted in
 * TRANSFORM_EDITOR_SEMANTIC_PREDICTIONS.md based on code analysis.
 *
 * Focus: Semantic correctness, edge cases, and surprising behaviors
 */

import { describe, it, expect } from 'vitest';

import {
  evaluateFilterRule,
  evaluateFilterGroup,
  applyListFilters,
  applyListSort,
  applyListRange,
  applyListSelect,
  applyListDedupe,
  transformList,
  getFieldValue
} from '@shared/listPipeline';
import type { ListVariable, ListToolsFilterGroup, ListToolsSortKey } from '@shared/types/blocks';

// Helper to create test list
function createTestList(rows: any[]): ListVariable {
  return {
    metadata: { source: 'list_tools' },
    rows: rows.map((row, idx) => ({ id: `row-${idx}`, ...row })),
    count: rows.length,
    columns: [
      { id: 'name', name: 'name', type: 'text' },
      { id: 'age', name: 'age', type: 'number' },
      { id: 'email', name: 'email', type: 'text' }
    ]
  };
}

describe('List Pipeline - Type Coercion & Comparisons', () => {
  describe('equals operator (uses ===, strict equality)', () => {
    it('should NOT coerce string "123" to equal number 123', () => {
      const row = { value: '123' };
      const rule = { fieldPath: 'value', op: 'equals' as const, value: 123, valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(false); // STRICT EQUALITY: "123" !== 123
    });

    it('should NOT treat null == undefined (strict equality)', () => {
      const row1 = { value: null };
      const row2 = { value: undefined };
      const rule = { fieldPath: 'value', op: 'equals' as const, value: null, valueSource: 'const' as const };

      expect(evaluateFilterRule(row1, rule)).toBe(true); // null === null
      expect(evaluateFilterRule(row2, rule)).toBe(false); // undefined !== null (strict)
    });

    it('should NOT coerce string "true" to boolean true', () => {
      const row = { value: 'true' };
      const rule = { fieldPath: 'value', op: 'equals' as const, value: true, valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(false); // String "true" !== boolean true
    });

    it('should match exact values with strict equality', () => {
      const row = { value: 123 };
      const rule = { fieldPath: 'value', op: 'equals' as const, value: 123, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true); // 123 === 123
    });
  });

  describe('in_list operator (uses === for comparisons)', () => {
    it('should use strict equality when checking membership', () => {
      const row = { value: 2 };
      const rule = { fieldPath: 'value', op: 'in_list' as const, value: ['1', '2', '3'], valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(false); // STRICT: Number 2 not in ["1", "2", "3"]
    });

    it('should match exact values in list', () => {
      const row = { value: 2 };
      const rule = { fieldPath: 'value', op: 'in_list' as const, value: [1, 2, 3], valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // 2 === 2
    });

    it('should return false if compareValue is not an array', () => {
      const row = { value: 'test' };
      const rule = { fieldPath: 'value', op: 'in_list' as const, value: 'not-an-array' as any, valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(false);
    });
  });

  describe('not_in_list operator', () => {
    it('should return true if compareValue is not an array', () => {
      const row = { value: 'test' };
      const rule = { fieldPath: 'value', op: 'not_in_list' as const, value: 'not-an-array' as any, valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // Returns true for invalid input (graceful handling)
    });

    it('should use strict equality', () => {
      const row = { value: 2 };
      const rule = { fieldPath: 'value', op: 'not_in_list' as const, value: ['1', '2', '3'], valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // 2 not in ["1", "2", "3"] (strict)
    });
  });

  describe('numeric comparison operators', () => {
    it('should perform numeric comparison with proper types', () => {
      const row = { value: 10 };
      const rule = { fieldPath: 'value', op: 'greater_than' as const, value: 2, valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // 10 > 2
    });

    it('should coerce string numbers to numeric comparison', () => {
      const row = { value: '10' };
      const rule = { fieldPath: 'value', op: 'greater_than' as const, value: 2, valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // "10" > 2 → 10 > 2 (coerced)
    });

    it('should handle boundary conditions with gte/lte', () => {
      const row = { value: 10 };

      const gteRule = { fieldPath: 'value', op: 'gte' as const, value: 10, valueSource: 'const' as const };
      const lteRule = { fieldPath: 'value', op: 'lte' as const, value: 10, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, gteRule)).toBe(true); // 10 >= 10
      expect(evaluateFilterRule(row, lteRule)).toBe(true); // 10 <= 10
    });
  });
});

describe('List Pipeline - Null/Undefined/Empty String Handling', () => {
  describe('is_empty operator', () => {
    it('should catch null', () => {
      const row = { value: null };
      const rule = { fieldPath: 'value', op: 'is_empty' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });

    it('should catch undefined', () => {
      const row = { value: undefined };
      const rule = { fieldPath: 'value', op: 'is_empty' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });

    it('should catch empty string', () => {
      const row = { value: '' };
      const rule = { fieldPath: 'value', op: 'is_empty' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });

    it('should NOT catch 0, false, [], or {}', () => {
      const rule = { fieldPath: 'value', op: 'is_empty' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule({ value: 0 }, rule)).toBe(false);
      expect(evaluateFilterRule({ value: false }, rule)).toBe(false);
      expect(evaluateFilterRule({ value: [] }, rule)).toBe(false);
      expect(evaluateFilterRule({ value: {} }, rule)).toBe(false);
    });
  });

  describe('is_not_empty operator', () => {
    it('should exclude null, undefined, and empty string', () => {
      const rule = { fieldPath: 'value', op: 'is_not_empty' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule({ value: null }, rule)).toBe(false);
      expect(evaluateFilterRule({ value: undefined }, rule)).toBe(false);
      expect(evaluateFilterRule({ value: '' }, rule)).toBe(false);
    });

    it('should include 0, false, [], and {}', () => {
      const rule = { fieldPath: 'value', op: 'is_not_empty' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule({ value: 0 }, rule)).toBe(true);
      expect(evaluateFilterRule({ value: false }, rule)).toBe(true);
      expect(evaluateFilterRule({ value: [] }, rule)).toBe(true);
      expect(evaluateFilterRule({ value: {} }, rule)).toBe(true);
    });
  });

  describe('exists operator', () => {
    it('should return true for null (field exists with null value)', () => {
      const row = { value: null };
      const rule = { fieldPath: 'value', op: 'exists' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true); // SEMANTIC DISTINCTION: null "exists"
    });

    it('should return false for undefined', () => {
      const row = { value: undefined };
      const rule = { fieldPath: 'value', op: 'exists' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(false);
    });

    it('should return false for missing field', () => {
      const row = {};
      const rule = { fieldPath: 'value', op: 'exists' as const, value: undefined, valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(false);
    });
  });

  describe('getFieldValue with null/undefined in path', () => {
    it('should return undefined when accessing nested field on null', () => {
      const row = { address: null };

      const result = getFieldValue(row, 'address.city');

      expect(result).toBe(undefined); // Graceful handling
    });

    it('should return undefined when accessing nested field on undefined', () => {
      const row = {};

      const result = getFieldValue(row, 'address.city');

      expect(result).toBe(undefined);
    });

    it('should support dot notation for nested objects', () => {
      const row = { address: { city: 'NYC', zip: '10001' } };

      const result = getFieldValue(row, 'address.city');

      expect(result).toBe('NYC');
    });
  });
});

describe('List Pipeline - String Operators Case Sensitivity', () => {
  describe('contains operator (case-sensitive)', () => {
    it('should be CASE-SENSITIVE', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'contains' as const, value: 'hello', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(false); // CASE-SENSITIVE: "Hello" does not contain "hello"
    });

    it('should match with exact case', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'contains' as const, value: 'Hello', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true);
    });
  });

  describe('starts_with operator (case-sensitive)', () => {
    it('should be CASE-SENSITIVE', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'starts_with' as const, value: 'hello', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(false);
    });
  });

  describe('ends_with operator (case-sensitive)', () => {
    it('should be CASE-SENSITIVE', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'ends_with' as const, value: 'world', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(false);
    });
  });
});

describe('List Pipeline - Case-Insensitive Operators', () => {
  describe('equals_ci operator', () => {
    it('should match case-insensitively', () => {
      const row = { value: 'Hello' };
      const rule = { fieldPath: 'value', op: 'equals_ci' as const, value: 'hello', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // "Hello" equals_ci "hello"
    });

    it('should match with exact case', () => {
      const row = { value: 'Hello' };
      const rule = { fieldPath: 'value', op: 'equals_ci' as const, value: 'Hello', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });

    it('should match uppercase vs lowercase', () => {
      const row = { value: 'HELLO' };
      const rule = { fieldPath: 'value', op: 'equals_ci' as const, value: 'hello', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });
  });

  describe('contains_ci operator', () => {
    it('should find substring case-insensitively', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'contains_ci' as const, value: 'WORLD', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // "Hello World" contains_ci "WORLD"
    });

    it('should match partial strings with mixed case', () => {
      const row = { value: 'The Quick Brown Fox' };
      const rule = { fieldPath: 'value', op: 'contains_ci' as const, value: 'quick brown', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });
  });

  describe('not_contains_ci operator', () => {
    it('should exclude substring case-insensitively', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'not_contains_ci' as const, value: 'GOODBYE', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // "Hello World" not_contains_ci "GOODBYE"
    });

    it('should return false if substring exists (any case)', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'not_contains_ci' as const, value: 'world', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(false);
    });
  });

  describe('starts_with_ci operator', () => {
    it('should match prefix case-insensitively', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'starts_with_ci' as const, value: 'hello', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // "Hello World" starts_with_ci "hello"
    });

    it('should handle mixed case prefixes', () => {
      const row = { value: 'HELLO WORLD' };
      const rule = { fieldPath: 'value', op: 'starts_with_ci' as const, value: 'hElLo', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });
  });

  describe('ends_with_ci operator', () => {
    it('should match suffix case-insensitively', () => {
      const row = { value: 'Hello World' };
      const rule = { fieldPath: 'value', op: 'ends_with_ci' as const, value: 'WORLD', valueSource: 'const' as const };

      const result = evaluateFilterRule(row, rule);

      expect(result).toBe(true); // "Hello World" ends_with_ci "WORLD"
    });

    it('should handle mixed case suffixes', () => {
      const row = { value: 'HELLO WORLD' };
      const rule = { fieldPath: 'value', op: 'ends_with_ci' as const, value: 'WoRlD', valueSource: 'const' as const };

      expect(evaluateFilterRule(row, rule)).toBe(true);
    });
  });
});

describe('List Pipeline - Multi-Key Sorting', () => {
  describe('Sort stability', () => {
    it('should maintain original order for equal values', () => {
      const list = createTestList([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 30 }
      ]);

      const sortKeys: ListToolsSortKey[] = [
        { fieldPath: 'age', direction: 'asc' }
      ];

      const result = applyListSort(list, sortKeys);

      // Original order should be maintained (Alice, Bob, Charlie)
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Bob');
      expect(result.rows[2].name).toBe('Charlie');
    });
  });

  describe('Multi-key priority', () => {
    it('should sort by first key, then second key for ties', () => {
      const list = createTestList([
        { department: 'HR', lastName: 'Smith' },
        { department: 'IT', lastName: 'Jones' },
        { department: 'HR', lastName: 'Adams' },
        { department: 'IT', lastName: 'Brown' }
      ]);

      const sortKeys: ListToolsSortKey[] = [
        { fieldPath: 'department', direction: 'asc' },
        { fieldPath: 'lastName', direction: 'asc' }
      ];

      const result = applyListSort(list, sortKeys);

      // Expect: HR/Adams, HR/Smith, IT/Brown, IT/Jones
      expect(result.rows[0]).toMatchObject({ department: 'HR', lastName: 'Adams' });
      expect(result.rows[1]).toMatchObject({ department: 'HR', lastName: 'Smith' });
      expect(result.rows[2]).toMatchObject({ department: 'IT', lastName: 'Brown' });
      expect(result.rows[3]).toMatchObject({ department: 'IT', lastName: 'Jones' });
    });
  });

  describe('Null placement in sorting', () => {
    it('should place nulls FIRST when sorting ascending', () => {
      const list = createTestList([
        { name: 'Alice' },
        { name: null },
        { name: 'Bob' },
        { name: null }
      ]);

      const sortKeys: ListToolsSortKey[] = [
        { fieldPath: 'name', direction: 'asc' }
      ];

      const result = applyListSort(list, sortKeys);

      // First two should be nulls
      expect(result.rows[0].name).toBe(null);
      expect(result.rows[1].name).toBe(null);
      expect(result.rows[2].name).toBe('Alice');
      expect(result.rows[3].name).toBe('Bob');
    });

    it('should place nulls LAST when sorting descending', () => {
      const list = createTestList([
        { name: 'Alice' },
        { name: null },
        { name: 'Bob' }
      ]);

      const sortKeys: ListToolsSortKey[] = [
        { fieldPath: 'name', direction: 'desc' }
      ];

      const result = applyListSort(list, sortKeys);

      // Last should be null
      expect(result.rows[0].name).toBe('Bob');
      expect(result.rows[1].name).toBe('Alice');
      expect(result.rows[2].name).toBe(null);
    });
  });

  describe('Numeric vs lexicographic sorting', () => {
    it('should perform numeric comparison when values are numbers', () => {
      const list = createTestList([
        { value: 10 },
        { value: 2 },
        { value: 100 }
      ]);

      const sortKeys: ListToolsSortKey[] = [
        { fieldPath: 'value', direction: 'asc' }
      ];

      const result = applyListSort(list, sortKeys);

      expect(result.rows[0].value).toBe(2);
      expect(result.rows[1].value).toBe(10);
      expect(result.rows[2].value).toBe(100);
    });

    it('should perform lexicographic comparison when values are strings', () => {
      const list = createTestList([
        { value: '10' },
        { value: '2' },
        { value: '100' }
      ]);

      const sortKeys: ListToolsSortKey[] = [
        { fieldPath: 'value', direction: 'asc' }
      ];

      const result = applyListSort(list, sortKeys);

      // SEMANTIC SURPRISE: Lexicographic sort → "10" < "100" < "2"
      expect(result.rows[0].value).toBe('10');
      expect(result.rows[1].value).toBe('100');
      expect(result.rows[2].value).toBe('2');
    });
  });
});

describe('List Pipeline - Offset & Limit', () => {
  describe('Limit behavior', () => {
    it('should return first N rows when limit is set', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
        { name: 'E' }
      ]);

      const result = applyListRange(list, 0, 3);

      expect(result.rows.length).toBe(3);
      expect(result.rows[0].name).toBe('A');
      expect(result.rows[2].name).toBe('C');
    });

    it('should return EMPTY array when limit = 0', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' }
      ]);

      const result = applyListRange(list, 0, 0);

      // limit=0 returns empty list (predictable behavior)
      expect(result.rows.length).toBe(0);
    });

    it('should return all rows when limit is undefined', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' }
      ]);

      const result = applyListRange(list, 0, undefined);

      expect(result.rows.length).toBe(2);
    });
  });

  describe('Offset behavior', () => {
    it('should skip first N rows', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' }
      ]);

      const result = applyListRange(list, 2);

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('C');
      expect(result.rows[1].name).toBe('D');
    });

    it('should return empty array when offset > total rows', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' }
      ]);

      const result = applyListRange(list, 10);

      expect(result.rows.length).toBe(0);
    });
  });

  describe('Offset + Limit combined', () => {
    it('should skip N rows then take M rows (SQL-like pagination)', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
        { name: 'E' }
      ]);

      const result = applyListRange(list, 1, 2); // Skip 1, take 2

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('B');
      expect(result.rows[1].name).toBe('C');
    });

    it('should return partial result when limit exceeds remaining rows', () => {
      const list = createTestList([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' }
      ]);

      const result = applyListRange(list, 1, 100);

      expect(result.rows.length).toBe(2); // Only B and C remain after offset
    });
  });
});

describe('List Pipeline - Select (Column Projection)', () => {
  describe('Column selection', () => {
    it('should return only selected columns', () => {
      const list = createTestList([
        { name: 'Alice', age: 30, email: 'alice@example.com' }
      ]);

      const result = applyListSelect(list, ['name', 'email']);

      expect(result.rows[0]).toHaveProperty('name');
      expect(result.rows[0]).toHaveProperty('email');
      expect(result.rows[0]).not.toHaveProperty('age');
    });

    it('should always preserve id field', () => {
      const list = createTestList([
        { name: 'Alice', age: 30 }
      ]);

      const result = applyListSelect(list, ['name']);

      expect(result.rows[0]).toHaveProperty('id'); // Always preserved
      expect(result.rows[0]).toHaveProperty('name');
      expect(result.rows[0]).not.toHaveProperty('age');
    });
  });

  describe('Non-existent field handling', () => {
    it('should silently ignore non-existent fields (SEMANTIC SURPRISE)', () => {
      const list = createTestList([
        { name: 'Alice', age: 30 }
      ]);

      // NOTE: No error thrown, field just omitted
      const result = applyListSelect(list, ['name', 'nonExistentField']);

      expect(result.rows[0]).toHaveProperty('name');
      expect(result.rows[0]).not.toHaveProperty('nonExistentField'); // Silently ignored
    });
  });

  describe('Dot notation support', () => {
    it('should support nested field paths', () => {
      const list: ListVariable = {
        metadata: { source: 'list_tools' },
        rows: [
          { id: 'row-0', name: 'Alice', address: { city: 'NYC', zip: '10001' } }
        ],
        count: 1,
        columns: []
      };

      const result = applyListSelect(list, ['name', 'address.city']);

      expect(result.rows[0]).toHaveProperty('name');
      expect(result.rows[0]).toHaveProperty('address.city');
      expect(result.rows[0]['address.city']).toBe('NYC'); // Stored with dot in key
    });
  });
});

describe('List Pipeline - Deduplication', () => {
  describe('Dedupe behavior', () => {
    it('should keep first occurrence only', () => {
      const list = createTestList([
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' },
        { email: 'alice@example.com', name: 'Alice Duplicate' }
      ]);

      const result = applyListDedupe(list, { fieldPath: 'email' });

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('Alice'); // First occurrence kept
      expect(result.rows[1].name).toBe('Bob');
    });

    it('should preserve order', () => {
      const list = createTestList([
        { id: 'row-0', email: 'a@example.com' },
        { id: 'row-1', email: 'b@example.com' },
        { id: 'row-2', email: 'a@example.com' }
      ]);

      const result = applyListDedupe(list, { fieldPath: 'email' });

      expect(result.rows[0].id).toBe('row-0');
      expect(result.rows[1].id).toBe('row-1');
    });
  });

  describe('Dedupe with nulls', () => {
    it('should keep ALL rows with null dedupe keys', () => {
      const list = createTestList([
        { email: 'alice@example.com', name: 'Alice' },
        { email: null, name: 'Bob' },
        { email: null, name: 'Charlie' },
        { email: null, name: 'David' }
      ]);

      const result = applyListDedupe(list, { fieldPath: 'email' });

      // NEW BEHAVIOR: All nulls are kept (not deduped)
      expect(result.rows.length).toBe(4);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Bob');
      expect(result.rows[2].name).toBe('Charlie');
      expect(result.rows[3].name).toBe('David');
    });

    it('should keep ALL rows with undefined dedupe keys', () => {
      const list = createTestList([
        { email: 'alice@example.com', name: 'Alice' },
        { email: undefined, name: 'Bob' },
        { email: undefined, name: 'Charlie' }
      ]);

      const result = applyListDedupe(list, { fieldPath: 'email' });

      // All undefineds are kept
      expect(result.rows.length).toBe(3);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Bob');
      expect(result.rows[2].name).toBe('Charlie');
    });

    it('should still dedupe non-null values correctly', () => {
      const list = createTestList([
        { email: 'alice@example.com', name: 'Alice' },
        { email: null, name: 'Bob' },
        { email: 'alice@example.com', name: 'Alice Duplicate' },
        { email: null, name: 'Charlie' }
      ]);

      const result = applyListDedupe(list, { fieldPath: 'email' });

      // Alice duplicate removed, but both nulls kept
      expect(result.rows.length).toBe(3);
      expect(result.rows[0].name).toBe('Alice'); // First alice kept
      expect(result.rows[1].name).toBe('Bob'); // Null kept
      expect(result.rows[2].name).toBe('Charlie'); // Null kept
    });
  });
});

describe('List Pipeline - Full Transform Pipeline', () => {
  describe('Pipeline order: filter → sort → offset/limit → select → dedupe', () => {
    it('should apply all transformations in correct order', () => {
      const list = createTestList([
        { id: 'row-0', status: 'active', name: 'Charlie', age: 30, email: 'charlie@example.com' },
        { id: 'row-1', status: 'active', name: 'Alice', age: 25, email: 'alice@example.com' },
        { id: 'row-2', status: 'inactive', name: 'Bob', age: 35, email: 'bob@example.com' },
        { id: 'row-3', status: 'active', name: 'Diana', age: 28, email: 'diana@example.com' },
        { id: 'row-4', status: 'active', name: 'Alice', age: 30, email: 'alice@example.com' }
      ]);

      const config = {
        // 1. Filter: status = active
        filters: {
          combinator: 'and' as const,
          rules: [
            { fieldPath: 'status', op: 'equals' as const, value: 'active', valueSource: 'const' as const }
          ]
        },
        // 2. Sort: by name ascending
        sort: [
          { fieldPath: 'name', direction: 'asc' as const }
        ],
        // 3. Offset/Limit: skip 0, take 3
        offset: 0,
        limit: 3,
        // 4. Select: only name and email
        select: ['name', 'email'],
        // 5. Dedupe: by email
        dedupe: { fieldPath: 'email' }
      };

      const result = transformList(list, config);

      // After filter: Charlie, Alice, Diana, Alice (4 active rows)
      // After sort: Alice, Alice, Charlie, Diana
      // After offset/limit: Alice, Alice, Charlie (first 3)
      // After select: only name, email, id
      // After dedupe: Alice, Charlie (first Alice kept, second removed)

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Charlie');
      expect(result.rows[0]).toHaveProperty('email');
      expect(result.rows[0]).not.toHaveProperty('age'); // Removed by select
      expect(result.rows[0]).not.toHaveProperty('status'); // Removed by select
    });
  });

  describe('Interaction: Filters with Pagination', () => {
    it('should apply pagination AFTER filtering', () => {
      const list = createTestList([
        { status: 'active', name: 'A' },
        { status: 'inactive', name: 'B' },
        { status: 'active', name: 'C' },
        { status: 'active', name: 'D' },
        { status: 'active', name: 'E' }
      ]);

      const config = {
        filters: {
          combinator: 'and' as const,
          rules: [
            { fieldPath: 'status', op: 'equals' as const, value: 'active', valueSource: 'const' as const }
          ]
        },
        offset: 1,
        limit: 2
      };

      const result = transformList(list, config);

      // After filter: A, C, D, E (4 rows)
      // After offset/limit: C, D (skip 1, take 2)
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('C');
      expect(result.rows[1].name).toBe('D');
    });
  });

  describe('Interaction: Sort with Pagination', () => {
    it('should apply pagination AFTER sorting', () => {
      const list = createTestList([
        { name: 'Charlie' },
        { name: 'Alice' },
        { name: 'Bob' }
      ]);

      const config = {
        sort: [{ fieldPath: 'name', direction: 'asc' as const }],
        offset: 0,
        limit: 2
      };

      const result = transformList(list, config);

      // After sort: Alice, Bob, Charlie
      // After offset/limit: Alice, Bob
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Bob');
    });
  });

  describe('Interaction: Dedupe after Select', () => {
    it('should apply dedupe AFTER select', () => {
      const list = createTestList([
        { name: 'Alice', email: 'alice@example.com', age: 30 },
        { name: 'Bob', email: 'bob@example.com', age: 25 },
        { name: 'Alice2', email: 'alice@example.com', age: 35 }
      ]);

      const config = {
        select: ['name', 'email'],
        dedupe: { fieldPath: 'email' }
      };

      const result = transformList(list, config);

      // After select: only name, email, id
      // After dedupe: Alice, Bob (Alice2 removed)
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Bob');
      expect(result.rows[0]).not.toHaveProperty('age');
    });
  });
});

describe('List Pipeline - Variable Resolution', () => {
  it('should resolve variable references from context', () => {
    const row = { value: 'active' };
    const rule = {
      fieldPath: 'value',
      op: 'equals' as const,
      value: 'statusVar', // Variable name
      valueSource: 'var' as const
    };
    const context = { statusVar: 'active' };

    const result = evaluateFilterRule(row, rule, context);

    expect(result).toBe(true);
  });

  it('should handle missing variables gracefully', () => {
    const row = { value: 'active' };
    const rule = {
      fieldPath: 'value',
      op: 'equals' as const,
      value: 'missingVar',
      valueSource: 'var' as const
    };
    const context = {};

    const result = evaluateFilterRule(row, rule, context);

    // Variable resolves to undefined, so "active" == undefined → false
    expect(result).toBe(false);
  });
});

describe('List Pipeline - AND Combinator', () => {
  it('should require all conditions to be true with AND', () => {
    const row = { status: 'active', age: 30 };

    const filterGroup: ListToolsFilterGroup = {
      combinator: 'and',
      rules: [
        { fieldPath: 'status', op: 'equals', value: 'active', valueSource: 'const' },
        { fieldPath: 'age', op: 'greater_than', value: 25, valueSource: 'const' }
      ]
    };

    expect(evaluateFilterGroup(row, filterGroup)).toBe(true);
  });

  it('should return false if any condition fails with AND', () => {
    const row = { status: 'active', age: 20 };

    const filterGroup: ListToolsFilterGroup = {
      combinator: 'and',
      rules: [
        { fieldPath: 'status', op: 'equals', value: 'active', valueSource: 'const' },
        { fieldPath: 'age', op: 'greater_than', value: 25, valueSource: 'const' }
      ]
    };

    expect(evaluateFilterGroup(row, filterGroup)).toBe(false);
  });

  it('should return empty list for conflicting conditions', () => {
    const list = createTestList([
      { status: 'active' },
      { status: 'inactive' }
    ]);

    const filterGroup: ListToolsFilterGroup = {
      combinator: 'and',
      rules: [
        { fieldPath: 'status', op: 'equals', value: 'active', valueSource: 'const' },
        { fieldPath: 'status', op: 'equals', value: 'inactive', valueSource: 'const' }
      ]
    };

    const result = applyListFilters(list, filterGroup);

    expect(result.rows.length).toBe(0); // No row satisfies both conditions
  });
});
