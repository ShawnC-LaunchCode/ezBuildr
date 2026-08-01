import { isPublicSignupEnabled } from '@shared/publicSignup';

export const PUBLIC_SIGNUP_ENABLED = isPublicSignupEnabled({
  NODE_ENV: import.meta.env.MODE,
  VITE_PUBLIC_SIGNUP_ENABLED: import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED,
});

export const PUBLIC_SIGNUP_PATH = PUBLIC_SIGNUP_ENABLED
  ? '/auth/register'
  : '/coming-soon';
