import { describe, expect, it } from 'vitest';

import {
  ALIAS_FORMAT,
  ALIAS_MAX_LENGTH,
  generateAliasFromLabel,
  generateUniqueAliasFromTaken,
  sanitizeAliasFormat,
  validateAliasFormat,
} from '../../../server/services/stepAlias';

describe('validateAliasFormat', () => {
  it('accepts a valid alias', () => {
    expect(() => validateAliasFormat('applicantName')).not.toThrow();
    expect(() => validateAliasFormat('_private')).not.toThrow();
    expect(() => validateAliasFormat('a1_b2')).not.toThrow();
  });

  it('rejects dots, dashes, spaces, and leading digits', () => {
    expect(() => validateAliasFormat('foo.bar')).toThrow(/letters, numbers, and underscores/);
    expect(() => validateAliasFormat('foo-bar')).toThrow();
    expect(() => validateAliasFormat('foo bar')).toThrow();
    expect(() => validateAliasFormat('1stChoice')).toThrow();
    expect(() => validateAliasFormat('')).toThrow();
  });

  it('rejects aliases over the max length', () => {
    expect(() => validateAliasFormat('a'.repeat(ALIAS_MAX_LENGTH))).not.toThrow();
    expect(() => validateAliasFormat('a'.repeat(ALIAS_MAX_LENGTH + 1))).toThrow(
      new RegExp(`${ALIAS_MAX_LENGTH}`)
    );
  });
});

describe('sanitizeAliasFormat (ICW-4)', () => {
  it('strips characters outside [a-zA-Z0-9_]', () => {
    expect(sanitizeAliasFormat('applicant.name!')).toBe('applicantname');
    expect(sanitizeAliasFormat('foo-bar baz')).toBe('foobarbaz');
  });

  it('prefixes a leading digit with an underscore', () => {
    expect(sanitizeAliasFormat('1st-choice')).toBe('_1stchoice');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(sanitizeAliasFormat('...')).toBe('');
    expect(sanitizeAliasFormat('!@#$%')).toBe('');
  });

  it('truncates to the max length', () => {
    expect(sanitizeAliasFormat('x'.repeat(ALIAS_MAX_LENGTH + 20))).toHaveLength(ALIAS_MAX_LENGTH);
  });

  it('leaves an already-valid alias unchanged', () => {
    expect(sanitizeAliasFormat('applicantName')).toBe('applicantName');
    expect(sanitizeAliasFormat('_private1')).toBe('_private1');
  });

  it('always produces output that passes the format regex (or empty)', () => {
    const inputs = ['foo.bar', '1st-choice', 'héllo wörld', 'a'.repeat(100), 'ok_alias'];
    for (const input of inputs) {
      const out = sanitizeAliasFormat(input);
      if (out !== '') {
        expect(out).toMatch(ALIAS_FORMAT);
      }
    }
  });
});

describe('generateAliasFromLabel', () => {
  it('camelCases a question label', () => {
    expect(generateAliasFromLabel('What is your first name?')).toBe('whatIsYourFirstName');
  });

  it('returns null for labels with no usable characters', () => {
    expect(generateAliasFromLabel('???')).toBeNull();
  });

  it('prefixes a leading digit', () => {
    expect(generateAliasFromLabel('401k balance')).toBe('_401kBalance');
  });
});

describe('generateUniqueAliasFromTaken', () => {
  it('returns the base alias when free and suffixes when taken', () => {
    const taken = new Set(['email']);
    expect(generateUniqueAliasFromTaken('Email', taken)).toBe('email2');
    expect(generateUniqueAliasFromTaken('Phone', taken)).toBe('phone');
  });
});
