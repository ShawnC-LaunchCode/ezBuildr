import { decrypt, encrypt, redact } from './encryption';

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureEncrypted(value: string): string {
  if (/^v\d+\./.test(value)) {
    try {
      decrypt(value);
      return value;
    } catch {
      // A caller-controlled string that merely resembles ciphertext must still
      // be encrypted with the server key before it is persisted.
    }
  }
  return encrypt(value);
}

function encryptHeaders(headers: unknown): unknown {
  if (!isJsonObject(headers)) {
    return headers;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      typeof value === 'string' ? ensureEncrypted(value) : value,
    ])
  );
}

export function protectDeliveryDestination(destination: unknown): unknown {
  if (!isJsonObject(destination) || !isJsonObject(destination.config)) {
    return destination;
  }

  const config = { ...destination.config };
  if (destination.type === 'webhook') {
    if (typeof config.secret === 'string' && config.secret.length > 0) {
      config.secret = ensureEncrypted(config.secret);
    }
    if (config.headers !== undefined) {
      config.headers = encryptHeaders(config.headers);
    }
  }

  if (destination.type === 'cloud_storage') {
    if (typeof config.accessKeyId === 'string' && config.accessKeyId.length > 0) {
      config.accessKeyId = ensureEncrypted(config.accessKeyId);
    }
    if (typeof config.secretAccessKey === 'string' && config.secretAccessKey.length > 0) {
      config.secretAccessKey = ensureEncrypted(config.secretAccessKey);
    }
  }

  return { ...destination, config };
}

/** Encrypt all delivery credentials before a final-document step reaches SQL. */
export function protectFinalBlockDeliverySecrets(config: unknown): unknown {
  if (!isJsonObject(config) || !Array.isArray(config.deliveryDestinations)) {
    return config;
  }
  return {
    ...config,
    deliveryDestinations: config.deliveryDestinations.map(protectDeliveryDestination),
  };
}

export function decryptProtectedValue(value: string, label: string): string {
  try {
    return decrypt(value);
  } catch (error) {
    throw new Error(`Unable to decrypt ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function decryptProtectedHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (headers === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      decryptProtectedValue(value, `webhook header ${name}`),
    ])
  );
}

/** Remove all credential material from delivery API responses. */
export function redactDeliveryConfig(configValue: unknown): JsonObject {
  const config = isJsonObject(configValue) ? { ...configValue } : {};
  delete config.secret;
  delete config.secretAccessKey;
  delete config.accessKeyId;

  if (isJsonObject(config.headers)) {
    config.headers = Object.fromEntries(
      Object.keys(config.headers).map((name) => [name, redact('configured')])
    );
  }
  return config;
}
