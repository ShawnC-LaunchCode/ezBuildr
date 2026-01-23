/**
 * Authentication Configuration
 *
 * Centralized configuration for authentication-related constants.
 * All magic numbers and security parameters are defined here.
 */

/**
 * Password Hashing Configuration
 */
export const PASSWORD_CONFIG = {
  /**
   * bcrypt salt rounds for password hashing
   * OWASP 2025 recommendation: 12+ rounds for balance of security and performance
   * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
   */
  SALT_ROUNDS: 12,
} as const;

/**
 * JWT Token Configuration
 */
export const JWT_CONFIG = {
  /**
   * Access token expiry in seconds (15 minutes)
   * Short-lived tokens reduce the window of opportunity for token theft
   */
  EXPIRY_SECONDS: 15 * 60,

  /**
   * Access token expiry in milliseconds (15 minutes)
   * Used for Date calculations and setTimeout
   */
  EXPIRY_MS: 15 * 60 * 1000,

  /**
   * Default algorithm for JWT signing
   */
  ALGORITHM: 'HS256' as const,
} as const;

/**
 * Refresh Token Configuration
 */
export const REFRESH_TOKEN_CONFIG = {
  /**
   * Refresh token expiry in days (30 days)
   * Longer-lived tokens for better UX while maintaining security
   */
  EXPIRY_DAYS: 30,

  /**
   * Refresh token expiry in milliseconds (30 days)
   * Used for Date calculations
   */
  EXPIRY_MS: 30 * 24 * 60 * 60 * 1000,
} as const;

/**
 * OAuth2 Configuration
 */
export const OAUTH2_CONFIG = {
  /**
   * Token expiry buffer in milliseconds (30 seconds)
   * Refresh tokens slightly before they expire to prevent race conditions
   */
  TOKEN_BUFFER_MS: 30 * 1000,

  /**
   * Default OAuth2 scopes
   */
  DEFAULT_SCOPES: ['openid', 'profile', 'email'] as const,
} as const;

/**
 * Rate Limiting Configuration
 */
export const RATE_LIMIT_CONFIG = {
  /**
   * Rate limit window in milliseconds (15 minutes)
   * Period over which to track requests
   */
  WINDOW_MS: 15 * 60 * 1000,

  /**
   * Maximum number of requests per window (10 requests)
   * Prevents brute force attacks while allowing legitimate use
   */
  MAX_REQUESTS: 10,

  /**
   * Rate limit for login attempts (stricter)
   */
  LOGIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5, // 5 attempts
  },

  /**
   * Rate limit for password reset (stricter)
   */
  PASSWORD_RESET: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 3, // 3 attempts
  },
} as const;

/**
 * Account Lockout Configuration
 */
export const LOCKOUT_CONFIG = {
  /**
   * Maximum number of failed login attempts before lockout
   * OWASP recommendation: 5-10 attempts
   */
  MAX_FAILED_ATTEMPTS: 5,

  /**
   * Account lockout duration in minutes (15 minutes)
   * Temporary lockout reduces brute force effectiveness
   */
  DURATION_MINUTES: 15,

  /**
   * Account lockout duration in milliseconds (15 minutes)
   * Used for Date calculations
   */
  DURATION_MS: 15 * 60 * 1000,

  /**
   * Time window for counting failed attempts in minutes (15 minutes)
   * Failed attempts older than this are not counted
   */
  ATTEMPT_WINDOW_MINUTES: 15,

  /**
   * Time window for counting failed attempts in milliseconds
   */
  ATTEMPT_WINDOW_MS: 15 * 60 * 1000,
} as const;

/**
 * Multi-Factor Authentication Configuration
 */
export const MFA_CONFIG = {
  /**
   * Number of backup codes to generate
   */
  BACKUP_CODES_COUNT: 10,

  /**
   * Length of each backup code (characters)
   */
  BACKUP_CODE_LENGTH: 8,

  /**
   * TOTP window tolerance (steps before/after)
   * Allows for slight clock drift between server and client
   */
  TOTP_WINDOW: 1,

  /**
   * TOTP step period in seconds (typically 30)
   */
  TOTP_STEP: 30,
} as const;

/**
 * Session Configuration
 */
export const SESSION_CONFIG = {
  /**
   * Session cookie max age in milliseconds (7 days)
   */
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,

  /**
   * Session cookie name
   */
  COOKIE_NAME: 'ezbuildr.sid',

  /**
   * Cookie security settings
   */
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
  COOKIE_HTTP_ONLY: true,
  COOKIE_SAME_SITE: 'lax' as const,
} as const;

/**
 * Password Policy Configuration
 */
export const PASSWORD_POLICY = {
  /**
   * Minimum password length
   */
  MIN_LENGTH: 8,

  /**
   * Maximum password length (to prevent DoS)
   */
  MAX_LENGTH: 128,

  /**
   * Minimum zxcvbn strength score (0-4)
   * 0: too guessable (risky password)
   * 1: very guessable (protection from throttled online attacks)
   * 2: somewhat guessable (protection from unthrottled online attacks)
   * 3: safely unguessable (moderate protection from offline slow-hash scenario) [RECOMMENDED]
   * 4: very unguessable (strong protection from offline slow-hash scenario)
   */
  MIN_STRENGTH_SCORE: 3,

  /**
   * Require at least one uppercase letter (deprecated - use MIN_STRENGTH_SCORE)
   */
  REQUIRE_UPPERCASE: true,

  /**
   * Require at least one lowercase letter (deprecated - use MIN_STRENGTH_SCORE)
   */
  REQUIRE_LOWERCASE: true,

  /**
   * Require at least one number (deprecated - use MIN_STRENGTH_SCORE)
   */
  REQUIRE_NUMBER: true,

  /**
   * Require at least one special character (deprecated - use MIN_STRENGTH_SCORE)
   */
  REQUIRE_SPECIAL: true,

  /**
   * Special characters allowed in passwords (deprecated - use MIN_STRENGTH_SCORE)
   */
  SPECIAL_CHARS: '!@#$%^&*()_+-=[]{}|;:,.<>?',
} as const;

/**
 * Email Verification Configuration
 */
export const EMAIL_VERIFICATION_CONFIG = {
  /**
   * Verification token expiry in hours (24 hours)
   */
  TOKEN_EXPIRY_HOURS: 24,

  /**
   * Verification token expiry in milliseconds
   */
  TOKEN_EXPIRY_MS: 24 * 60 * 60 * 1000,

  /**
   * Token length (bytes, will be hex-encoded to 2x length)
   */
  TOKEN_LENGTH_BYTES: 32,
} as const;

/**
 * Password Reset Configuration
 */
export const PASSWORD_RESET_CONFIG = {
  /**
   * Reset token expiry in hours (1 hour)
   * Short expiry for security
   */
  TOKEN_EXPIRY_HOURS: 1,

  /**
   * Reset token expiry in milliseconds
   */
  TOKEN_EXPIRY_MS: 60 * 60 * 1000,

  /**
   * Token length (bytes, will be hex-encoded to 2x length)
   */
  TOKEN_LENGTH_BYTES: 32,
} as const;

/**
 * Helper function to get environment-specific configuration
 */
export function getAuthConfig() {
  return {
    password: PASSWORD_CONFIG,
    jwt: JWT_CONFIG,
    refreshToken: REFRESH_TOKEN_CONFIG,
    oauth2: OAUTH2_CONFIG,
    rateLimit: RATE_LIMIT_CONFIG,
    lockout: LOCKOUT_CONFIG,
    mfa: MFA_CONFIG,
    session: SESSION_CONFIG,
    passwordPolicy: PASSWORD_POLICY,
    emailVerification: EMAIL_VERIFICATION_CONFIG,
    passwordReset: PASSWORD_RESET_CONFIG,
  };
}

/**
 * Export all configs as a single object for convenience
 */
export const AUTH_CONFIG = getAuthConfig();
