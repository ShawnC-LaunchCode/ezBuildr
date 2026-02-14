/**
 * Stage 16: Integrations Hub - Connection Type Definitions
 *
 * Type-safe definitions for the unified connection management system
 * supporting API keys, bearer tokens, and OAuth2 flows.
 */

/**
 * Connection type discriminator
 */
export type ConnectionType =
  | "api_key"
  | "bearer"
  | "oauth2_client_credentials"
  | "oauth2_3leg";

/**
 * Base connection configuration shared by all types
 */
export interface BaseConnectionConfig {
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/**
 * OAuth2 provider configuration for client credentials flow
 */
export interface OAuth2ClientCredentialsConfig extends BaseConnectionConfig {
  tokenUrl: string;
  clientIdRef: string;      // Reference to secret containing client ID
  clientSecretRef: string;  // Reference to secret containing client secret
  scope?: string;           // Space-separated OAuth2 scopes
  audience?: string;        // OAuth2 audience (optional)
  grantType?: string;       // Defaults to 'client_credentials'
}

/**
 * OAuth2 provider configuration for 3-legged flow
 */
export interface OAuth2ThreeLegConfig extends BaseConnectionConfig {
  authUrl: string;          // Authorization endpoint
  tokenUrl: string;         // Token endpoint
  clientIdRef: string;      // Reference to secret containing client ID
  clientSecretRef: string;  // Reference to secret containing client secret
  scope: string;            // Space-separated OAuth2 scopes
  redirectUri: string;      // Must match system callback URL
}

/**
 * API Key connection configuration
 */
export interface ApiKeyConfig extends BaseConnectionConfig {
  apiKeyRef: string;        // Reference to secret containing API key
  apiKeyLocation: "header" | "query";
  apiKeyName: string;       // Header name or query param name (e.g., 'X-API-Key' or 'api_key')
}

/**
 * Bearer token connection configuration
 */
export interface BearerConfig extends BaseConnectionConfig {
  tokenRef: string;         // Reference to secret containing bearer token
}

/**
 * OAuth2 token state (encrypted, stored in oauth_state JSONB column)
 */
export interface OAuth2State {
  accessToken: string;      // Encrypted access token
  refreshToken?: string;    // Encrypted refresh token (for 3-legged flow)
  expiresAt: number;        // Unix timestamp (milliseconds)
  scope?: string;           // Granted scopes
  tokenType?: string;       // Usually 'Bearer'
}

/**
 * Connection record from database
 */
export interface Connection {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  type: ConnectionType;
  baseUrl?: string;

  // JSONB fields
  authConfig: Record<string, unknown>;
  secretRefs: Record<string, string>;
  oauthState?: OAuth2State;
  defaultHeaders?: Record<string, string>;

  // Configuration
  timeoutMs: number;
  retries: number;
  backoffMs: number;

  // Metadata
  enabled: boolean;
  lastTestedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Connection creation input
 */
export interface CreateConnectionInput {
  projectId: string;
  name: string;
  type: ConnectionType;
  baseUrl?: string;
  authConfig: Record<string, unknown>;
  secretRefs: Record<string, string>;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/**
 * Connection update input
 */
export interface UpdateConnectionInput {
  name?: string;
  baseUrl?: string;
  authConfig?: Record<string, unknown>;
  secretRefs?: Record<string, string>;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  enabled?: boolean;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  statusCode?: number;
  message: string;
  responseTime?: number;
  testedAt: Date;
}

/**
 * OAuth2 authorization flow initiation result
 */
export interface OAuth2AuthorizationUrl {
  authorizationUrl: string;
  state: string;              // CSRF protection token
}

/**
 * OAuth2 callback data
 */
export interface OAuth2CallbackData {
  code: string;
  state: string;
}

/**
 * Resolved connection with decrypted secrets
 * INTERNAL USE ONLY - never expose via API
 */
export interface ResolvedConnection {
  connection: Connection;
  secrets: Record<string, string>;  // Decrypted secret values
  accessToken?: string;             // Decrypted OAuth2 access token (if applicable)
}

/**
 * Connection status for UI display
 */
export interface ConnectionStatus {
  id: string;
  name: string;
  type: ConnectionType;
  enabled: boolean;
  lastTestedAt?: Date;
  lastUsedAt?: Date;
  oauthTokenExpiry?: Date;
  oauthTokenValid?: boolean;
}
