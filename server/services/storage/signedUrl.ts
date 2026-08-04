import crypto from 'crypto';

/**
 * HMAC signing for locally-served storage files (GH-169B Finding 2).
 *
 * The S3 driver gets real presigned URLs for free from the AWS SDK. The disk
 * driver has no such primitive and no owner record to check against a
 * session — storage keys are shared across tenants' templates, previews, and
 * outputs — so "logged in" is not a usable authorization decision for
 * `/api/storage/files/*`. Instead we mirror S3 presigning semantics with an
 * HMAC over `<key>:<exp>`: the signature itself is the credential.
 *
 * Reuses the SESSION_SECRET-derived-secret pattern already used by
 * CaptchaService (`server/services/CaptchaService.ts`) and the webhook
 * dispatcher (`server/lib/webhooks/dispatcher.ts`) rather than inventing a
 * new secret.
 */
function getStorageSigningSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  // `/api/storage/files/*` is unauthenticated by design — this signature is the
  // only credential guarding it. Falling back to a constant baked into a public
  // repo would let anyone mint a valid URL for any storage key, so production
  // fails closed rather than serving files under a publicly-known key.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET (or JWT_SECRET) is required to sign storage URLs in production'
    );
  }
  return 'dev-storage-signing-secret-that-is-long-enough';
}

function computeSignature(key: string, exp: number): string {
  return crypto
    .createHmac('sha256', getStorageSigningSecret())
    .update(`${key}:${exp}`)
    .digest('hex');
}

export interface SignedStorageUrlParts {
  exp: number;
  sig: string;
}

/** Sign `key`, expiring `expiresInSeconds` from now (default 5 minutes). */
export function signStorageKey(key: string, expiresInSeconds = 300): SignedStorageUrlParts {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return { exp, sig: computeSignature(key, exp) };
}

/**
 * Verify a signature for `key`/`exp` in constant time.
 *
 * `crypto.timingSafeEqual` throws on a buffer-length mismatch rather than
 * returning false, so a length check happens first — a differently-sized
 * (e.g. tampered or truncated) `sig` is simply "not equal", not an
 * unhandled exception.
 */
export function verifyStorageSignature(key: string, exp: number, sig: string): boolean {
  const expected = Buffer.from(computeSignature(key, exp), 'hex');
  const provided = Buffer.from(sig, 'hex');
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}

/** True when `exp` (unix seconds) has already passed. */
export function isStorageSignatureExpired(exp: number): boolean {
  return exp < Math.floor(Date.now() / 1000);
}
