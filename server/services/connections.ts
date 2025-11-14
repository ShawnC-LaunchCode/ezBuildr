/**
 * Connections Service (Stage 16)
 * Manages unified integration connections with OAuth2 3-legged flow support
 */

import { db } from '../db';
import { connections, projects } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  Connection,
  CreateConnectionInput,
  UpdateConnectionInput,
  ConnectionStatus,
  ResolvedConnection,
  OAuth2State
} from '@shared/types/connections';
import { getSecretValue } from './secrets';
import {
  generateOAuth2AuthorizationUrl,
  exchangeOAuth2Code,
  refreshOAuth2Token,
  OAuth2ThreeLegConfig,
  OAuth2ThreeLegTokenResponse
} from './oauth2';
import { encrypt, decrypt } from '../utils/encryption';

/**
 * List all connections for a project
 */
export async function listConnections(projectId: string): Promise<Connection[]> {
  const results = await db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .orderBy(connections.name);

  return results.map(row => ({
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    name: row.name,
    type: row.type as any,
    baseUrl: row.baseUrl ?? undefined,
    authConfig: (row.authConfig as Record<string, any>) || {},
    secretRefs: (row.secretRefs as Record<string, string>) || {},
    oauthState: row.oauthState as OAuth2State | undefined,
    defaultHeaders: (row.defaultHeaders as Record<string, string>) || {},
    timeoutMs: row.timeoutMs ?? 8000,
    retries: row.retries ?? 2,
    backoffMs: row.backoffMs ?? 250,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt ?? undefined,
    lastUsedAt: row.lastUsedAt ?? undefined,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  }));
}

/**
 * Get a connection by ID
 */
export async function getConnection(
  projectId: string,
  connectionId: string
): Promise<Connection | null> {
  const results = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.projectId, projectId)
      )
    );

  if (results.length === 0) {
    return null;
  }

  const row = results[0];
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    name: row.name,
    type: row.type as any,
    baseUrl: row.baseUrl ?? undefined,
    authConfig: (row.authConfig as Record<string, any>) || {},
    secretRefs: (row.secretRefs as Record<string, string>) || {},
    oauthState: row.oauthState as OAuth2State | undefined,
    defaultHeaders: (row.defaultHeaders as Record<string, string>) || {},
    timeoutMs: row.timeoutMs ?? 8000,
    retries: row.retries ?? 2,
    backoffMs: row.backoffMs ?? 250,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt ?? undefined,
    lastUsedAt: row.lastUsedAt ?? undefined,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/**
 * Get a connection by name
 */
export async function getConnectionByName(
  projectId: string,
  name: string
): Promise<Connection | null> {
  const results = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.projectId, projectId),
        eq(connections.name, name)
      )
    );

  if (results.length === 0) {
    return null;
  }

  const row = results[0];
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    name: row.name,
    type: row.type as any,
    baseUrl: row.baseUrl ?? undefined,
    authConfig: (row.authConfig as Record<string, any>) || {},
    secretRefs: (row.secretRefs as Record<string, string>) || {},
    oauthState: row.oauthState as OAuth2State | undefined,
    defaultHeaders: (row.defaultHeaders as Record<string, string>) || {},
    timeoutMs: row.timeoutMs ?? 8000,
    retries: row.retries ?? 2,
    backoffMs: row.backoffMs ?? 250,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt ?? undefined,
    lastUsedAt: row.lastUsedAt ?? undefined,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/**
 * Create a new connection
 */
export async function createConnection(
  input: CreateConnectionInput
): Promise<Connection> {
  // Check for name uniqueness
  const existing = await getConnectionByName(input.projectId, input.name);
  if (existing) {
    throw new Error(`Connection with name "${input.name}" already exists in this project`);
  }

  // Get tenantId from project
  const project = await db
    .select({ tenantId: projects.tenantId })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);

  if (project.length === 0) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const tenantId = project[0].tenantId;

  // Insert connection
  const result = await db
    .insert(connections)
    .values({
      tenantId,
      projectId: input.projectId,
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl,
      authConfig: input.authConfig as any,
      secretRefs: input.secretRefs as any,
      defaultHeaders: input.defaultHeaders as any,
      timeoutMs: input.timeoutMs ?? 8000,
      retries: input.retries ?? 2,
      backoffMs: input.backoffMs ?? 250,
      enabled: true,
    })
    .returning();

  return getConnection(input.projectId, result[0].id) as Promise<Connection>;
}

/**
 * Update a connection
 */
export async function updateConnection(
  projectId: string,
  connectionId: string,
  input: UpdateConnectionInput
): Promise<Connection> {
  // Check if connection exists
  const existing = await getConnection(projectId, connectionId);
  if (!existing) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  // Check name uniqueness if name is being changed
  if (input.name && input.name !== existing.name) {
    const nameConflict = await getConnectionByName(projectId, input.name);
    if (nameConflict) {
      throw new Error(`Connection with name "${input.name}" already exists in this project`);
    }
  }

  // Update connection
  await db
    .update(connections)
    .set({
      name: input.name,
      baseUrl: input.baseUrl,
      authConfig: input.authConfig as any,
      secretRefs: input.secretRefs as any,
      defaultHeaders: input.defaultHeaders as any,
      timeoutMs: input.timeoutMs,
      retries: input.retries,
      backoffMs: input.backoffMs,
      enabled: input.enabled,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.projectId, projectId)
      )
    );

  return getConnection(projectId, connectionId) as Promise<Connection>;
}

/**
 * Delete a connection
 */
export async function deleteConnection(
  projectId: string,
  connectionId: string
): Promise<void> {
  await db
    .delete(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.projectId, projectId)
      )
    );
}

/**
 * Resolve a connection with decrypted secrets
 * INTERNAL USE ONLY - never expose via API
 */
export async function resolveConnection(
  projectId: string,
  connectionId: string
): Promise<ResolvedConnection> {
  const connection = await getConnection(projectId, connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (!connection.enabled) {
    throw new Error(`Connection is disabled: ${connection.name}`);
  }

  // Decrypt all referenced secrets
  const secrets: Record<string, string> = {};
  for (const [refName, secretKey] of Object.entries(connection.secretRefs)) {
    const secretValue = await getSecretValue(projectId, secretKey);
    secrets[refName] = secretValue;
  }

  // Decrypt OAuth2 access token if available
  let accessToken: string | undefined;
  if (connection.oauthState?.accessToken) {
    try {
      accessToken = decrypt(connection.oauthState.accessToken);

      // Check if token is expired
      const now = Date.now();
      if (connection.oauthState.expiresAt && now >= connection.oauthState.expiresAt) {
        // Token expired - try to refresh if refresh token available
        if (connection.oauthState.refreshToken && connection.type === 'oauth2_3leg') {
          accessToken = await refreshConnectionToken(projectId, connectionId);
        } else {
          throw new Error('OAuth2 access token expired and cannot be refreshed');
        }
      }
    } catch (error) {
      console.error('Failed to decrypt OAuth2 access token:', error);
      throw new Error('Failed to decrypt OAuth2 access token');
    }
  }

  return {
    connection,
    secrets,
    accessToken,
  };
}

/**
 * Test a connection by making a simple request
 */
export async function testConnection(
  projectId: string,
  connectionId: string
): Promise<{ success: boolean; statusCode?: number; message: string; responseTime?: number }> {
  const resolved = await resolveConnection(projectId, connectionId);
  const connection = resolved.connection;

  if (!connection.baseUrl) {
    throw new Error('Connection has no baseUrl to test');
  }

  const startTime = Date.now();

  try {
    // Build headers
    const headers: Record<string, string> = {
      ...connection.defaultHeaders,
    };

    // Add auth headers based on connection type
    if (connection.type === 'api_key') {
      const apiKeyLocation = connection.authConfig.apiKeyLocation || 'header';
      const apiKeyName = connection.authConfig.apiKeyName || 'X-API-Key';
      const apiKey = resolved.secrets[connection.authConfig.apiKeyRef || 'apiKey'];

      if (apiKeyLocation === 'header') {
        headers[apiKeyName] = apiKey;
      }
    } else if (connection.type === 'bearer') {
      const token = resolved.secrets[connection.authConfig.tokenRef || 'token'];
      headers['Authorization'] = `Bearer ${token}`;
    } else if (connection.type === 'oauth2_client_credentials' || connection.type === 'oauth2_3leg') {
      if (resolved.accessToken) {
        headers['Authorization'] = `Bearer ${resolved.accessToken}`;
      }
    }

    // Make test request
    const response = await fetch(connection.baseUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(connection.timeoutMs),
    });

    const responseTime = Date.now() - startTime;

    // Update lastTestedAt
    await db
      .update(connections)
      .set({ lastTestedAt: new Date() })
      .where(eq(connections.id, connectionId));

    return {
      success: response.ok,
      statusCode: response.status,
      message: response.ok ? 'Connection test successful' : `HTTP ${response.status}: ${response.statusText}`,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      message: `Connection test failed: ${(error as Error).message}`,
      responseTime,
    };
  }
}

/**
 * Initiate OAuth2 3-legged authorization flow
 */
export async function initiateOAuth2Flow(
  projectId: string,
  connectionId: string,
  baseUrl: string
): Promise<{ authorizationUrl: string; state: string }> {
  const connection = await getConnection(projectId, connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (connection.type !== 'oauth2_3leg') {
    throw new Error(`Connection type must be oauth2_3leg, got: ${connection.type}`);
  }

  // Resolve secrets for client ID and secret
  const clientId = await getSecretValue(projectId, connection.authConfig.clientIdRef);
  const clientSecret = await getSecretValue(projectId, connection.authConfig.clientSecretRef);

  const config: OAuth2ThreeLegConfig = {
    authUrl: connection.authConfig.authUrl,
    tokenUrl: connection.authConfig.tokenUrl,
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/api/connections/oauth/callback`,
    scope: connection.authConfig.scope,
    tenantId: connection.tenantId,
    projectId: connection.projectId,
  };

  return generateOAuth2AuthorizationUrl(config, connectionId);
}

/**
 * Handle OAuth2 callback and store tokens
 */
export async function handleOAuth2Callback(
  projectId: string,
  connectionId: string,
  code: string
): Promise<Connection> {
  const connection = await getConnection(projectId, connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (connection.type !== 'oauth2_3leg') {
    throw new Error(`Connection type must be oauth2_3leg, got: ${connection.type}`);
  }

  // Resolve secrets for client ID and secret
  const clientId = await getSecretValue(projectId, connection.authConfig.clientIdRef);
  const clientSecret = await getSecretValue(projectId, connection.authConfig.clientSecretRef);

  const config: OAuth2ThreeLegConfig = {
    authUrl: connection.authConfig.authUrl,
    tokenUrl: connection.authConfig.tokenUrl,
    clientId,
    clientSecret,
    redirectUri: connection.authConfig.redirectUri,
    scope: connection.authConfig.scope,
    tenantId: connection.tenantId,
    projectId: connection.projectId,
  };

  // Exchange code for tokens
  const tokenResponse: OAuth2ThreeLegTokenResponse = await exchangeOAuth2Code(config, code);

  // Encrypt and store tokens
  const oauthState: OAuth2State = {
    accessToken: encrypt(tokenResponse.access_token),
    refreshToken: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : undefined,
    expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
    scope: tokenResponse.scope,
    tokenType: tokenResponse.token_type,
  };

  // Update connection with OAuth state
  await db
    .update(connections)
    .set({
      oauthState: oauthState as any,
      updatedAt: new Date(),
    })
    .where(eq(connections.id, connectionId));

  return getConnection(projectId, connectionId) as Promise<Connection>;
}

/**
 * Refresh OAuth2 access token
 * Returns the new decrypted access token
 */
export async function refreshConnectionToken(
  projectId: string,
  connectionId: string
): Promise<string> {
  const connection = await getConnection(projectId, connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (connection.type !== 'oauth2_3leg') {
    throw new Error(`Connection type must be oauth2_3leg, got: ${connection.type}`);
  }

  if (!connection.oauthState?.refreshToken) {
    throw new Error('No refresh token available');
  }

  // Resolve secrets for client ID and secret
  const clientId = await getSecretValue(projectId, connection.authConfig.clientIdRef);
  const clientSecret = await getSecretValue(projectId, connection.authConfig.clientSecretRef);

  const config: OAuth2ThreeLegConfig = {
    authUrl: connection.authConfig.authUrl,
    tokenUrl: connection.authConfig.tokenUrl,
    clientId,
    clientSecret,
    redirectUri: connection.authConfig.redirectUri,
    scope: connection.authConfig.scope,
    tenantId: connection.tenantId,
    projectId: connection.projectId,
  };

  // Refresh token
  const tokenResponse = await refreshOAuth2Token(config, connection.oauthState.refreshToken);

  // Encrypt and update tokens
  const oauthState: OAuth2State = {
    accessToken: encrypt(tokenResponse.access_token),
    refreshToken: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : connection.oauthState.refreshToken,
    expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
    scope: tokenResponse.scope,
    tokenType: tokenResponse.token_type,
  };

  // Update connection
  await db
    .update(connections)
    .set({
      oauthState: oauthState as any,
      updatedAt: new Date(),
    })
    .where(eq(connections.id, connectionId));

  // Return decrypted access token
  return tokenResponse.access_token;
}

/**
 * Get connection status (for UI display)
 */
export async function getConnectionStatus(
  projectId: string,
  connectionId: string
): Promise<ConnectionStatus> {
  const connection = await getConnection(projectId, connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  const status: ConnectionStatus = {
    id: connection.id,
    name: connection.name,
    type: connection.type,
    enabled: connection.enabled,
    lastTestedAt: connection.lastTestedAt,
    lastUsedAt: connection.lastUsedAt,
  };

  // Add OAuth2 token status if applicable
  if (connection.oauthState) {
    status.oauthTokenExpiry = connection.oauthState.expiresAt
      ? new Date(connection.oauthState.expiresAt)
      : undefined;
    status.oauthTokenValid = connection.oauthState.expiresAt
      ? Date.now() < connection.oauthState.expiresAt
      : false;
  }

  return status;
}

/**
 * Update last used timestamp
 */
export async function markConnectionUsed(connectionId: string): Promise<void> {
  await db
    .update(connections)
    .set({ lastUsedAt: new Date() })
    .where(eq(connections.id, connectionId));
}
