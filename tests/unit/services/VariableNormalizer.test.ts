import { describe, it, expect } from 'vitest';

import {
  normalizeVariables,
  normalizeChoice,
  mergeNormalizedData,
} from '../../../server/services/document/VariableNormalizer';

describe('VariableNormalizer', () => {
  describe('normalizeVariables', () => {
    it('should preserve primitives', () => {
      const result = normalizeVariables({
        name: 'John',
        age: 42,
        active: true,
      });
      expect(result).toEqual({ name: 'John', age: 42, active: true });
    });

    it('should flatten nested objects with dot notation', () => {
      const result = normalizeVariables({
        address: { street: '123 Main St', city: 'NYC' },
      });
      expect(result).toEqual({
        'address.street': '123 Main St',
        'address.city': 'NYC',
      });
    });

    it('should preserve arrays so templates can loop over them', () => {
      const lineItems = [
        { description: 'Widget', amount: 10 },
        { description: 'Gadget', amount: 20 },
      ];
      const result = normalizeVariables({ lineItems, hobbies: ['biking', 'hiking'] });

      expect(result['lineItems']).toEqual(lineItems);
      expect(result['hobbies']).toEqual(['biking', 'hiking']);
    });

    it('should still join arrays when explicitly requested', () => {
      const result = normalizeVariables(
        { hobbies: ['biking', 'hiking'] },
        { joinArrays: true }
      );
      expect(result['hobbies']).toBe('biking, hiking');
    });

    it('should honor a custom delimiter when joining', () => {
      const result = normalizeVariables(
        { hobbies: ['a', 'b'] },
        { joinArrays: true, arrayDelimiter: ' | ' }
      );
      expect(result['hobbies']).toBe('a | b');
    });

    it('should include null/undefined as empty strings by default', () => {
      const result = normalizeVariables({ missing: null, absent: undefined });
      expect(result).toEqual({ missing: '', absent: '' });
    });

    it('should keep null/undefined as null when preserveNull is set (DOC-104)', () => {
      // The render path opts in only to read off which variables have no value
      // (for unresolved_variables), then collapses them back to '' itself.
      const result = normalizeVariables(
        { missing: null, absent: undefined, blank: '', nested: { inner: null } },
        { preserveNull: true }
      );
      expect(result).toEqual({ missing: null, absent: null, blank: '', 'nested.inner': null });
    });

    it('should still omit null/undefined entirely when includeEmpty is off, preserveNull or not', () => {
      const result = normalizeVariables(
        { missing: null, kept: 'x' },
        { includeEmpty: false, preserveNull: true }
      );
      expect(result).toEqual({ kept: 'x' });
    });

    it('should convert dates to ISO strings', () => {
      const d = new Date('2026-01-15T00:00:00Z');
      const result = normalizeVariables({ createdAt: d });
      expect(result['createdAt']).toBe(d.toISOString());
    });
  });

  describe('normalizeChoice', () => {
    it('should join multi-select choices', () => {
      expect(normalizeChoice(['a', 'b'])).toBe('a, b');
    });

    it('should pass through single choices', () => {
      expect(normalizeChoice('single')).toBe('single');
    });
  });

  describe('mergeNormalizedData', () => {
    it('should let later datasets win conflicts', () => {
      expect(mergeNormalizedData({ a: '1', b: '2' }, { b: '3' })).toEqual({ a: '1', b: '3' });
    });
  });
});
