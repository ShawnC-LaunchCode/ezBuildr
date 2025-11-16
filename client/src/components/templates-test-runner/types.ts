/**
 * Template Test Runner - Shared Types
 * PR3: Type definitions
 */

export type TestStatus = 'idle' | 'validating' | 'rendering' | 'success' | 'error';

export interface TestError {
  code: string;
  message: string;
  placeholder?: string;
  path?: string;
}

export interface TestResult {
  ok: boolean;
  status: string;
  durationMs?: number;
  errors?: TestError[];
  docxUrl?: string;
  pdfUrl?: string;
}
