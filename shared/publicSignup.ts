export const SIGNUP_CLOSED_MESSAGE =
  'Public signup is not available yet. Contact support@ezBuildr.com to get in touch.';

/**
 * Public signup is fail-closed everywhere except tests. Tests use registration
 * to create isolated users, so keeping it enabled there preserves test setup.
 */
export function isPublicSignupEnabled(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return environment.NODE_ENV === 'test'
    || environment.VITE_PUBLIC_SIGNUP_ENABLED === 'true';
}
