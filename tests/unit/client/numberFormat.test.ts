import { describe, expect, it } from 'vitest';

import {
  adornmentPadding,
  applyLiveGrouping,
  formatNumberForDisplay,
  groupDigits,
  parseNumericInput,
  stripDisplay,
} from '../../../client/src/components/runner/blocks/numberFormat';
import { resolveNumberConfig } from '../../../shared/types/stepConfigs';

describe('numberFormat — grouping', () => {
  it.each([
    ['1', '1'],
    ['123', '123'],
    ['1234', '1,234'],
    ['1234567', '1,234,567'],
  ])('groups %s as %s', (input, expected) => {
    expect(groupDigits(input)).toBe(expected);
  });

  it('round-trips through stripDisplay so nothing displayed can reach storage', () => {
    expect(stripDisplay('1,234,567')).toBe('1234567');
    expect(stripDisplay('-1,234.50')).toBe('-1234.50');
  });

  it('formats for display without grouping unless asked', () => {
    expect(formatNumberForDisplay(1234567)).toBe('1234567');
    expect(formatNumberForDisplay(1234567, { thousandsSeparator: true })).toBe('1,234,567');
    expect(formatNumberForDisplay(-1234.5, { thousandsSeparator: true })).toBe('-1,234.5');
    expect(formatNumberForDisplay(null)).toBe('');
    expect(formatNumberForDisplay(undefined)).toBe('');
  });

  it('applies precision only when configured', () => {
    expect(formatNumberForDisplay(1.239, { precision: 2 })).toBe('1.24');
    expect(formatNumberForDisplay(1234.5, { precision: 0, thousandsSeparator: true })).toBe('1,235');
    expect(formatNumberForDisplay(1.239)).toBe('1.239');
  });
});

describe('numberFormat — intermediate input', () => {
  it.each(['-', '.', '1.', '-.', '-1.'])('keeps %s as intermediate and emits no value', (text) => {
    expect(parseNumericInput(text)).toEqual({ value: null, intermediate: true });
  });

  it('treats empty as an explicit null, not an intermediate', () => {
    expect(parseNumericInput('')).toEqual({ value: null, intermediate: false });
    expect(parseNumericInput('   ')).toEqual({ value: null, intermediate: false });
  });

  it.each([
    ['0', 0],
    ['42', 42],
    ['-7', -7],
    ['1.5', 1.5],
    ['-0.25', -0.25],
    ['1,234', 1234],
  ])('parses %s to %s', (text, expected) => {
    expect(parseNumericInput(text)).toEqual({ value: expected, intermediate: false });
  });

  it('does not parse junk into a number', () => {
    expect(parseNumericInput('12abc').value).toBeNull();
    expect(parseNumericInput('1.2.3').value).toBeNull();
  });
});

describe('numberFormat — live grouping caret', () => {
  it('keeps the caret on the same digit when a separator is inserted', () => {
    // "1234" with the caret at the end becomes "1,234"; the caret must follow
    // the digits, not stay at index 4 (which would sit before the "4").
    expect(applyLiveGrouping('1234', 4)).toEqual({ text: '1,234', caret: 5 });
  });

  it('keeps the caret mid-number when typing into the middle', () => {
    const result = applyLiveGrouping('1234567', 3);
    expect(result.text).toBe('1,234,567');
    expect(stripDisplay(result.text.slice(0, result.caret)).length).toBe(3);
  });

  it('preserves a negative sign and a decimal tail', () => {
    expect(applyLiveGrouping('-1234.50', 8).text).toBe('-1,234.50');
  });

  it('leaves an intermediate value alone rather than mangling it', () => {
    expect(applyLiveGrouping('-', 1).text).toBe('-');
    expect(applyLiveGrouping('1.', 2).text).toBe('1.');
  });
});

describe('numberFormat — adornment padding', () => {
  it('returns null when there is no adornment', () => {
    expect(adornmentPadding(undefined, 'left')).toBeNull();
    expect(adornmentPadding('', 'right')).toBeNull();
  });

  it('scales padding with adornment length on the correct side', () => {
    expect(adornmentPadding('#', 'left')).toBe('pl-7');
    expect(adornmentPadding('kg', 'right')).toBe('pr-10');
    expect(adornmentPadding('units', 'right')).toBe('pr-14');
  });
});

describe('resolveNumberConfig — stored dialects', () => {
  it('reads the canonical shape unchanged', () => {
    expect(resolveNumberConfig('number', {
      mode: 'number', validation: { min: 1, max: 10 }, thousandsSeparator: true,
    })).toEqual({ mode: 'number', validation: { min: 1, max: 10 }, thousandsSeparator: true });
  });

  it('lifts the retired root shape into nested validation', () => {
    expect(resolveNumberConfig('number', { min: 2, max: 8, step: 2 })).toEqual({
      mode: 'number', validation: { min: 2, max: 8, step: 2 },
    });
  });

  it('maps the retired allowDecimal boolean to precision 0', () => {
    expect(resolveNumberConfig('number', { allowDecimal: false }).validation).toEqual({ precision: 0 });
    expect(resolveNumberConfig('number', { allowDecimal: true }).validation).toBeUndefined();
  });

  it('reads number_advanced, dropping a currency mode the runner never honoured', () => {
    expect(resolveNumberConfig('number_advanced', {
      mode: 'currency_whole', validation: { min: 0 }, prefix: '$',
    })).toEqual({ mode: 'number', validation: { min: 0 }, prefix: '$' });
  });

  it('never returns a config without a mode', () => {
    expect(resolveNumberConfig('number', undefined).mode).toBe('number');
    expect(resolveNumberConfig('number', null).mode).toBe('number');
    expect(resolveNumberConfig('number', 'nonsense').mode).toBe('number');
  });
});
