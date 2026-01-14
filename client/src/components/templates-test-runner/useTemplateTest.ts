/**
 * useTemplateTest Hook
 * PR5: Template test state management and API integration
 */

import { useState, useCallback } from "react";

import { testTemplate, type TestTemplateRequest } from "@/lib/api-client";

import type { TestStatus, TestResult } from "./types";

export interface UseTemplateTestReturn {
  status: TestStatus;
  result: TestResult | undefined;
  runTest: (workflowId: string, templateId: string, request: TestTemplateRequest) => Promise<void>;
  reset: () => void;
}

export function useTemplateTest(): UseTemplateTestReturn {
  const [status, setStatus] = useState<TestStatus>('idle');
  const [result, setResult] = useState<TestResult | undefined>(undefined);

  const runTest = useCallback(async (
    workflowId: string,
    templateId: string,
    request: TestTemplateRequest
  ) => {
    try {
      // Phase 1: Validating
      setStatus('validating');
      setResult(undefined);

      // Brief delay to show validation status
      await new Promise(resolve => setTimeout(resolve, 300));

      // Phase 2: Rendering
      setStatus('rendering');

      // Call API
      const testResult = await testTemplate(workflowId, templateId, request);

      // Phase 3: Set final status
      if (testResult.ok) {
        setStatus('success');
      } else {
        setStatus('error');
      }

      setResult(testResult);
    } catch (error) {
      console.error('Template test error:', error);

      setStatus('error');
      setResult({
        ok: false,
        status: 'error',
        durationMs: 0,
        errors: [
          {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          },
        ],
      });
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(undefined);
  }, []);

  return {
    status,
    result,
    runTest,
    reset,
  };
}
