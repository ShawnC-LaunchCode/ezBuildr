/**
 * AI-Assisted Random Data Generator
 *
 * Optional AI integration for generating more realistic random data.
 * Falls back to synthetic random data if AI is unavailable or fails.
 *
 * Features:
 * - Sends workflow structure to AI endpoint
 * - Requests realistic values for each block
 * - Merges AI output with synthetic defaults
 * - Sanitizes and validates all AI-generated values
 * - Safe fallback to deterministic random
 *
 * @version 1.0.0
 * @date December 2025
 */

import type { ApiStep } from '@/lib/vault-api';

import { createLogger } from '../logger';

import { generateRandomValueForBlock } from './randomFill';

const logger = createLogger({ module: 'AIRandomFill' });

// ============================================================================
// TYPES
// ============================================================================

interface AIRandomRequest {
  workflowId: string;
  workflowTitle?: string;
  blocks: Array<{
    alias: string;
    type: string;
    label: string;
    config?: any;
  }>;
}

interface AIRandomResponse {
  values: Record<string, any>; // alias -> value
  error?: string;
}

// ============================================================================
// AI INTEGRATION
// ============================================================================

/**
 * Check if AI random fill is available
 * Checks for AI_RANDOM_API_URL or AI_MODEL_NAME in environment
 */
export function isAIRandomAvailable(): boolean {
  // Check if AI endpoint is configured
  // This would typically be set via environment variables
  // For now, we'll return false as AI integration is optional
  return false;
}

/**
 * Request random values from AI endpoint
 *
 * @param steps - Array of steps to generate values for
 * @param workflowId - Workflow ID for context
 * @param workflowTitle - Optional workflow title for context
 * @returns Promise with AI-generated values (alias -> value)
 */
async function requestAIRandomValues(
  steps: ApiStep[],
  workflowId: string,
  workflowTitle?: string
): Promise<Record<string, any>> {
  try {
    // Build request payload
    const request: AIRandomRequest = {
      workflowId,
      workflowTitle,
      blocks: steps
        .filter(step => step.type !== 'display' && step.type !== 'js_question')
        .map(step => ({
          alias: step.alias || step.id,
          type: step.type,
          label: step.title || '',
          config: step.config,
        })),
    };

    // Make API request (endpoint would be configured via env)
    const response = await fetch('/api/ai/random-fill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`AI endpoint returned ${response.status}`);
    }

    const data: AIRandomResponse = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data.values || {};

  } catch (error) {
    logger.error('AI request failed:', error);
    return {};
  }
}

/**
 * Sanitize and validate AI-generated value
 * Ensures the value matches expected type and structure
 *
 * @param value - Raw value from AI
 * @param step - Step definition for validation
 * @returns Sanitized value or undefined if invalid
 */
function sanitizeAIValue(value: any, step: ApiStep): any {
  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    // Type-specific sanitization
    switch (step.type) {
      // Text types
      case 'short_text':
      case 'long_text':
      case 'text':
        return typeof value === 'string' ? value : String(value);

      // Boolean types
      case 'yes_no':
      case 'true_false':
      case 'boolean':
        if (typeof value === 'boolean') {return value;}
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
        }
        return Boolean(value);

      // Email
      case 'email':
        if (typeof value === 'string' && value.includes('@')) {
          return value;
        }
        return undefined;

      // Phone
      case 'phone':
        return typeof value === 'string' ? value : String(value);

      // Website
      case 'website':
        if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
          return value;
        }
        return undefined;

      // Date/Time
      case 'date':
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          return value.split('T')[0]; // Extract date part
        }
        return undefined;

      case 'time':
        if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) {
          return value;
        }
        return undefined;

      case 'date_time':
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
          return value;
        }
        return undefined;

      // Choice types
      case 'radio':
      case 'choice':
        // Single selection
        if (typeof value === 'string') {return value;}
        if (Array.isArray(value) && value.length > 0) {return value[0];}
        return undefined;

      case 'multiple_choice':
        // Multiple selection
        if (Array.isArray(value)) {
          return value.filter(v => typeof v === 'string');
        }
        if (typeof value === 'string') {return [value];}
        return undefined;

      // Numeric types
      case 'number':
      case 'currency':
      case 'scale':
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (!isNaN(num)) {return num;}
        return undefined;

      // Complex types
      case 'address':
        if (typeof value === 'object' && !Array.isArray(value)) {
          // Validate address structure
          if (value.street || value.city || value.state || value.zip) {
            return {
              street: value.street || '',
              city: value.city || '',
              state: value.state || '',
              zip: value.zip || '',
            };
          }
        }
        return undefined;

      case 'multi_field':
        if (typeof value === 'object' && !Array.isArray(value)) {
          return value;
        }
        return undefined;

      default:
        // Unknown type, return as-is if it's a primitive
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return value;
        }
        return undefined;
    }

  } catch (error) {
    logger.error('Error sanitizing value for step:', step.id, error);
    return undefined;
  }
}

/**
 * Merge AI values with synthetic defaults
 * AI values take priority, but fallback to synthetic if missing or invalid
 *
 * @param steps - Array of steps
 * @param aiValues - AI-generated values (alias -> value)
 * @returns Merged values (stepId -> value)
 */
function mergeWithSyntheticDefaults(
  steps: ApiStep[],
  aiValues: Record<string, any>
): Record<string, any> {
  const mergedValues: Record<string, any> = {};

  for (const step of steps) {
    const alias = step.alias || step.id;

    // Try to get AI value
    let value = aiValues[alias];

    // Sanitize AI value
    if (value !== undefined) {
      value = sanitizeAIValue(value, step);
    }

    // If AI value is invalid or missing, use synthetic
    if (value === undefined) {
      value = generateRandomValueForBlock(step);
    }

    // Store if valid
    if (value !== undefined) {
      mergedValues[step.id] = value;
    }
  }

  return mergedValues;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate random values using AI if available, with fallback to synthetic
 *
 * @param steps - Array of steps to generate values for
 * @param workflowId - Workflow ID for context
 * @param workflowTitle - Optional workflow title for context
 * @returns Promise with random values (stepId -> value)
 */
export async function generateAIRandomValues(
  steps: ApiStep[],
  workflowId: string,
  workflowTitle?: string
): Promise<Record<string, any>> {
  logger.info('Starting AI random value generation');

  // Check if AI is available
  if (!isAIRandomAvailable()) {
    logger.info('AI not available, using synthetic random');
    // Use synthetic random directly
    const syntheticValues: Record<string, any> = {};
    for (const step of steps) {
      const value = generateRandomValueForBlock(step);
      if (value !== undefined) {
        syntheticValues[step.id] = value;
      }
    }
    return syntheticValues;
  }

  try {
    // Request AI values
    logger.info('Requesting AI values for', steps.length, 'steps');
    const aiValues = await requestAIRandomValues(steps, workflowId, workflowTitle);

    logger.info('Received AI values:', Object.keys(aiValues).length, 'values');

    // Merge with synthetic defaults
    const mergedValues = mergeWithSyntheticDefaults(steps, aiValues);

    logger.info('Final merged values:', Object.keys(mergedValues).length, 'values');

    return mergedValues;

  } catch (error) {
    logger.error('Error generating AI values, falling back to synthetic:', error);

    // Fallback to pure synthetic
    const syntheticValues: Record<string, any> = {};
    for (const step of steps) {
      const value = generateRandomValueForBlock(step);
      if (value !== undefined) {
        syntheticValues[step.id] = value;
      }
    }
    return syntheticValues;
  }
}

/**
 * Generate random values for specific steps using AI if available
 *
 * @param steps - Array of steps to generate values for
 * @param workflowId - Workflow ID for context
 * @param workflowTitle - Optional workflow title for context
 * @returns Promise with random values (stepId -> value)
 */
export async function generateAIRandomValuesForSteps(
  steps: ApiStep[],
  workflowId: string,
  workflowTitle?: string
): Promise<Record<string, any>> {
  return generateAIRandomValues(steps, workflowId, workflowTitle);
}
