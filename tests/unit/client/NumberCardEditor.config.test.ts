import { describe, expect, it } from 'vitest';

import {
  buildCanonicalNumberConfig,
  type NumberCardState,
} from '../../../client/src/components/builder/cards/NumberCardEditor.components';

function editorState(overrides: Partial<NumberCardState> = {}): NumberCardState {
  return {
    mode: 'number',
    step: 1,
    allowDecimal: true,
    thousandsSeparator: false,
    formatOnInput: false,
    prefix: '',
    suffix: '',
    currency: 'USD',
    ...overrides,
  };
}

describe('Number editor canonical currency config', () => {
  it('switches Advanced Number to currency without carrying plain decorations', () => {
    const config = buildCanonicalNumberConfig(editorState({
      mode: 'currency_decimal',
      min: 1,
      max: 5000,
      prefix: '$',
      suffix: 'USD',
      thousandsSeparator: false,
      formatOnInput: true,
    }));

    expect(config).toEqual({
      mode: 'currency_decimal',
      validation: { min: 1, max: 5000 },
      currency: 'USD',
      thousandsSeparator: true,
    });
    expect(config).not.toHaveProperty('prefix');
    expect(config).not.toHaveProperty('suffix');
    expect(config).not.toHaveProperty('formatOnInput');
  });

  it('persists the selected ISO currency on the canonical number type', () => {
    expect(buildCanonicalNumberConfig(editorState({
      mode: 'currency_decimal',
      currency: 'JPY',
    }))).toEqual({
      mode: 'currency_decimal',
      currency: 'JPY',
      thousandsSeparator: true,
    });
  });
});
