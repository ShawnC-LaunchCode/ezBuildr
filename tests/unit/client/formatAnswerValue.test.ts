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
