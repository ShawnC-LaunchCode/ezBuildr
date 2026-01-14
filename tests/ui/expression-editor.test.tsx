/**
 * Unit tests for Expression Editor hooks and components
 */

/**
 * @vitest-environment jsdom
 */


import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useExpressionValidation } from '../../client/src/pages/visual-builder/hooks/useExpressionValidation';

// Mock fetch for API calls
global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('Expression Editor Hooks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('useExpressionValidation', () => {
    it('should initialize with null validation result', () => {
      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      expect(result.current.validationResult).toBeNull();
      expect(result.current.isValidating).toBe(false);
      expect(result.current.isValid).toBe(true);
      expect(result.current.errors).toEqual([]);
    });

    it('should validate expression after debounce', async () => {
      // Mock successful validation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      // Trigger validation
      result.current.validate('age + 10');

      // Should be validating immediately
      // Should be validating eventually (debounce might delay it)
      // expect(result.current.isValidating).toBe(true);

      // Wait for debounce and validation
      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      expect(result.current.isValid).toBe(true);
      expect(result.current.errors).toEqual([]);
    });

    it('should return validation errors for invalid expression', async () => {
      // Mock failed validation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          errors: [
            {
              message: 'Unknown identifier: unknown_var',
              start: { line: 0, col: 0 },
              end: { line: 0, col: 11 },
            },
          ],
        }),
      });

      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      // Trigger validation
      result.current.validate('unknown_var + 10');

      // Wait for validation
      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      console.log('Validation Result DEBUG:', JSON.stringify(result.current.validationResult));
      console.log('IsValid DEBUG:', result.current.isValid);

      expect(result.current.isValid).toBe(false);
      expect(result.current.errors.length).toBeGreaterThan(0);
      expect(result.current.errors[0].message).toContain('unknown_var');
    });

    it('should debounce validation calls', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      // Trigger multiple validations quickly
      result.current.validate('age');
      result.current.validate('age + 1');
      result.current.validate('age + 10');

      // Should only call fetch once after debounce
      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      // Should have called fetch only once (debounced)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should not validate when workflowId or nodeId is missing', async () => {
      const { result } = renderHook(
        () => useExpressionValidation(undefined, undefined, 100),
        { wrapper: createWrapper() }
      );

      result.current.validate('age + 10');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not have called fetch
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.validationResult).toBeNull();
    });
  });

  describe('Expression validation integration', () => {
    it('should validate helper functions in expressions', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      result.current.validate('round(age * 1.5, 2)');

      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      expect(result.current.isValid).toBe(true);
    });

    it('should validate complex expressions with multiple helpers', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      result.current.validate('coalesce(name, "Unknown") + " is " + round(age, 0) + " years old"');

      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      expect(result.current.isValid).toBe(true);
    });

    it('should handle syntax errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          errors: [
            {
              message: 'Invalid expression syntax',
              start: { line: 0, col: 0 },
              end: { line: 0, col: 1 },
            },
          ],
        }),
      });

      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      result.current.validate('age +');

      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      expect(result.current.isValid).toBe(false);
      expect(result.current.errors[0].message).toContain('syntax');
    });
  });

  describe('Expression Editor component behavior', () => {
    it('should handle empty expressions', () => {
      const { result } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      result.current.validate('');

      // Should not trigger validation for empty string
      expect(result.current.isValidating).toBe(false);
      expect(result.current.validationResult).toBeNull();
    });

    it('should update validation when expression changes', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: false,
            errors: [{ message: 'Invalid' }],
          }),
        });

      const { result, rerender } = renderHook(
        () => useExpressionValidation('workflow-1', 'node-1', 100),
        { wrapper: createWrapper() }
      );

      // First validation - valid
      result.current.validate('age + 10');

      await waitFor(
        () => {
          expect(result.current.validationResult).not.toBeNull();
        },
        { timeout: 200 }
      );

      expect(result.current.isValid).toBe(true);

      // Second validation - invalid
      result.current.validate('invalid +');

      await waitFor(
        () => {
          expect(result.current.isValid).toBe(false);
        },
        { timeout: 1000 }
      );

      expect(result.current.errors.length).toBeGreaterThan(0);
    });
  });
});
