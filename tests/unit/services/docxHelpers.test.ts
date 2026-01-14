import { describe, it, expect } from 'vitest';

import {
  capitalize,
  join,
  length,
  first,
  last,
  isEmpty,
  isNotEmpty,
  defaultValue,
  formatDate,
  formatCurrency,
  formatNumber,
  add,
  subtract,
  multiply,
  divide,
  pluralize,
  truncate,
  replace,
  docxHelpers,
} from '../../../server/services/docxHelpers';

/**
 * Stage 21 PR 3: DOCX Helpers Tests
 *
 * Unit tests for DOCX template helper functions
 */

describe('DOCX Helpers', () => {
  describe('String Helpers', () => {
    describe('capitalize', () => {
      it('should capitalize first letter', () => {
        expect(capitalize('hello world')).toBe('Hello world');
        expect(capitalize('HELLO')).toBe('Hello');
        expect(capitalize('h')).toBe('H');
      });

      it('should handle null/undefined', () => {
        expect(capitalize(null)).toBe('');
        expect(capitalize(undefined)).toBe('');
        expect(capitalize('')).toBe('');
      });
    });

    describe('truncate', () => {
      it('should truncate long strings', () => {
        expect(truncate('This is a long string', 10)).toBe('This is...');
        expect(truncate('Short', 10)).toBe('Short');
      });

      it('should allow custom suffix', () => {
        expect(truncate('Long string here', 10, '…')).toBe('Long stri…');
      });
    });

    describe('replace', () => {
      it('should replace all occurrences', () => {
        expect(replace('hello world hello', 'hello', 'hi')).toBe('hi world hi');
      });

      it('should handle null/undefined', () => {
        expect(replace(null, 'x', 'y')).toBe('');
      });
    });
  });

  describe('Array Helpers', () => {
    describe('join', () => {
      it('should join array elements', () => {
        expect(join(['a', 'b', 'c'])).toBe('a, b, c');
        expect(join(['a', 'b', 'c'], ' | ')).toBe('a | b | c');
      });

      it('should filter null values', () => {
        expect(join(['a', null, 'b', undefined, 'c'])).toBe('a, b, c');
      });

      it('should handle empty/null arrays', () => {
        expect(join([])).toBe('');
        expect(join(null)).toBe('');
        expect(join(undefined)).toBe('');
      });
    });

    describe('length', () => {
      it('should return array length', () => {
        expect(length([1, 2, 3])).toBe(3);
        expect(length([])).toBe(0);
      });

      it('should return 0 for null/undefined', () => {
        expect(length(null)).toBe(0);
        expect(length(undefined)).toBe(0);
      });
    });

    describe('first', () => {
      it('should return first element', () => {
        expect(first([1, 2, 3])).toBe(1);
        expect(first(['a'])).toBe('a');
      });

      it('should return null for empty/null', () => {
        expect(first([])).toBeNull();
        expect(first(null)).toBeNull();
      });
    });

    describe('last', () => {
      it('should return last element', () => {
        expect(last([1, 2, 3])).toBe(3);
        expect(last(['a'])).toBe('a');
      });

      it('should return null for empty/null', () => {
        expect(last([])).toBeNull();
        expect(last(null)).toBeNull();
      });
    });
  });

  describe('Conditional Helpers', () => {
    describe('isEmpty', () => {
      it('should detect empty values', () => {
        expect(isEmpty(null)).toBe(true);
        expect(isEmpty(undefined)).toBe(true);
        expect(isEmpty('')).toBe(true);
        expect(isEmpty([])).toBe(true);
        expect(isEmpty({})).toBe(true);
      });

      it('should detect non-empty values', () => {
        expect(isEmpty('hello')).toBe(false);
        expect(isEmpty([1])).toBe(false);
        expect(isEmpty({ a: 1 })).toBe(false);
        expect(isEmpty(0)).toBe(false);
        expect(isEmpty(false)).toBe(false);
      });
    });

    describe('isNotEmpty', () => {
      it('should be inverse of isEmpty', () => {
        expect(isNotEmpty(null)).toBe(false);
        expect(isNotEmpty('hello')).toBe(true);
      });
    });

    describe('defaultValue', () => {
      it('should return value if not empty', () => {
        expect(defaultValue('hello', 'default')).toBe('hello');
        expect(defaultValue(0, 'default')).toBe(0);
      });

      it('should return default if empty', () => {
        expect(defaultValue(null, 'default')).toBe('default');
        expect(defaultValue('', 'default')).toBe('default');
        expect(defaultValue([], 'default')).toBe('default');
      });
    });
  });

  describe('Formatting Helpers', () => {
    describe('formatDate', () => {
      it('should format dates with custom format', () => {
        const date = new Date('2025-03-15T10:30:00Z');
        expect(formatDate(date, 'YYYY-MM-DD')).toBe('2025-03-15');
        expect(formatDate(date, 'MM/DD/YYYY')).toBe('03/15/2025');
        expect(formatDate(date, 'DD-MM-YYYY')).toBe('15-03-2025');
      });

      it('should handle ISO strings', () => {
        const result = formatDate('2025-03-15', 'YYYY-MM-DD');
        expect(result).toContain('2025');
      });

      it('should return empty for invalid dates', () => {
        expect(formatDate(null)).toBe('');
        expect(formatDate('invalid')).toBe('');
      });
    });

    describe('formatCurrency', () => {
      it('should format USD by default', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
      });

      it('should format other currencies', () => {
        const result = formatCurrency(1234.56, 'EUR');
        expect(result).toContain('1,234.56');
      });

      it('should handle no symbol option', () => {
        const result = formatCurrency(1234.56, 'USD', false);
        expect(result).not.toContain('$');
        expect(result).toContain('1,234.56');
      });

      it('should handle null/undefined', () => {
        expect(formatCurrency(null)).toBe('$0.00');
        expect(formatCurrency(undefined)).toBe('$0.00');
      });
    });

    describe('formatNumber', () => {
      it('should format with decimals', () => {
        expect(formatNumber(1234.567, 2)).toBe('1,234.57');
        expect(formatNumber(1234.567, 0)).toBe('1,235');
      });

      it('should handle no thousands separator', () => {
        expect(formatNumber(1234.567, 2, false)).toBe('1234.57');
      });

      it('should handle null/undefined', () => {
        expect(formatNumber(null)).toBe('0');
        expect(formatNumber(undefined)).toBe('0');
      });
    });
  });

  describe('Math Helpers', () => {
    describe('add', () => {
      it('should add numbers', () => {
        expect(add(5, 3)).toBe(8);
        expect(add(0, 0)).toBe(0);
        expect(add(-5, 3)).toBe(-2);
      });
    });

    describe('subtract', () => {
      it('should subtract numbers', () => {
        expect(subtract(5, 3)).toBe(2);
        expect(subtract(3, 5)).toBe(-2);
      });
    });

    describe('multiply', () => {
      it('should multiply numbers', () => {
        expect(multiply(5, 3)).toBe(15);
        expect(multiply(0, 5)).toBe(0);
      });
    });

    describe('divide', () => {
      it('should divide numbers', () => {
        expect(divide(10, 2)).toBe(5);
        expect(divide(10, 3)).toBeCloseTo(3.333, 2);
      });

      it('should handle division by zero', () => {
        expect(divide(10, 0)).toBe(0);
      });
    });
  });

  describe('Utility Helpers', () => {
    describe('pluralize', () => {
      it('should pluralize based on count', () => {
        expect(pluralize(1, 'item')).toBe('item');
        expect(pluralize(2, 'item')).toBe('items');
        expect(pluralize(0, 'item')).toBe('items');
      });

      it('should use custom plural form', () => {
        expect(pluralize(1, 'child', 'children')).toBe('child');
        expect(pluralize(2, 'child', 'children')).toBe('children');
      });
    });
  });

  describe('docxHelpers Object', () => {
    it('should export all helpers', () => {
      expect(docxHelpers).toBeDefined();
      expect(typeof docxHelpers.capitalize).toBe('function');
      expect(typeof docxHelpers.join).toBe('function');
      expect(typeof docxHelpers.formatDate).toBe('function');
      expect(typeof docxHelpers.upper).toBe('function'); // From formatters
      expect(typeof docxHelpers.currency).toBe('function'); // From formatters
    });

    it('should include helpers from formatters', () => {
      expect(docxHelpers.upper('hello')).toBe('HELLO');
      expect(docxHelpers.lower('HELLO')).toBe('hello');
      expect(docxHelpers.titleCase('hello world')).toBe('Hello World');
    });
  });
});
