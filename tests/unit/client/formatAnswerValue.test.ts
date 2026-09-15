import { describe, expect, it } from 'vitest';

import { formatAnswerValue } from '../../../client/src/lib/formatAnswerValue';

describe('formatAnswerValue — canonical currency review output', () => {
  it('formats canonical USD and JPY answers without changing their numeric inputs', () => {
    const usd = 1234.5;
    const jpy = 1234;

    expect(formatAnswerValue(usd, {
      type: 'number',
      config: { mode: 'currency_decimal', currency: 'USD' },
    })).toBe('$1,234.50');
    expect(formatAnswerValue(jpy, {
      type: 'number',
      config: { mode: 'currency_decimal', currency: 'JPY' },
    })).toBe('¥1,234');
    expect(usd).toBe(1234.5);
    expect(jpy).toBe(1234);
  });

  it('keeps legacy currency rows readable and plain numbers undecorated', () => {
    expect(formatAnswerValue(1234.5, {
      type: 'currency',
      config: { currency: 'EUR', allowDecimal: true },
    })).toBe('€1,234.50');
    expect(formatAnswerValue(1234.5, {
      type: 'number',
      config: { mode: 'number', thousandsSeparator: true },
    })).toBe('1234.5');
  });
});

describe('formatAnswerValue — phone numbers', () => {
  // 2026-09-15: the review screen showed stored digits ("15552013344").
  it('shows a stored digit string right-filled', () => {
    expect(formatAnswerValue('120987654321', { type: 'phone' })).toBe('+12 (098) 765-4321');
    expect(formatAnswerValue('7654321', { type: 'phone' })).toBe('765-4321');
  });

  it('reformats a legacy formatted value the same way', () => {
    expect(formatAnswerValue('+1 555 201 3344', { type: 'phone' })).toBe('+1 (555) 201-3344');
  });
});
