import { describe, expect, it } from 'vitest';

import { isPublicSignupEnabled } from '../../shared/publicSignup';

describe('isPublicSignupEnabled', () => {
  it('keeps public signup closed when the flag is absent', () => {
    expect(isPublicSignupEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isPublicSignupEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('opens public signup only when the flag is explicitly true', () => {
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      VITE_PUBLIC_SIGNUP_ENABLED: 'true',
    })).toBe(true);
    expect(isPublicSignupEnabled({
      NODE_ENV: 'production',
      VITE_PUBLIC_SIGNUP_ENABLED: 'TRUE',
    })).toBe(false);
  });

  it('leaves signup available for isolated test-user setup', () => {
    expect(isPublicSignupEnabled({ NODE_ENV: 'test' })).toBe(true);
  });
});
