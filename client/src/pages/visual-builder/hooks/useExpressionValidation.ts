/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
/**
 * Hook for validating expressions with debouncing
 */

import { useMutation } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface ValidationError {
  message: string;
  start?: { line: number; col: number };
  end?: { line: number; col: number };
}

export interface ValidationResponse {
  ok: boolean;
  errors?: ValidationError[];
}

export interface ValidationRequest {
  workflowId: string;
  nodeId: string;
  expression: string;
}

/**
 * Validate expression mutation
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function useValidateExpressionMutation() {
  return useMutation({
    mutationFn: (request: ValidationRequest) =>
      fetchAPI<ValidationResponse>('/api/workflows/validateExpression', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
  });
}

/**
 * Hook for validating expressions with debouncing
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useExpressionValidation(
  workflowId: string | undefined,
  nodeId: string | undefined,
  debounceMs: number = 300
) {
  const [expression, setExpression] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateMutation = useValidateExpressionMutation();

  // Debounced validation effect
  useEffect(() => {
    if (!workflowId || !nodeId || !expression) {
      setValidationResult(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const timeoutId = setTimeout(async () => {
      try {
        const result = await validateMutation.mutateAsync({
          workflowId,
          nodeId,
          expression,
        });
        setValidationResult(result);
      } catch (error) {
        setValidationResult({
          ok: false,
          errors: [{
            message: error instanceof Error ? error.message : 'Validation failed',
          }],
        });
      } finally {
        setIsValidating(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [expression, workflowId, nodeId, debounceMs]);

  const validate = useCallback((expr: string) => {
    setExpression(expr);
  }, []);

  return {
    validate,
    validationResult,
    isValidating,
    errors: validationResult?.errors ?? [],
    isValid: validationResult?.ok ?? true,
  };
}
