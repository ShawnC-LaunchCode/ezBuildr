/**
 * HTTP Node Executor
 * Handles HTTP/API requests with authentication, retries, and response mapping
 */
import crypto from 'crypto';
import { logger } from '../../logger';
import { httpCache } from '../../services/cache';
import { resolveConnection as resolveNewConnection, markConnectionUsed } from '../../services/connections';
import { resolveConnection as resolveOldConnection } from '../../services/externalConnections';
import { getOAuth2Token } from '../../services/oauth2';
import { getSecretValue } from '../../services/secrets';
import { select } from '../../utils/jsonselect';
import { evaluateExpression } from '../expr';
import type { EvalContext } from '../expr';
/**
 * HTTP Node Configuration
 */
export interface HttpNodeConfig {
  // Connection settings
  connectionId?: string;              // Optional reference to ExternalConnection
  baseUrl?: string;                   // Required if no connectionId
  path: string;                       // URL path (supports {{var}} templates)
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  // Request configuration
  query?: Record<string, any>;        // Query parameters (supports {{var}} templates)
  headers?: Record<string, string>;   // Headers (supports {{var}} templates)
  body?: any;                         // Request body (JSON only for MVP)
  // Authentication
  auth?: {
    type: 'api_key' | 'bearer' | 'oauth2' | 'basic_auth' | 'none';
    location?: 'header' | 'query';   // For api_key
    keyName?: string;                 // Header/query param name for api_key
    secretRef?: string;               // Secret key for api_key/basic_auth
    tokenRef?: string;                // Secret key for bearer
    oauth2?: {
      tokenUrl: string;
      clientIdRef: string;            // Secret key for OAuth2 client ID
      clientSecretRef: string;        // Secret key for OAuth2 client secret
      scope?: string;
    };
  };
  // Retry and timeout configuration
  timeoutMs?: number;                 // Request timeout (default 8000ms)
  retries?: number;                   // Number of retries (default 2)
  backoffMs?: number;                 // Initial backoff delay (default 250ms)
  // Caching
  cacheTtlMs?: number;                // Optional cache TTL in milliseconds
  // Response mapping
  map: Array<{
    as: string;                       // Output variable name
    select: string;                   // JSONPath selector (e.g., $.data.user.id)
  }>;
  // Conditional execution
  condition?: string;                 // Optional condition expression
}
export interface HttpNodeInput {
  nodeId: string;
  config: HttpNodeConfig;
  context: EvalContext;
  projectId: string;                  // For secret/connection resolution
}
export interface HttpNodeOutput {
  status: 'executed' | 'skipped' | 'error';
  variables?: Record<string, any>;    // Mapped variables
  response?: {
    status: number;
    headers: Record<string, string>;
    data: any;
    cached: boolean;
  };
  skipReason?: string;
  error?: string;
  durationMs?: number;
}
/**
 * Execute an HTTP node
 */
export async function executeHttpNode(input: HttpNodeInput): Promise<HttpNodeOutput> {
  const { nodeId, config, context, projectId } = input;
  const startTime = Date.now();
  try {
    // IDEMPOTENCY GUARD
    if (context.executedSideEffects?.has(nodeId)) {
      return {
        status: 'skipped',
        skipReason: 'already executed (idempotency guard)',
        durationMs: 0
      };
    }
    // Check condition if present
    if (config.condition) {
      const conditionResult = evaluateExpression(config.condition, context);
      if (!conditionResult) {
        return {
          status: 'skipped',
          skipReason: 'condition evaluated to false',
        };
      }
    }
    // Resolve connection or use direct config
    const requestConfig = await resolveRequestConfig(config, projectId);
    // Build the full URL
    const url = buildUrl(requestConfig.baseUrl, config.path, config.query, context);
    // Resolve headers
    const headers = await resolveHeaders(requestConfig, config, context, projectId);
    // Resolve body
    const body = config.body ? interpolateTemplate(JSON.stringify(config.body), context) : undefined;
    // Check cache if enabled
    if (config.cacheTtlMs && config.method === 'GET') {
      const cacheKey = generateCacheKey(projectId, config.method, url, body);
      const cached = httpCache.get(cacheKey);
      if (cached) {
        // Map response to variables
        const variables = mapResponse(cached.data, config.map);
        for (const [key, value] of Object.entries(variables)) {
          context.vars[key] = value;
        }
        return {
          status: 'executed',
          variables,
          response: {
            status: cached.status,
            headers: cached.headers,
            data: cached.data,
            cached: true,
          },
          durationMs: Date.now() - startTime,
        };
      }
    }
    // Mock requests in preview mode
    if (context.executionMode === 'preview') {
      // Mock response
      const mockResponse = {
        status: 200,
        headers: {},
        data: { message: 'Mocked response in preview mode' },
        cached: false,
      };
      // Map mock response to variables
      const variables = mapResponse(mockResponse.data, config.map);
      for (const [key, value] of Object.entries(variables)) {
        context.vars[key] = value;
      }
      logger.info({
        url,
        method: config.method,
        body,
        headers,
      }, 'External send skipped in preview mode');
      return {
        status: 'executed',
        variables,
        response: mockResponse,
        skipReason: 'Preview mode - external send mocked',
        durationMs: 0,
      };
    }
    // Execute HTTP request with retries
    const response = await executeWithRetries({
      url,
      method: config.method,
      headers,
      body: body ? JSON.parse(body) : undefined,
      timeoutMs: config.timeoutMs ?? 8000,
      retries: config.retries ?? 2,
      backoffMs: config.backoffMs ?? 250,
    });
    // Cache response if enabled
    if (config.cacheTtlMs && config.method === 'GET') {
      const cacheKey = generateCacheKey(projectId, config.method, url, body);
      httpCache.set(cacheKey, response, config.cacheTtlMs);
    }
    // Map response to variables
    const variables = mapResponse(response.data, config.map);
    for (const [key, value] of Object.entries(variables)) {
      context.vars[key] = value;
    }
    // MARK EXECUTED
    if (context.executedSideEffects) {
      context.executedSideEffects.add(nodeId);
    }
    return {
      status: 'executed',
      variables,
      response: {
        status: response.status,
        headers: response.headers,
        data: response.data,
        cached: false,
      },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}
/**
 * Resolve request configuration from connection or direct config
 * Tries new connections service first (Stage 16), then falls back to old externalConnections (Stage 9)
 */
async function resolveRequestConfig(
  config: HttpNodeConfig,
  projectId: string
): Promise<{
  baseUrl: string;
  auth?: HttpNodeConfig['auth'];
  defaultHeaders: Record<string, string>;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
  accessToken?: string; // For OAuth2 3-legged flow
  connectionId?: string; // For marking as used
}> {
  if (config.connectionId) {
    // Try new connections service first (Stage 16)
    try {
      const resolved = await resolveNewConnection(projectId, config.connectionId);
      const connection = resolved.connection;
      // Mark connection as used
      markConnectionUsed(config.connectionId).catch(err => {
        logger.error({ err, connectionId: config.connectionId }, 'Failed to mark connection as used');
      });
      // Build auth config based on connection type
      let auth: HttpNodeConfig['auth'] | undefined;
      if (connection.type === 'api_key') {
        auth = {
          type: 'api_key',
          location: connection.authConfig.apiKeyLocation || 'header',
          keyName: connection.authConfig.apiKeyName || 'X-API-Key',
          secretRef: resolved.secrets[connection.authConfig.apiKeyRef || 'apiKey'],
        };
      } else if (connection.type === 'bearer') {
        auth = {
          type: 'bearer',
          tokenRef: resolved.secrets[connection.authConfig.tokenRef || 'token'],
        };
      } else if (connection.type === 'oauth2_client_credentials') {
        auth = {
          type: 'oauth2',
          oauth2: {
            tokenUrl: connection.authConfig.tokenUrl,
            clientIdRef: resolved.secrets[connection.authConfig.clientIdRef],
            clientSecretRef: resolved.secrets[connection.authConfig.clientSecretRef],
            scope: connection.authConfig.scope,
          },
        };
      } else if (connection.type === 'oauth2_3leg') {
        // For 3-legged OAuth, use the access token directly
        auth = {
          type: 'bearer',
          tokenRef: resolved.accessToken || '',
        };
      }
      return {
        baseUrl: connection.baseUrl || '',
        auth,
        defaultHeaders: connection.defaultHeaders || {},
        timeoutMs: connection.timeoutMs,
        retries: connection.retries,
        backoffMs: connection.backoffMs,
        accessToken: resolved.accessToken,
        connectionId: config.connectionId,
      };
    } catch (error) {
      logger.info({
        connectionId: config.connectionId,
        error: (error as Error).message,
      }, 'New connection not found, trying old externalConnection');
      // Fall back to old externalConnections service
      const connection = await resolveOldConnection(projectId, config.connectionId);
      if (!connection) {
        throw new Error(`Connection not found: ${config.connectionId}`);
      }
      return {
        baseUrl: connection.baseUrl,
        auth: {
          type: connection.authType as any,
          secretRef: connection.secretValue,
        },
        defaultHeaders: connection.defaultHeaders,
        timeoutMs: connection.timeoutMs,
        retries: connection.retries,
        backoffMs: connection.backoffMs,
      };
    }
  }
  if (!config.baseUrl) {
    throw new Error('baseUrl is required when connectionId is not provided');
  }
  return {
    baseUrl: config.baseUrl,
    auth: config.auth,
    defaultHeaders: {},
    timeoutMs: config.timeoutMs ?? 8000,
    retries: config.retries ?? 2,
    backoffMs: config.backoffMs ?? 250,
  };
}
/**
 * Resolve and build headers with authentication
 */
async function resolveHeaders(
  requestConfig: Awaited<ReturnType<typeof resolveRequestConfig>>,
  config: HttpNodeConfig,
  context: EvalContext,
  projectId: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...requestConfig.defaultHeaders,
    ...config.headers,
  };
  // Interpolate template variables in headers
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = interpolateTemplate(value, context);
  }
  // Apply authentication
  const auth = config.auth || requestConfig.auth;
  if (auth && auth.type !== 'none') {
    switch (auth.type) {
      case 'api_key':
        if (auth.location === 'header' && auth.keyName && auth.secretRef) {
          const secret = await getSecretValue(projectId, auth.secretRef);
          if (secret) {
            headers[auth.keyName] = secret;
          }
        }
        break;
      case 'bearer':
        if (auth.tokenRef) {
          const token = await getSecretValue(projectId, auth.tokenRef);
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }
        break;
      case 'oauth2':
        if (auth.oauth2) {
          const clientId = await getSecretValue(projectId, auth.oauth2.clientIdRef);
          const clientSecret = await getSecretValue(projectId, auth.oauth2.clientSecretRef);
          if (clientId && clientSecret) {
            const tokenResponse = await getOAuth2Token({
              tokenUrl: auth.oauth2.tokenUrl,
              clientId,
              clientSecret,
              scope: auth.oauth2.scope,
              projectId,
            });
            headers['Authorization'] = `${tokenResponse.token_type} ${tokenResponse.access_token}`;
          }
        }
        break;
      case 'basic_auth':
        if (auth.secretRef) {
          const credentials = await getSecretValue(projectId, auth.secretRef);
          if (credentials) {
            // Expect format: "username:password"
            const encoded = Buffer.from(credentials).toString('base64');
            headers['Authorization'] = `Basic ${encoded}`;
          }
        }
        break;
    }
  }
  return headers;
}
/**
 * Build full URL with query parameters
 */
function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, any> | undefined,
  context: EvalContext
): string {
  // Interpolate templates in path
  const interpolatedPath = interpolateTemplate(path, context);
  // Build base URL
  let url = baseUrl;
  if (!url.endsWith('/') && !interpolatedPath.startsWith('/')) {
    url += '/';
  }
  url += interpolatedPath;
  // Add query parameters
  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      const interpolatedValue = interpolateTemplate(String(value), context);
      params.append(key, interpolatedValue);
    }
    url += `?${  params.toString()}`;
  }
  return url;
}
/**
 * Interpolate {{var}} templates in a string
 */
function interpolateTemplate(template: string, context: EvalContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = context.vars[varName];
    return value !== undefined ? String(value) : match;
  });
}
/**
 * Execute HTTP request with retries and exponential backoff
 */
async function executeWithRetries(config: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}): Promise<{ status: number; headers: Record<string, string>; data: any }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // Parse response
      const text = await response.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      // Check for HTTP errors
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return { status: response.status, headers, data };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      // Don't retry on certain errors
      if (lastError.message.includes('HTTP 4')) {
        // Client errors (4xx) shouldn't be retried
        throw lastError;
      }
      // Exponential backoff
      if (attempt < config.retries) {
        const delay = config.backoffMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error('Request failed after retries');
}
/**
 * Map response data to variables using JSONPath selectors
 */
function mapResponse(data: any, mappings: Array<{ as: string; select: string }>): Record<string, any> {
  const variables: Record<string, any> = {};
  for (const mapping of mappings) {
    try {
      const value = select(data, mapping.select);
      variables[mapping.as] = value;
    } catch (error) {
      logger.warn({ error, select: mapping.select, as: mapping.as }, `Failed to map ${mapping.select} to ${mapping.as}`);
      variables[mapping.as] = undefined;
    }
  }
  return variables;
}
/**
 * Generate a cache key for HTTP responses
 */
function generateCacheKey(projectId: string, method: string, url: string, body?: string): string {
  const bodyHash = body ? crypto.createHash('sha256').update(body).digest('hex') : 'nobody';
  return `${projectId}:${method}:${url}:${bodyHash}`;
}