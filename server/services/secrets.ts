/**
 * Secrets Service
 * Manages encrypted secrets (API keys, tokens, OAuth2 credentials) for projects
 * All values are encrypted at rest using AES-256-GCM envelope encryption
 */
import { eq, and } from 'drizzle-orm';

import { secrets, type InsertSecret } from '@shared/schema';

import { db } from '../db';
import { logger } from '../logger';
import { encrypt, decrypt } from '../utils/encryption';
import type { } from 'zod';
/**
 * Secret metadata returned to clients (no plaintext values)
 */
export interface SecretMetadata {
  id: string;
  projectId: string;
  key: string;
  type: 'api_key' | 'bearer' | 'oauth2' | 'basic_auth';
  metadata?: Record<string, any>;
  maskedValue?: string; // Optional masked value for display
  createdAt: Date | null;
  updatedAt: Date | null;
}
/**
 * Input for creating a new secret
 */
export interface CreateSecretInput {
  projectId: string;
  key: string;
  valuePlain: string; // Plaintext value (will be encrypted)
  type: 'api_key' | 'bearer' | 'oauth2' | 'basic_auth';
  metadata?: Record<string, any>; // OAuth2 config, etc.
}
/**
 * Input for updating a secret
 */
export interface UpdateSecretInput {
  key?: string;
  valuePlain?: string; // New plaintext value (will be encrypted)
  type?: 'api_key' | 'bearer' | 'oauth2' | 'basic_auth';
  metadata?: Record<string, any>;
}
/**
 * List all secrets for a project (metadata only, no values)
 */
export async function listSecrets(projectId: string): Promise<SecretMetadata[]> {
  const results = await db
    .select({
      id: secrets.id,
      projectId: secrets.projectId,
      key: secrets.key,
      type: secrets.type,
      metadata: secrets.metadata,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(eq(secrets.projectId, projectId));
  return results.map((s: any) => ({
    ...s,
    type: s.type as 'api_key' | 'bearer' | 'oauth2' | 'basic_auth',
    metadata: s.metadata as Record<string, any> | undefined,
  }));
}
/**
 * Get a secret by ID (metadata only)
 */
export async function getSecretMetadata(projectId: string, secretId: string): Promise<SecretMetadata | null> {
  const [result] = await db
    .select({
      id: secrets.id,
      projectId: secrets.projectId,
      key: secrets.key,
      type: secrets.type,
      metadata: secrets.metadata,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(and(eq(secrets.id, secretId), eq(secrets.projectId, projectId)));
  if (!result) { return null; }
  return {
    ...result,
    type: result.type,
    metadata: result.metadata as Record<string, any> | undefined,
  };
}
/**
 * Get a secret's plaintext value by key (use sparingly)
 * WARNING: Returns decrypted value. Only use for workflow execution, never for API responses.
 */
export async function getSecretValue(projectId: string, key: string): Promise<string | null> {
  const [result] = await db
    .select()
    .from(secrets)
    .where(and(eq(secrets.projectId, projectId), eq(secrets.key, key)));
  if (!result) { return null; }
  try {
    return decrypt(result.valueEnc);
  } catch (error) {
    logger.error({ error, key }, `Failed to decrypt secret ${key}`);
    throw new Error(`Failed to decrypt secret: ${(error as Error).message}`);
  }
}
/**
 * Get a secret's plaintext value by ID (use sparingly)
 * WARNING: Returns decrypted value. Only use for workflow execution, never for API responses.
 */
export async function getSecretValueById(projectId: string, secretId: string): Promise<string | null> {
  const [result] = await db
    .select()
    .from(secrets)
    .where(and(eq(secrets.id, secretId), eq(secrets.projectId, projectId)));
  if (!result) { return null; }
  try {
    return decrypt(result.valueEnc);
  } catch (error) {
    logger.error({ error, secretId }, `Failed to decrypt secret ${secretId}`);
    throw new Error(`Failed to decrypt secret: ${(error as Error).message}`);
  }
}
/**
 * Check if a secret key already exists in the project
 */
export async function secretKeyExists(projectId: string, key: string, excludeId?: string): Promise<boolean> {
  const query = db
    .select({ id: secrets.id })
    .from(secrets)
    .where(and(eq(secrets.projectId, projectId), eq(secrets.key, key)));
  const results = await query;
  if (excludeId) {
    return results.some((r: any) => r.id !== excludeId);
  }
  return results.length > 0;
}
/**
 * Create a new secret
 */
export async function createSecret(input: CreateSecretInput): Promise<SecretMetadata> {
  // Check for duplicate key
  const exists = await secretKeyExists(input.projectId, input.key);
  if (exists) {
    throw new Error(`Secret with key '${input.key}' already exists in this project`);
  }
  // Encrypt the value
  const valueEnc = encrypt(input.valuePlain);
  // Insert
  const [result] = await db
    .insert(secrets)
    .values({
      projectId: input.projectId,
      key: input.key,
      valueEnc,
      type: input.type,
      metadata: input.metadata || {},
    })
    .returning();
  return {
    id: result.id,
    projectId: result.projectId,
    key: result.key,
    type: result.type,
    metadata: result.metadata as Record<string, any> | undefined,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}
/**
 * Update a secret
 */
export async function updateSecret(
  projectId: string,
  secretId: string,
  input: UpdateSecretInput
): Promise<SecretMetadata> {
  // Check if secret exists
  const existing = await getSecretMetadata(projectId, secretId);
  if (!existing) {
    throw new Error('Secret not found');
  }
  // Check for duplicate key if key is being changed
  if (input.key && input.key !== existing.key) {
    const exists = await secretKeyExists(projectId, input.key, secretId);
    if (exists) {
      throw new Error(`Secret with key '${input.key}' already exists in this project`);
    }
  }
  // Build update object
  const updates: Partial<InsertSecret> = {};
  if (input.key) { updates.key = input.key; }
  if (input.type) { updates.type = input.type; }
  if (input.metadata !== undefined) { updates.metadata = input.metadata; }
  if (input.valuePlain) {
    updates.valueEnc = encrypt(input.valuePlain);
  }
  // Update
  const [result] = await db
    .update(secrets)
    .set(updates as any)
    .where(and(eq(secrets.id, secretId), eq(secrets.projectId, projectId)))
    .returning();
  if (!result) {
    throw new Error('Failed to update secret');
  }
  return {
    id: result.id,
    projectId: result.projectId,
    key: result.key,
    type: result.type,
    metadata: result.metadata as Record<string, any> | undefined,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}
/**
 * Delete a secret
 */
export async function deleteSecret(projectId: string, secretId: string): Promise<boolean> {
  const result = await db
    .delete(secrets)
    .where(and(eq(secrets.id, secretId), eq(secrets.projectId, projectId)))
    .returning({ id: secrets.id });
  return result.length > 0;
}
/**
 * Rotate a secret (generate new value)
 * This is a helper that updates the value while keeping the same key
 */
export async function rotateSecret(
  projectId: string,
  secretId: string,
  newValuePlain: string
): Promise<SecretMetadata> {
  return updateSecret(projectId, secretId, { valuePlain: newValuePlain });
}
/**
 * Test a secret by trying to decrypt it
 * Returns true if the secret can be decrypted successfully
 */
export async function testSecret(projectId: string, secretId: string): Promise<boolean> {
  try {
    const value = await getSecretValueById(projectId, secretId);
    return value !== null;
  } catch (error) {
    return false;
  }
}