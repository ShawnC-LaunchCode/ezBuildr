/**
 * API Client
 * Centralized API request handling
 * PR5: Added template test endpoint
 */

import type { TestResult } from "@/components/templates-test-runner/types";

const API_BASE = import.meta.env.VITE_BASE_URL || '';

/**
 * Template Test API
 */
export interface TestTemplateRequest {
  outputType: 'docx' | 'pdf' | 'both';
  sampleData: Record<string, any>;
}

export async function testTemplate(
  workflowId: string,
  templateId: string,
  request: TestTemplateRequest
): Promise<TestResult> {
  const response = await fetch(
    `${API_BASE}/api/workflows/${workflowId}/templates/${templateId}/test`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for authentication
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}: Failed to test template`);
  }

  return response.json();
}
