import { describe, it, expect } from 'vitest';
import { sanitizeObject, sanitizeString } from '../../../server/utils/sanitize';

/**
 * `sanitizeInputs` mounts `sanitizeObject` on every request in both
 * `server/index.ts` and `server/production.ts`, so this function sees every
 * request body and query the app ever receives -- and it had no tests at all.
 *
 * DEBT-2 rewrote it to remove a file-level eslint-disable header and, in the
 * process, replaced `Array.isArray(obj) ? [] : {}` with a plain `{}`. That
 * silently rewrote any JSON array body into an object with numeric string
 * keys. `tsc` could not see it because the function returns through an
 * `as T` cast. These tests exist so the shape contract is checked, not assumed.
 */
describe('sanitizeObject', () => {
  it('returns an array for a top-level array body, not an object', () => {
    const result = sanitizeObject([{ name: 'a' }, { name: 'b' }]);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('preserves nested arrays-of-arrays as arrays', () => {
    const result = sanitizeObject({ rows: [['a', 'b'], ['c', 'd']] });

    expect(Array.isArray(result.rows)).toBe(true);
    expect(Array.isArray(result.rows[0])).toBe(true);
    expect(result.rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('preserves arrays of objects nested inside an object', () => {
    const result = sanitizeObject({ items: [{ v: 1 }, { v: 2 }] });

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it('still strips HTML from strings at every depth', () => {
    const dirty = '<script>alert(1)</script>hello';
    const clean = sanitizeString(dirty);

    const result = sanitizeObject({
      top: dirty,
      nested: { deep: dirty },
      list: [dirty],
      matrix: [[dirty]]
    });

    expect(result.top).toBe(clean);
    expect(result.nested.deep).toBe(clean);
    expect(result.list[0]).toBe(clean);
    expect(result.matrix[0][0]).toBe(clean);
    expect(result.top).not.toContain('<script>');
  });

  it('passes non-string primitives through untouched, including null', () => {
    const result = sanitizeObject({ n: 1, b: true, z: null, u: undefined, arr: [1, null, true] });

    expect(result.n).toBe(1);
    expect(result.b).toBe(true);
    expect(result.z).toBeNull();
    expect(result.u).toBeUndefined();
    expect(result.arr).toEqual([1, null, true]);
  });
});
