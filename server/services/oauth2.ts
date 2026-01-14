/**
 * OAuth2 Service
 * Handles OAuth2 Client Credentials flow and 3-legged OAuth2 flow with token caching
 */

import crypto from 'crypto';

import { logger } from '../logger';
import { redactObject, encrypt, decrypt } from '../utils/encryption';

import { oauth2Cache } from './cache';

/**
 * OAuth2 token response
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string; // Usually 'Bearer'
  expires_in: number; // Seconds
  scope?: string;
}

/**
 * OAuth2 client credentials config
 */
export interface OAuth2ClientCredentialsConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  tenantId?: string; // For cache key scoping
  projectId?: string; // For cache key scoping
}

/**
 * Generate a cache key for OAuth2 tokens
 */
function generateCacheKey(config: OAuth2ClientCredentialsConfig): string {
  const parts = [
    config.tenantId || 'global',
    config.projectId || 'global',
    config.tokenUrl,
    config.clientId,
    config.scope || '',
  ];
  return parts.join(':');
}

/**
 * Fetch an OAuth2 access token using client credentials flow
 * Implements caching to avoid unnecessary token requests
 *
 * @param config OAuth2 configuration
 * @returns Access token and metadata
 */
export async function getOAuth2Token(config: OAuth2ClientCredentialsConfig): Promise<OAuth2TokenResponse> {
  const cacheKey = generateCacheKey(config);

  // Check cache first
  const cached = oauth2Cache.get(cacheKey);
  if (cached) {
    // Check if token is still valid (with 30s buffer)
    const expiresAt = cached.obtainedAt + (cached.expires_in * 1000);
    const now = Date.now();

    if (now < expiresAt - 30000) {
      // Token is still valid, return from cache
      return {
        access_token: cached.access_token,
        token_type: cached.token_type,
        expires_in: Math.floor((expiresAt - now) / 1000), // Remaining lifetime
      };
    }

    // Token expired or near expiry, delete from cache
    oauth2Cache.delete(cacheKey);
  }

  // Fetch new token
  const token = await fetchOAuth2Token(config);

  // Cache the token (with 30s buffer before expiry)
  oauth2Cache.set(cacheKey, token);

  return token;
}

/**
 * Fetch a fresh OAuth2 token (no caching)
 * Uses application/x-www-form-urlencoded POST with client credentials
 *
 * @param config OAuth2 configuration
 * @returns Access token and metadata
 */
async function fetchOAuth2Token(config: OAuth2ClientCredentialsConfig): Promise<OAuth2TokenResponse> {
  const { tokenUrl, clientId, clientSecret, scope } = config;

  try {
    // Build form body
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    if (scope) {
      params.append('scope', scope);
    }

    // Make request
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error({
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        tokenUrl: redactObject({ tokenUrl }).tokenUrl,
      }, 'OAuth2 token request failed');
      throw new Error(`OAuth2 token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response
    if (!data.access_token || !data.token_type) {
      logger.error({ data: redactObject(data) }, 'Invalid OAuth2 token response');
      throw new Error('Invalid OAuth2 token response: missing access_token or token_type');
    }

    return {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in || 3600, // Default to 1 hour if not provided
      scope: data.scope,
    };
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      tokenUrl: redactObject({ tokenUrl }).tokenUrl,
    }, 'OAuth2 token fetch error');
    throw new Error(`Failed to obtain OAuth2 token: ${(error as Error).message}`);
  }
}

/**
 * Invalidate a cached OAuth2 token
 * Useful when a token is known to be invalid (e.g., revoked)
 *
 * @param config OAuth2 configuration
 */
export function invalidateOAuth2Token(config: OAuth2ClientCredentialsConfig): void {
  const cacheKey = generateCacheKey(config);
  oauth2Cache.delete(cacheKey);
}

/**
 * Clear all cached OAuth2 tokens
 */
export function clearOAuth2TokenCache(): void {
  oauth2Cache.clear();
}

/**
 * Test OAuth2 credentials by attempting to fetch a token
 * Returns true if successful, false otherwise
 *
 * @param config OAuth2 configuration
 * @returns True if token fetch succeeds
 */
export async function testOAuth2Credentials(config: OAuth2ClientCredentialsConfig): Promise<boolean> {
  try {
    await fetchOAuth2Token(config);
    return true;
  } catch (error) {
    return false;
  }
}

// =====================================================================
// OAuth2 3-Legged Authorization Flow (Authorization Code Grant)
// =====================================================================

/**
 * OAuth2 3-legged flow configuration
 */
export interface OAuth2ThreeLegConfig {
  authUrl: string;          // Authorization endpoint
  tokenUrl: string;         // Token endpoint
  clientId: string;         // OAuth2 client ID
  clientSecret: string;     // OAuth2 client secret
  redirectUri: string;      // Callback URL (must match provider config)
  scope?: string;           // Space-separated scopes
  tenantId?: string;        // For cache key scoping
  projectId?: string;       // For cache key scoping
}

/**
 * OAuth2 state record for CSRF protection
 * Stored temporarily during auth flow
 */
export interface OAuth2StateRecord {
  connectionId: string;
  state: string;            // Random CSRF token
  codeVerifier?: string;    // For PKCE (if needed in future)
  createdAt: number;        // Unix timestamp
}

/**
 * OAuth2 token response with refresh token
 */
export interface OAuth2ThreeLegTokenResponse extends OAuth2TokenResponse {
  refresh_token?: string;
}

/**
 * In-memory state store for OAuth2 flows
 * Key: state token, Value: state record
 * Expires after 10 minutes
 */
const oauth2StateStore = new Map<string, OAuth2StateRecord>();
const OAUTH2_STATE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Clean up expired state records
 */
function cleanExpiredStates() {
  const now = Date.now();
  for (const [state, record] of oauth2StateStore.entries()) {
    if (now - record.createdAt > OAUTH2_STATE_TTL) {
      oauth2StateStore.delete(state);
    }
  }
}

// RESOURCE LEAK FIX: Store interval ID for proper cleanup
let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * Start OAuth2 state cleanup interval
 */
export function startOAuth2StateCleanup(): void {
  if (cleanupIntervalId) {
    return; // Already running
  }
  // Clean up expired states every minute
  cleanupIntervalId = setInterval(cleanExpiredStates, 60000);
}

/**
 * Stop OAuth2 state cleanup interval (for graceful shutdown)
 */
export function stopOAuth2StateCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Start cleanup on module load
startOAuth2StateCleanup();

/**
 * Generate OAuth2 authorization URL for 3-legged flow
 *
 * @param config OAuth2 3-legged configuration
 * @param connectionId Connection ID to associate with this flow
 * @returns Authorization URL and state token
 */
export function generateOAuth2AuthorizationUrl(
  config: OAuth2ThreeLegConfig,
  connectionId: string
): { authorizationUrl: string; state: string } {
  // Generate random state token for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');

  // Store state for later validation
  oauth2StateStore.set(state, {
    connectionId,
    state,
    createdAt: Date.now(),
  });

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
  });

  if (config.scope) {
    params.append('scope', config.scope);
  }

  const authorizationUrl = `${config.authUrl}?${params.toString()}`;

  return { authorizationUrl, state };
}

/**
 * Validate OAuth2 callback state token
 *
 * @param state State token from callback
 * @returns State record if valid, undefined if invalid/expired
 */
export function validateOAuth2State(state: string): OAuth2StateRecord | undefined {
  const record = oauth2StateStore.get(state);
  if (!record) {
    return undefined;
  }

  // Check expiration
  if (Date.now() - record.createdAt > OAUTH2_STATE_TTL) {
    oauth2StateStore.delete(state);
    return undefined;
  }

  return record;
}

/**
 * Exchange authorization code for access token
 *
 * @param config OAuth2 3-legged configuration
 * @param code Authorization code from callback
 * @returns Token response with access_token and refresh_token
 */
export async function exchangeOAuth2Code(
  config: OAuth2ThreeLegConfig,
  code: string
): Promise<OAuth2ThreeLegTokenResponse> {
  try {
    // Build form body
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    });

    // Make request
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error({
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        tokenUrl: redactObject({ tokenUrl: config.tokenUrl }).tokenUrl,
      }, 'OAuth2 code exchange failed');
      throw new Error(`OAuth2 code exchange failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response
    if (!data.access_token || !data.token_type) {
      logger.error({ data: redactObject(data) }, 'Invalid OAuth2 token response');
      throw new Error('Invalid OAuth2 token response: missing access_token or token_type');
    }

    return {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in || 3600,
      scope: data.scope,
      refresh_token: data.refresh_token,
    };
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      tokenUrl: redactObject({ tokenUrl: config.tokenUrl }).tokenUrl,
    }, 'OAuth2 code exchange error');
    throw new Error(`Failed to exchange OAuth2 code: ${(error as Error).message}`);
  }
}

/**
 * Refresh OAuth2 access token using refresh token
 *
 * @param config OAuth2 3-legged configuration
 * @param refreshToken Encrypted refresh token
 * @returns New token response
 */
export async function refreshOAuth2Token(
  config: OAuth2ThreeLegConfig,
  refreshToken: string
): Promise<OAuth2ThreeLegTokenResponse> {
  try {
    // Decrypt refresh token
    const decryptedRefreshToken = decrypt(refreshToken);

    // Build form body
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decryptedRefreshToken,
    });

    // Make request
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error({
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        tokenUrl: redactObject({ tokenUrl: config.tokenUrl }).tokenUrl,
      }, 'OAuth2 token refresh failed');
      throw new Error(`OAuth2 token refresh failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response
    if (!data.access_token || !data.token_type) {
      logger.error({ data: redactObject(data) }, 'Invalid OAuth2 token response');
      throw new Error('Invalid OAuth2 token response: missing access_token or token_type');
    }

    return {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in || 3600,
      scope: data.scope,
      refresh_token: data.refresh_token || refreshToken, // Use old refresh token if not rotated
    };
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      tokenUrl: redactObject({ tokenUrl: config.tokenUrl }).tokenUrl,
    }, 'OAuth2 token refresh error');
    throw new Error(`Failed to refresh OAuth2 token: ${(error as Error).message}`);
  }
}

/**
 * Clean up OAuth2 state after successful callback
 *
 * @param state State token to remove
 */
export function cleanupOAuth2State(state: string): void {
  oauth2StateStore.delete(state);
}
