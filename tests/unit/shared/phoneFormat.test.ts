import { describe, expect, it } from 'vitest';

import {
  extractPhoneDigits,
  formatPhoneNumber,
  phoneValidationError,
} from '../../../shared/phoneFormat';

describe('formatPhoneNumber — right-filled, like entering money from the pennies', () => {
  it.each([
    ['', ''],
    ['4', '4'],
    ['4321', '4321'],
    ['54321', '5-4321'],
    ['7654321', '765-4321'],
    ['87654321', '(8) 765-4321'],
    ['0987654321', '(098) 765-4321'],
    ['10987654321', '+1 (098) 765-4321'],
    // The owner's example, 2026-09-15.
    ['120987654321', '+12 (098) 765-4321'],
    ['15552013344', '+1 (555) 201-3344'],
  ])('%s displays as %s', (digits, display) => {
    expect(formatPhoneNumber(digits)).toBe(display);
  });

  it('is idempotent on an already formatted value', () => {
    expect(formatPhoneNumber('+12 (098) 765-4321')).toBe('+12 (098) 765-4321');
  });

  it('formats a legacy numeric value the same way', () => {
    expect(formatPhoneNumber(7654321)).toBe('765-4321');
  });
});

describe('extractPhoneDigits', () => {
  it('keeps only digits, in order', () => {
    expect(extractPhoneDigits('+1 (555) 201-3344')).toBe('15552013344');
  });

  it('has no digits for a value that is not a string or number', () => {
    expect(extractPhoneDigits(null)).toBe('');
    expect(extractPhoneDigits({ phone: '5552013344' })).toBe('');
  });
});

describe('phoneValidationError', () => {
  it('leaves an empty value to the required rule', () => {
    expect(phoneValidationError('')).toBeNull();
  });

  it('rejects fewer than 7 digits', () => {
    expect(phoneValidationError('123456')).toBe('Phone numbers need at least 7 digits');
  });

  it.each(['1234567', '(098) 765-4321', '+12 (098) 765-4321', '123456789012345'])('accepts %s', (value) => {
    expect(phoneValidationError(value)).toBeNull();
  });

  it('rejects more than 15 digits', () => {
    expect(phoneValidationError('1234567890123456')).toBe('Phone numbers can have at most 15 digits');
  });
});
