/**
 * External Connections Service
 * Manages reusable API connection configurations for HTTP nodes
 */

import { eq, and } from 'drizzle-orm';

import { externalConnections, secrets, type ExternalConnection, type InsertExternalConnection } from '@shared/schema';

import { db } from '../db';

import { getSecretValueById } from './secrets';

/**
 * Connection with secret metadata (no plaintext values)
 */
export interface ConnectionWithSecret {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  authType: string;
  secretId: string | null;
  secretKey?: string; // Key name from secrets table
  defaultHeaders: Record<string, any>;
  timeoutMs: number | null;
  retries: number | null;
  backoffMs: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Input for creating a new connection
 */
export interface CreateConnectionInput {
  projectId: string;
  name: string;
  baseUrl: string;
  authType: 'api_key' | 'bearer' | 'oauth2' | 'basic_auth' | 'none';
  secretId?: string | null;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/**
 * Input for updating a connection
 */
export interface UpdateConnectionInput {
  name?: string;
  baseUrl?: string;
  authType?: 'api_key' | 'bearer' | 'oauth2' | 'basic_auth' | 'none';
  secretId?: string | null;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/**
 * List all external connections for a project
 */
export async function listConnections(projectId: string): Promise<ConnectionWithSecret[]> {
  const results = await db
    .select({
      connection: externalConnections,
      secretKey: secrets.key,
    })
    .from(externalConnections)
    .leftJoin(secrets, eq(externalConnections.secretId, secrets.id))
    .where(eq(externalConnections.projectId, projectId));

  return results.map((r: any) => ({
    id: r.connection.id,
    projectId: r.connection.projectId,
    name: r.connection.name,
    baseUrl: r.connection.baseUrl,
    authType: r.connection.authType,
    secretId: r.connection.secretId,
    secretKey: r.secretKey ?? undefined,
    defaultHeaders: (r.connection.defaultHeaders as Record<string, any>) || {},
    timeoutMs: r.connection.timeoutMs,
    retries: r.connection.retries,
    backoffMs: r.connection.backoffMs,
    createdAt: r.connection.createdAt,
    updatedAt: r.connection.updatedAt,
  }));
}

/**
 * Get a connection by ID
 */
export async function getConnection(projectId: string, connectionId: string): Promise<ConnectionWithSecret | null> {
  const results = await db
    .select({
      connection: externalConnections,
      secretKey: secrets.key,
    })
    .from(externalConnections)
    .leftJoin(secrets, eq(externalConnections.secretId, secrets.id))
    .where(and(eq(externalConnections.id, connectionId), eq(externalConnections.projectId, projectId)));

  if (results.length === 0) {return null;}

  const r = results[0];
  return {
    id: r.connection.id,
    projectId: r.connection.projectId,
    name: r.connection.name,
    baseUrl: r.connection.baseUrl,
    authType: r.connection.authType,
    secretId: r.connection.secretId,
    secretKey: r.secretKey ?? undefined,
    defaultHeaders: (r.connection.defaultHeaders as Record<string, any>) || {},
    timeoutMs: r.connection.timeoutMs,
    retries: r.connection.retries,
    backoffMs: r.connection.backoffMs,
    createdAt: r.connection.createdAt,
    updatedAt: r.connection.updatedAt,
  };
}

/**
 * Get connection by name
 */
export async function getConnectionByName(projectId: string, name: string): Promise<ConnectionWithSecret | null> {
  const results = await db
    .select({
      connection: externalConnections,
      secretKey: secrets.key,
    })
    .from(externalConnections)
    .leftJoin(secrets, eq(externalConnections.secretId, secrets.id))
    .where(and(eq(externalConnections.projectId, projectId), eq(externalConnections.name, name)));

  if (results.length === 0) {return null;}

  const r = results[0];
  return {
    id: r.connection.id,
    projectId: r.connection.projectId,
    name: r.connection.name,
    baseUrl: r.connection.baseUrl,
    authType: r.connection.authType,
    secretId: r.connection.secretId,
    secretKey: r.secretKey ?? undefined,
    defaultHeaders: (r.connection.defaultHeaders as Record<string, any>) || {},
    timeoutMs: r.connection.timeoutMs,
    retries: r.connection.retries,
    backoffMs: r.connection.backoffMs,
    createdAt: r.connection.createdAt,
    updatedAt: r.connection.updatedAt,
  };
}

/**
 * Check if a connection name already exists
 */
export async function connectionNameExists(projectId: string, name: string, excludeId?: string): Promise<boolean> {
  const results = await db
    .select({ id: externalConnections.id })
    .from(externalConnections)
    .where(and(eq(externalConnections.projectId, projectId), eq(externalConnections.name, name)));

  if (excludeId) {
    return results.some((r: any) => r.id !== excludeId);
  }

  return results.length > 0;
}

/**
 * Create a new external connection
 */
export async function createConnection(input: CreateConnectionInput): Promise<ConnectionWithSecret> {
  // Check for duplicate name
  const exists = await connectionNameExists(input.projectId, input.name);
  if (exists) {
    throw new Error(`Connection with name '${input.name}' already exists in this project`);
  }

  // Validate secret if provided
  if (input.secretId) {
    const results = await db
      .select({ id: secrets.id })
      .from(secrets)
      .where(and(eq(secrets.id, input.secretId), eq(secrets.projectId, input.projectId)));

    if (results.length === 0) {
      throw new Error('Secret not found in this project');
    }
  }

  // Insert
  const [result] = await db
    .insert(externalConnections)
    .values({
      projectId: input.projectId,
      name: input.name,
      baseUrl: input.baseUrl,
      authType: input.authType,
      secretId: input.secretId || null,
      defaultHeaders: input.defaultHeaders || {},
      timeoutMs: input.timeoutMs ?? 8000,
      retries: input.retries ?? 2,
      backoffMs: input.backoffMs ?? 250,
    })
    .returning();

  // Get with secret key
  const connection = await getConnection(input.projectId, result.id);
  if (!connection) {
    throw new Error('Failed to create connection');
  }

  return connection;
}

/**
 * Update an external connection
 */
export async function updateConnection(
  projectId: string,
  connectionId: string,
  input: UpdateConnectionInput
): Promise<ConnectionWithSecret> {
  // Check if connection exists
  const existing = await getConnection(projectId, connectionId);
  if (!existing) {
    throw new Error('Connection not found');
  }

  // Check for duplicate name if name is being changed
  if (input.name && input.name !== existing.name) {
    const exists = await connectionNameExists(projectId, input.name, connectionId);
    if (exists) {
      throw new Error(`Connection with name '${input.name}' already exists in this project`);
    }
  }

  // Validate secret if provided
  if (input.secretId) {
    const results = await db
      .select({ id: secrets.id })
      .from(secrets)
      .where(and(eq(secrets.id, input.secretId), eq(secrets.projectId, projectId)));

    if (results.length === 0) {
      throw new Error('Secret not found in this project');
    }
  }

  // Build update object
  const updates: Partial<InsertExternalConnection> = {};

  if (input.name !== undefined) {updates.name = input.name;}
  if (input.baseUrl !== undefined) {updates.baseUrl = input.baseUrl;}
  if (input.authType !== undefined) {updates.authType = input.authType;}
  if (input.secretId !== undefined) {updates.secretId = input.secretId;}
  if (input.defaultHeaders !== undefined) {updates.defaultHeaders = input.defaultHeaders;}
  if (input.timeoutMs !== undefined) {updates.timeoutMs = input.timeoutMs;}
  if (input.retries !== undefined) {updates.retries = input.retries;}
  if (input.backoffMs !== undefined) {updates.backoffMs = input.backoffMs;}

  // Update
  const [result] = await db
    .update(externalConnections)
    .set(updates)
    .where(and(eq(externalConnections.id, connectionId), eq(externalConnections.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error('Failed to update connection');
  }

  // Get with secret key
  const connection = await getConnection(projectId, result.id);
  if (!connection) {
    throw new Error('Failed to retrieve updated connection');
  }

  return connection;
}

/**
 * Delete an external connection
 */
export async function deleteConnection(projectId: string, connectionId: string): Promise<boolean> {
  const result = await db
    .delete(externalConnections)
    .where(and(eq(externalConnections.id, connectionId), eq(externalConnections.projectId, projectId)))
    .returning({ id: externalConnections.id });

  return result.length > 0;
}

/**
 * Resolve a connection with its secret value (for execution)
 * WARNING: Returns decrypted secret value. Only use for workflow execution.
 */
export interface ResolvedConnection {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  secretValue?: string; // Decrypted secret value
  defaultHeaders: Record<string, any>;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

export async function resolveConnection(
  projectId: string,
  connectionId: string
): Promise<ResolvedConnection | null> {
  const connection = await getConnection(projectId, connectionId);
  if (!connection) {return null;}

  let secretValue: string | undefined;
  if (connection.secretId) {
    const value = await getSecretValueById(projectId, connection.secretId);
    secretValue = value ?? undefined;
  }

  return {
    id: connection.id,
    name: connection.name,
    baseUrl: connection.baseUrl,
    authType: connection.authType,
    secretValue,
    defaultHeaders: connection.defaultHeaders,
    timeoutMs: connection.timeoutMs ?? 8000,
    retries: connection.retries ?? 2,
    backoffMs: connection.backoffMs ?? 250,
  };
}
