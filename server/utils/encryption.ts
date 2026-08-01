/**
 * Encryption Utilities for Secrets Management
 * Uses AES-256-GCM with envelope encryption
 * Master key stored in environment variable VL_MASTER_KEY
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Parse VL_KEYS from environment to a map of version -> key buffer.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function getVersionedKeys(): Partial<Record<string, Buffer>> {
  const vlKeysStr = process.env.VL_KEYS;
  if (!vlKeysStr) {
    return {};
  }
  try {
    const keysMap: unknown = JSON.parse(vlKeysStr);
    if (!isStringRecord(keysMap)) {
      return {};
    }

    const parsed: Partial<Record<string, Buffer>> = {};
    for (const [version, keyB64] of Object.entries(keysMap)) {
      const key = Buffer.from(keyB64, 'base64');
      if (key.length === KEY_LENGTH) {
        parsed[version] = key;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Get the master encryption key from environment
 * Must be a 32-byte (256-bit) key in base64 format
 */
function getMasterKey(): Buffer {
  const masterKeyB64 = process.env.VL_MASTER_KEY;

  if (!masterKeyB64) {
    throw new Error('VL_MASTER_KEY environment variable not set. Cannot encrypt/decrypt secrets.');
  }

  try {
    const masterKey = Buffer.from(masterKeyB64, 'base64');

    if (masterKey.length !== KEY_LENGTH) {
      throw new Error(`Master key must be ${KEY_LENGTH} bytes (256 bits). Got ${masterKey.length} bytes.`);
    }

    return masterKey;
  } catch (error) {
    throw new Error(`Invalid VL_MASTER_KEY format. Must be base64-encoded 32-byte key: ${(error as Error).message}`);
  }
}

/**
 * Generate a random master key (for initial setup)
 * Returns a base64-encoded 32-byte key
 */
export function generateMasterKey(): string {
  const key = crypto.randomBytes(KEY_LENGTH);
  return key.toString('base64');
}

/**
 * Encrypt a plaintext value using AES-256-GCM
 * Returns a base64-encoded string containing: nonce + authTag + ciphertext
 *
 * Format: [12-byte nonce][16-byte auth tag][variable-length ciphertext]
 */
export function encrypt(plaintext: string): string {
  try {
    const masterKey = getMasterKey();

    // Generate random IV/nonce (12 bytes for GCM)
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: nonce + authTag + ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);

    // Return as base64 with version prefix
    // Check if VL_KEYS is defined to pick highest version, else default to 'v1'
    const keysMap = getVersionedKeys();
    const activeVersion = Object.keys(keysMap).sort().pop() ?? 'v1';

    return `${activeVersion}.${combined.toString('base64')}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${(error as Error).message}`);
  }
}

/**
 * Decrypt a value encrypted with encrypt()
 * Expects a base64-encoded string containing: nonce + authTag + ciphertext
 */
function tryDecryptWithKey(encryptedB64: string, key: Buffer): string {
  // Decode from base64
  const combined = Buffer.from(encryptedB64, 'base64');

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

function tryDecryptWithRetiredKeys(encryptedB64: string): string | undefined {
  const retiredKeysStr = process.env.VL_RETIRED_KEYS;
  if (!retiredKeysStr) {
    return undefined;
  }

  const retiredKeys = retiredKeysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
  for (const keyB64 of retiredKeys) {
    try {
      const key = Buffer.from(keyB64, 'base64');
      if (key.length === KEY_LENGTH) {
        return tryDecryptWithKey(encryptedB64, key);
      }
    } catch {
      // Ignore decryption failure for this retired key, try next
    }
  }

  return undefined;
}

/**
 * Decrypt a value encrypted with encrypt()
 * Supports legacy format and versioned prefixes (v1., v2.).
 * Reads specific key version from VL_KEYS, falling back to VL_MASTER_KEY.
 */
export function decrypt(encryptedPayload: string): string {
  try {
    // Check if payload has a version prefix (e.g. "v1.ABC...")
    const versionMatch = encryptedPayload.match(/^(v\d+)\.(.+)$/);
    
    let encryptedB64 = encryptedPayload;
    let version = 'v1'; // Default if unversioned

    if (versionMatch) {
      version = versionMatch[1] ?? version;
      encryptedB64 = versionMatch[2] ?? encryptedB64;
    }

    const keysMap = getVersionedKeys();
    const targetedKey = keysMap[version];

    if (targetedKey) {
      try {
        return tryDecryptWithKey(encryptedB64, targetedKey);
      } catch (e) {
        // Targeted key failed, we can optionally fall back below
      }
    }

    // Fallback to VL_MASTER_KEY for legacy/default v1 behavior
    const masterKey = getMasterKey();
    
    try {
      return tryDecryptWithKey(encryptedB64, masterKey);
    } catch (primaryError) {
      // Final fallback to retired keys logic if the user hasn't migrated fully to VL_KEYS JSON format
      const retiredResult = tryDecryptWithRetiredKeys(encryptedB64);
      if (retiredResult !== undefined) {
        return retiredResult;
      }
      throw primaryError;
    }
  } catch (error) {
    // Authentication failures will throw here
    throw new Error(`Decryption failed: ${(error as Error).message}`);
  }
}

/**
 * Redact a sensitive value for logging
 * Returns a fixed-length masked string
 */
export function redact(value: string | null | undefined): string {
  if (!value) {return '(empty)';}
  return '••••••••';
}

/**
 * Redact secrets from an object (for logging)
 * Returns a new object with sensitive fields redacted
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[] = ['password', 'token', 'secret', 'key', 'apiKey', 'apiSecret', 'clientSecret', 'authorization']
): T {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(k => keyLower.includes(k.toLowerCase()));

    if (isSensitive && typeof value === 'string') {
      redacted[key] = redact(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactObject(value as Record<string, unknown>, sensitiveKeys);
    } else {
      redacted[key] = value;
    }
  }

  return redacted as T;
}

/**
 * SECURITY FIX: Hash a token using SHA-256 for constant-time comparison
 * Used for magic links, reset tokens, etc. to prevent timing attacks
 * @param token The plaintext token to hash
 * @returns SHA-256 hash of the token as hex string
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mask a secret value for display (shows first 4 and last 4 characters)
 * Example: "sk_test_1234567890abcdef" -> "sk_t...cdef"
 */
export function maskSecret(value: string): string {
  if (!value || value.length <= 8) {
    return redact(value);
  }

  const prefix = value.substring(0, 4);
  const suffix = value.substring(value.length - 4);
  return `${prefix}...${suffix}`;
}

/**
 * Validate that the master key is properly configured
 * Throws an error if the key is missing or invalid
 */
export function validateMasterKey(): void {
  getMasterKey(); // Will throw if invalid
}

/**
 * Generate a secure random API token
 * Returns a base64url-encoded string (URL-safe, no padding)
 * Default length: 48 bytes -> 64 characters when base64url-encoded
 */
export function generateApiToken(byteLength: number = 48): string {
  const buffer = crypto.randomBytes(byteLength);
  // Use base64url encoding (URL-safe, no padding)
  return buffer.toString('base64url');
}



/**
 * Verify that a plaintext token matches a stored hash
 * Returns true if they match, false otherwise
 */
export function verifyToken(plainToken: string, storedHash: string): boolean {
  const computedHash = hashToken(plainToken);
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    // Hashes have different lengths, not equal
    return false;
  }
}
