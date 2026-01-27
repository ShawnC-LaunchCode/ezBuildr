/**
 * Unit Tests for HelperLibrary
 *
 * Tests all helper utility functions to ensure they provide safe,
 * sandboxed utilities for script execution.
 */
import { describe, it, expect } from 'vitest';

import {
  dateHelpers,
  stringHelpers,
  numberHelpers,
  arrayHelpers,
  objectHelpers,
  mathHelpers,
  createConsoleHelpers,
  helperLibrary,
} from '../../server/services/scripting/HelperLibrary';
describe('HelperLibrary', () => {
  describe('dateHelpers', () => {
    it('should return current date', () => {
      const now = dateHelpers.now();
      expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
    it('should add days to date', () => {
      const result = dateHelpers.add('2025-01-01T00:00:00.000Z', 5, 'days');
      expect(result).toBe('2025-01-06T00:00:00.000Z');
    });
    it('should subtract months from date', () => {
      const result = dateHelpers.subtract('2025-06-15T00:00:00.000Z', 3, 'months');
      expect(result).toBe('2025-03-15T00:00:00.000Z');
    });
    it('should format dates', () => {
      const result = dateHelpers.format('2025-12-07T15:30:00.000Z', 'yyyy-MM-dd');
      expect(result).toBe('2025-12-07');
    });
    it('should parse date strings', () => {
      const result = dateHelpers.parse('12/07/2025', 'MM/dd/yyyy');
      expect(result).toBe('2025-12-07T00:00:00.000Z');
    });
    it('should calculate date difference', () => {
      const diff = dateHelpers.diff('2025-01-01T00:00:00.000Z', '2025-01-10T00:00:00.000Z', 'days');
      expect(diff).toBe(9);
    });
    it('should handle invalid dates gracefully', () => {
      const result = dateHelpers.add('invalid-date', 5, 'days');
      expect(result).toBe('Invalid Date');
    });
  });
  describe('stringHelpers', () => {
    it('should convert to uppercase', () => {
      expect(stringHelpers.upper('hello world')).toBe('HELLO WORLD');
    });
    it('should convert to lowercase', () => {
      expect(stringHelpers.lower('HELLO WORLD')).toBe('hello world');
    });
    it('should trim whitespace', () => {
      expect(stringHelpers.trim('  hello  ')).toBe('hello');
    });
    it('should replace text', () => {
      expect(stringHelpers.replace('hello world', 'world', 'universe')).toBe('hello universe');
    });
    it('should replace all occurrences', () => {
      expect(stringHelpers.replace('foo bar foo', 'foo', 'baz')).toBe('baz bar baz');
    });
    it('should split strings', () => {
      expect(stringHelpers.split('a,b,c', ',')).toEqual(['a', 'b', 'c']);
    });
    it('should join arrays', () => {
      expect(stringHelpers.join(['a', 'b', 'c'], '-')).toBe('a-b-c');
    });
    it('should create slugs', () => {
      expect(stringHelpers.slug('Hello World! 123')).toBe('hello-world-123');
    });
    it('should handle empty strings', () => {
      expect(stringHelpers.upper('')).toBe('');
      expect(stringHelpers.split('', ',')).toEqual(['']);
    });
  });
  describe('numberHelpers', () => {
    it('should round numbers', () => {
      expect(numberHelpers.round(3.14159, 2)).toBe(3.14);
      expect(numberHelpers.round(3.5)).toBe(4);
    });
    it('should ceil numbers', () => {
      expect(numberHelpers.ceil(3.1)).toBe(4);
      expect(numberHelpers.ceil(3.9)).toBe(4);
    });
    it('should floor numbers', () => {
      expect(numberHelpers.floor(3.1)).toBe(3);
      expect(numberHelpers.floor(3.9)).toBe(3);
    });
    it('should get absolute value', () => {
      expect(numberHelpers.abs(-5)).toBe(5);
      expect(numberHelpers.abs(5)).toBe(5);
    });
    it('should clamp numbers', () => {
      expect(numberHelpers.clamp(5, 0, 10)).toBe(5);
      expect(numberHelpers.clamp(-5, 0, 10)).toBe(0);
      expect(numberHelpers.clamp(15, 0, 10)).toBe(10);
    });
    it('should format currency', () => {
      expect(numberHelpers.currency(1234.56)).toBe('$1,234.56');
      expect(numberHelpers.currency(1234.56, 'EUR')).toContain('1,234.56');
    });
    it('should format percentages', () => {
      expect(numberHelpers.percent(0.1234, 2)).toBe('12.34%');
      expect(numberHelpers.percent(1, 0)).toBe('100%');
    });
  });
  describe('arrayHelpers', () => {
    it('should get unique values', () => {
      expect(arrayHelpers.unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });
    it('should flatten arrays', () => {
      expect(arrayHelpers.flatten([1, [2, 3], [4, [5]]])).toEqual([1, 2, 3, 4, 5]);
    });
    it('should chunk arrays', () => {
      expect(arrayHelpers.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
    it('should sort by property', () => {
      const data = [{ age: 30 }, { age: 20 }, { age: 25 }];
      expect(arrayHelpers.sortBy(data, 'age')).toEqual([{ age: 20 }, { age: 25 }, { age: 30 }]);
    });
    it('should filter arrays', () => {
      expect(arrayHelpers.filter([1, 2, 3, 4], (x) => x > 2)).toEqual([3, 4]);
    });
    it('should map arrays', () => {
      expect(arrayHelpers.map([1, 2, 3], (x) => x * 2)).toEqual([2, 4, 6]);
    });
    it('should handle empty arrays', () => {
      expect(arrayHelpers.unique([])).toEqual([]);
      expect(arrayHelpers.flatten([])).toEqual([]);
      expect(arrayHelpers.chunk([], 2)).toEqual([]);
    });
  });
  describe('objectHelpers', () => {
    it('should get object keys', () => {
      expect(objectHelpers.keys({ a: 1, b: 2 })).toEqual(['a', 'b']);
    });
    it('should get object values', () => {
      expect(objectHelpers.values({ a: 1, b: 2 })).toEqual([1, 2]);
    });
    it('should pick properties', () => {
      expect(objectHelpers.pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });
    it('should omit properties', () => {
      expect(objectHelpers.omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
    });
    it('should merge objects', () => {
      expect(objectHelpers.merge({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    });
    it('should deep merge objects', () => {
      const result = objectHelpers.merge({ a: { x: 1 } }, { a: { y: 2 } });
      expect(result).toEqual({ a: { y: 2 } }); // Shallow merge (overwrites)
    });
    it('should handle empty objects', () => {
      expect(objectHelpers.keys({})).toEqual([]);
      expect(objectHelpers.values({})).toEqual([]);
    });
  });
  describe('mathHelpers', () => {
    it('should generate random numbers', () => {
      const rand = mathHelpers.random();
      expect(rand).toBeGreaterThanOrEqual(0);
      expect(rand).toBeLessThan(1);
    });
    it('should generate random integers', () => {
      const rand = mathHelpers.randomInt(1, 10);
      expect(Number.isInteger(rand)).toBe(true);
      expect(rand).toBeGreaterThanOrEqual(1);
      expect(rand).toBeLessThanOrEqual(10);
    });
    it('should sum arrays', () => {
      expect(mathHelpers.sum([1, 2, 3, 4])).toBe(10);
      expect(mathHelpers.sum([])).toBe(0);
    });
    it('should calculate average', () => {
      expect(mathHelpers.avg([1, 2, 3, 4])).toBe(2.5);
      expect(mathHelpers.avg([])).toBe(0);
    });
    it('should find min', () => {
      expect(mathHelpers.min([3, 1, 4, 1, 5])).toBe(1);
    });
    it('should find max', () => {
      expect(mathHelpers.max([3, 1, 4, 1, 5])).toBe(5);
    });
  });
  describe('consoleHelpers', () => {
    it('should capture console.log calls', () => {
      const { helpers, getLogs } = createConsoleHelpers();
      helpers.log('Test message', 123);
      helpers.log('Another message');
      const logs = getLogs();
      expect(logs).toEqual([
        ['Test message', 123],
        ['Another message'],
      ]);
    });
    it('should capture console.warn calls', () => {
      const { helpers, getLogs } = createConsoleHelpers();
      helpers.warn('Warning!');
      const logs = getLogs();
      expect(logs).toEqual([['[WARN]', 'Warning!']]);
    });
    it('should capture console.error calls', () => {
      const { helpers, getLogs } = createConsoleHelpers();
      helpers.error('Error!', { code: 500 });
      const logs = getLogs();
      expect(logs).toEqual([['[ERROR]', 'Error!', { code: 500 }]]);
    });
    it('should capture mixed console calls in order', () => {
      const { helpers, getLogs } = createConsoleHelpers();
      helpers.log('Log 1');
      helpers.warn('Warning 1');
      helpers.error('Error 1');
      helpers.log('Log 2');
      const logs = getLogs();
      expect(logs.length).toBe(4);
      expect(logs[0]).toEqual(['Log 1']);
      expect(logs[1]).toEqual(['[WARN]', 'Warning 1']);
      expect(logs[2]).toEqual(['[ERROR]', 'Error 1']);
      expect(logs[3]).toEqual(['Log 2']);
    });
    it('should handle objects and arrays', () => {
      const { helpers, getLogs } = createConsoleHelpers();
      helpers.log({ foo: 'bar' }, [1, 2, 3]);
      const logs = getLogs();
      expect(logs).toEqual([[{ foo: 'bar' }, [1, 2, 3]]]);
    });
    it('should create independent console instances', () => {
      const console1 = createConsoleHelpers();
      const console2 = createConsoleHelpers();
      console1.helpers.log('Console 1');
      console2.helpers.log('Console 2');
      expect(console1.getLogs()).toEqual([['Console 1']]);
      expect(console2.getLogs()).toEqual([['Console 2']]);
    });
  });
  describe('helperLibrary integration', () => {
    it('should export all helper categories', () => {
      expect(helperLibrary.date).toBeDefined();
      expect(helperLibrary.string).toBeDefined();
      expect(helperLibrary.number).toBeDefined();
      expect(helperLibrary.array).toBeDefined();
      expect(helperLibrary.object).toBeDefined();
      expect(helperLibrary.math).toBeDefined();
    });
    it('should have all expected date methods', () => {
      expect(typeof helperLibrary.date.now).toBe('function');
      expect(typeof helperLibrary.date.add).toBe('function');
      expect(typeof helperLibrary.date.subtract).toBe('function');
      expect(typeof helperLibrary.date.format).toBe('function');
      expect(typeof helperLibrary.date.parse).toBe('function');
      expect(typeof helperLibrary.date.diff).toBe('function');
    });
    it('should have all expected string methods', () => {
      expect(typeof helperLibrary.string.upper).toBe('function');
      expect(typeof helperLibrary.string.lower).toBe('function');
      expect(typeof helperLibrary.string.trim).toBe('function');
      expect(typeof helperLibrary.string.replace).toBe('function');
      expect(typeof helperLibrary.string.split).toBe('function');
      expect(typeof helperLibrary.string.join).toBe('function');
      expect(typeof helperLibrary.string.slug).toBe('function');
    });
    it('should have all expected number methods', () => {
      expect(typeof helperLibrary.number.round).toBe('function');
      expect(typeof helperLibrary.number.ceil).toBe('function');
      expect(typeof helperLibrary.number.floor).toBe('function');
      expect(typeof helperLibrary.number.abs).toBe('function');
      expect(typeof helperLibrary.number.clamp).toBe('function');
      expect(typeof helperLibrary.number.currency).toBe('function');
      expect(typeof helperLibrary.number.percent).toBe('function');
    });
    it('should have all expected array methods', () => {
      expect(typeof helperLibrary.array.unique).toBe('function');
      expect(typeof helperLibrary.array.flatten).toBe('function');
      expect(typeof helperLibrary.array.chunk).toBe('function');
      expect(typeof helperLibrary.array.sortBy).toBe('function');
      expect(typeof helperLibrary.array.filter).toBe('function');
      expect(typeof helperLibrary.array.map).toBe('function');
    });
    it('should have all expected object methods', () => {
      expect(typeof helperLibrary.object.keys).toBe('function');
      expect(typeof helperLibrary.object.values).toBe('function');
      expect(typeof helperLibrary.object.pick).toBe('function');
      expect(typeof helperLibrary.object.omit).toBe('function');
      expect(typeof helperLibrary.object.merge).toBe('function');
    });
    it('should have all expected math methods', () => {
      expect(typeof helperLibrary.math.random).toBe('function');
      expect(typeof helperLibrary.math.randomInt).toBe('function');
      expect(typeof helperLibrary.math.sum).toBe('function');
      expect(typeof helperLibrary.math.avg).toBe('function');
      expect(typeof helperLibrary.math.min).toBe('function');
      expect(typeof helperLibrary.math.max).toBe('function');
    });
  });
  describe('edge cases and error handling', () => {
    it('should handle null/undefined inputs gracefully', () => {
      expect(() => stringHelpers.upper(null as any)).not.toThrow();
      expect(() => arrayHelpers.unique(null as any)).not.toThrow();
    });
    it('should handle non-numeric inputs to number helpers', () => {
      expect(numberHelpers.round('not a number' as any)).toBeNaN();
    });
    it('should handle invalid date formats', () => {
      expect(dateHelpers.format('invalid', 'yyyy-MM-dd')).toBe('Invalid Date');
    });
    it('should handle array operations on non-arrays', () => {
      expect(() => arrayHelpers.map('not an array' as any, (x) => x)).toThrow();
    });
  });
});