/**
 * Webhook Node Executor
 * Sends outbound HTTP requests for workflow events (fire-and-forget or blocking)
 */

import type { EvalContext } from '../expr';
import { evaluateExpression } from '../expr';
import { resolveConnection as resolveNewConnection } from '../../services/connections';
import { redactObject } from '../../utils/encryption';
import { logger } from '../../logger';

/**
 * Webhook Node Configuration
 */
export interface WebhookNodeConfig {
  // Connection settings
  connectionId?: string;              // Optional reference to Connection
  url?: string;                       // Required if no connectionId
  method: 'POST' | 'PUT' | 'PATCH';   // Webhook methods (no GET/DELETE)

  // Request configuration
  headers?: Record<string, string>;   // Headers (supports {{var}} templates)
  body?: any;                         // Request body (JSON, supports {{var}} templates)

  // Behavior
  mode?: 'fire-and-forget' | 'blocking'; // Default: blocking
  retryPolicy?: {
    attempts?: number;                // Number of retries (default 3)
    backoffMs?: number;               // Initial backoff delay (default 1000ms)
  };

  // Conditional execution
  condition?: string;                 // Optional condition expression
}

export interface WebhookNodeInput {
  nodeId: string;
  config: WebhookNodeConfig;
  context: EvalContext;
  projectId?: string;                 // For connection resolution
}

export interface WebhookNodeOutput {
  status: 'executed' | 'skipped' | 'error';
  statusCode?: number;
  responseBody?: string;              // Limited to 512 bytes
  skipReason?: string;
  error?: string;
  durationMs?: number;
}

/**
 * Interpolate template variables in a string
 */
function interpolateTemplate(template: string, context: EvalContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const value = context.vars[key.trim()];
    return value !== undefined ? String(value) : '';
  });
}

/**
 * Interpolate template variables in an object (recursively)
 */
function interpolateObject(obj: any, context: EvalContext): any {
  if (typeof obj === 'string') {
    return interpolateTemplate(obj, context);
  } else if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, context));
  } else if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, context);
    }
    return result;
  }
  return obj;
}

/**
 * Execute webhook request with retries
 */
async function executeWebhookWithRetries(params: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  attempts: number;
  backoffMs: number;
}): Promise<{ statusCode: number; responseBody: string }> {
  const { url, method, headers, body, attempts, backoffMs } = params;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      // Read response body (limit to 512 bytes)
      const responseText = await response.text();
      const limitedBody = responseText.substring(0, 512);

      return {
        statusCode: response.status,
        responseBody: limitedBody,
      };
    } catch (error) {
      lastError = error as Error;

      // If not the last attempt, wait before retrying
      if (attempt < attempts - 1) {
        const delay = backoffMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Webhook request failed');
}

/**
 * Execute a webhook node
 */
export async function executeWebhookNode(input: WebhookNodeInput): Promise<WebhookNodeOutput> {
  const { nodeId, config, context, projectId } = input;
  const startTime = Date.now();

  try {
    // IDEMPOTENCY GUARD
    if (context.executedSideEffects && context.executedSideEffects.has(nodeId)) {
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

    // Resolve URL and headers
    let url = config.url || '';
    let headers: Record<string, string> = { ...(config.headers || {}) };
    let body = config.body || {};

    // If connectionId is provided, resolve connection
    if (config.connectionId && projectId) {
      try {
        const resolved = await resolveNewConnection(projectId, config.connectionId);
        const connection = resolved.connection;

        // Use connection's baseUrl if no URL provided
        if (!url && connection.baseUrl) {
          url = connection.baseUrl;
        }

        // Merge connection's default headers
        headers = {
          ...connection.defaultHeaders,
          ...headers,
        };

        // Inject auth based on connection type
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
      } catch (error) {
        logger.error({
          nodeId,
          connectionId: config.connectionId,
          error: (error as Error).message,
        }, 'Failed to resolve connection for webhook');
        return {
          status: 'error',
          error: `Failed to resolve connection: ${(error as Error).message}`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Validate URL
    if (!url) {
      return {
        status: 'error',
        error: 'No URL provided (set url or connectionId)',
        durationMs: Date.now() - startTime,
      };
    }

    // Interpolate templates
    url = interpolateTemplate(url, context);
    headers = interpolateObject(headers, context);
    body = interpolateObject(body, context);

    // Redact sensitive headers in logs
    const safeHeaders = redactObject(headers);
    logger.info({
      nodeId,
      url: redactObject({ url }).url,
      method: config.method,
      headers: safeHeaders,
    }, 'Executing webhook');

    // Execute webhook
    const mode = config.mode || 'blocking';
    const attempts = config.retryPolicy?.attempts || 3;
    const backoffMs = config.retryPolicy?.backoffMs || 1000;

    if (mode === 'fire-and-forget') {
      // Fire and forget - don't wait for response
      executeWebhookWithRetries({
        url,
        method: config.method,
        headers,
        body,
        attempts,
        backoffMs,
      }).catch(error => {
        logger.error({
          nodeId,
          error: (error as Error).message,
        }, 'Webhook fire-and-forget failed');
      });

      // MARK EXECUTED (Fire-and-forget)
      if (context.executedSideEffects) {
        context.executedSideEffects.add(nodeId);
      }

      return {
        status: 'executed',
        durationMs: Date.now() - startTime,
      };
    } else {
      // Blocking mode - wait for response
      const result = await executeWebhookWithRetries({
        url,
        method: config.method,
        headers,
        body,
        attempts,
        backoffMs,
      });

      // MARK EXECUTED (Blocking)
      if (context.executedSideEffects) {
        context.executedSideEffects.add(nodeId);
      }

      return {
        status: 'executed',
        statusCode: result.statusCode,
        responseBody: result.responseBody,
        durationMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    logger.error({
      nodeId,
      error: (error as Error).message,
    }, 'Webhook node execution error');

    return {
      status: 'error',
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}
