/**
 * Authentication Error Hierarchy
 *
 * Standardized error classes for authentication and authorization failures.
 * Each error includes a unique code for consistent API responses.
 */

export enum AuthErrorCode {
  AUTHENTICATION_FAILED = 'AUTH_001',
  TOKEN_EXPIRED = 'AUTH_002',
  INVALID_TOKEN = 'AUTH_003',
  INVALID_CREDENTIALS = 'AUTH_004',
  ACCOUNT_LOCKED = 'AUTH_005',
  EMAIL_NOT_VERIFIED = 'AUTH_006',
  MFA_REQUIRED = 'AUTH_007',
  UNAUTHORIZED = 'AUTH_008',
  FORBIDDEN = 'AUTH_009',
  PROVIDER_MISMATCH = 'AUTH_010',
}

/**
 * Base authentication error class
 */
export class AuthenticationError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: AuthErrorCode = AuthErrorCode.AUTHENTICATION_FAILED,
    statusCode: number = 401
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true; // Indicates this is an expected error
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Token has expired and needs to be refreshed
 */
export class TokenExpiredError extends AuthenticationError {
  constructor(message: string = 'Token has expired') {
    super(message, AuthErrorCode.TOKEN_EXPIRED, 401);
  }
}

/**
 * Token is malformed, invalid signature, or otherwise invalid
 */
export class InvalidTokenError extends AuthenticationError {
  constructor(message: string = 'Invalid token') {
    super(message, AuthErrorCode.INVALID_TOKEN, 401);
  }
}

/**
 * Username/password or other credentials are incorrect
 */
export class InvalidCredentialsError extends AuthenticationError {
  constructor(message: string = 'Invalid credentials') {
    super(message, AuthErrorCode.INVALID_CREDENTIALS, 401);
  }
}

/**
 * Account is locked due to too many failed login attempts
 */
export class AccountLockedError extends AuthenticationError {
  public readonly lockedUntil?: Date;
  public readonly remainingMinutes?: number;

  constructor(lockedUntil?: Date, message?: string) {
    const defaultMessage = lockedUntil
      ? `Account is locked until ${lockedUntil.toISOString()}`
      : 'Account is locked due to too many failed login attempts';

    super(message || defaultMessage, AuthErrorCode.ACCOUNT_LOCKED, 423);
    this.lockedUntil = lockedUntil;

    if (lockedUntil) {
      this.remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / (1000 * 60));
    }
  }
}

/**
 * Email address has not been verified
 */
export class EmailNotVerifiedError extends AuthenticationError {
  constructor(message: string = 'Email address not verified') {
    super(message, AuthErrorCode.EMAIL_NOT_VERIFIED, 403);
  }
}

/**
 * Multi-factor authentication is required to proceed
 */
export class MfaRequiredError extends AuthenticationError {
  public readonly mfaToken?: string;

  constructor(mfaToken?: string, message: string = 'Multi-factor authentication required') {
    super(message, AuthErrorCode.MFA_REQUIRED, 403);
    this.mfaToken = mfaToken;
  }
}

/**
 * User is not authenticated (no token provided)
 */
export class UnauthorizedError extends AuthenticationError {
  constructor(message: string = 'Authentication required') {
    super(message, AuthErrorCode.UNAUTHORIZED, 401);
  }
}

/**
 * User is authenticated but lacks permission for the resource
 */
export class ForbiddenError extends AuthenticationError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, AuthErrorCode.FORBIDDEN, 403);
  }
}

/**
 * User attempted to login with wrong provider (e.g. password login for Google account)
 */
export class AuthProviderMismatchError extends AuthenticationError {
  public readonly provider: string;

  constructor(provider: string, message?: string) {
    const errorMsg = message || `This account uses ${provider} authentication. Please sign in with ${provider}.`;
    super(errorMsg, AuthErrorCode.PROVIDER_MISMATCH, 400); // 400 Bad Request
    this.provider = provider;
  }
}

/**
 * Type guard to check if an error is an authentication error
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if an error is operational (expected)
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AuthenticationError) {
    return error.isOperational;
  }
  return false;
}
