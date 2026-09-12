import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_STEP_TYPE_OPTIONS,
  onboardingStepTypeValue,
  selectOnboardingStepType,
} from '../../../client/src/pages/onboarding/stepTypeOptions';
import type { OnboardingVariable } from '../../../client/src/pages/onboarding/onboardingTypes';

function variable(overrides: Partial<OnboardingVariable>): OnboardingVariable {
  return {
    name: 'fee',
    alias: 'fee',
    type: 'number',
    label: 'Fee',
    confidence: 1,
    source: 'explicit_tag',
    ...overrides,
  };
}

describe('onboarding currency preset canonicalization', () => {
  it('offers Currency without any retired currency writer', () => {
    const currency = ONBOARDING_STEP_TYPE_OPTIONS.find((option) => option.value === 'easy.currency');

    expect(currency).toMatchObject({
      label: 'Currency',
      type: 'number',
      presetId: 'easy.currency',
    });
    expect(ONBOARDING_STEP_TYPE_OPTIONS.some((option) => option.type === 'currency')).toBe(false);
    expect(selectOnboardingStepType('easy.currency')).toEqual({
      type: 'number',
      presetId: 'easy.currency',
      config: { mode: 'currency_decimal', currency: 'USD', thousandsSeparator: true },
    });
  });

  it('recognizes canonical and retired stored currency rows as the friendly preset', () => {
    expect(onboardingStepTypeValue(variable({
      type: 'number',
      config: { mode: 'currency_decimal', currency: 'USD' },
    }))).toBe('easy.currency');
    expect(onboardingStepTypeValue(variable({ name: 'legacyFee', type: 'currency' }))).toBe('easy.currency');
  });
});
