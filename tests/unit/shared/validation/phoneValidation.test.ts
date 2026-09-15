import { describe, expect, it } from 'vitest';

import { getValidationSchema } from '../../../../shared/validation/BlockValidation';
import { validateValueSync } from '../../../../shared/validation/Validator';

// The same schema the runner checks on Next and the server checks on page submit.
const phoneSchema = getValidationSchema({ id: 'phone-1', type: 'phone', config: { format: 'international' }, required: true });

describe('phone validation (page submit, client and server)', () => {
  // The old pattern rule demanded an area code, so a valid seven-digit local
  // number could not be submitted (2026-09-15).
  it.each(['7654321', '0987654321', '120987654321', '+1 555 201 3344', '123456789012345'])('accepts %s', (value) => {
    expect(validateValueSync({ schema: phoneSchema, value })).toEqual({ valid: true, errors: [] });
  });

  it('rejects fewer than 7 digits with a message that says why', () => {
    expect(validateValueSync({ schema: phoneSchema, value: '123456' })).toEqual({
      valid: false,
      errors: ['Phone numbers need at least 7 digits'],
    });
  });

  it('rejects more than 15 digits', () => {
    expect(validateValueSync({ schema: phoneSchema, value: '1234567890123456' }).errors)
      .toEqual(['Phone numbers can have at most 15 digits']);
  });

  it('still reports a required question left blank as required', () => {
    expect(validateValueSync({ schema: phoneSchema, value: '' }).errors).toEqual(['This field is required']);
  });
});
