/**
 * Shared TypeScript types for the Custom Scripting System
 * Used across backend, frontend, and shared code
 *
 * NOTE: Several interfaces in this file intentionally use `unknown` (or generic
 * type parameters) rather than specific types. The scripting system is deliberately
 * dynamic — scripts can emit any value, HTTP responses can be any shape, and
 * console logs can contain any arguments. Where `unknown` is used, callers must
 * narrow the type before using the value.
 */

// ===================================================================
// SCRIPT EXECUTION TYPES
// ===================================================================

export type ScriptLanguage = "javascript" | "python";

export interface ScriptExecutionContext {
  workflowId: string;
  runId: string;
  phase: string;
  pageId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ScriptExecutionResult {
  ok: boolean;
  /** Script can emit any value — callers must narrow before use */
  output?: unknown;
  error?: string;
  /** Each console.log call is one entry; each entry is the list of args */
  consoleLogs?: unknown[][];
  durationMs?: number;
}

// ===================================================================
// LIFECYCLE HOOK TYPES
// ===================================================================

export type LifecycleHookPhase =
  | "beforePage"
  | "afterPage"
  | "beforeFinalBlock"
  | "afterDocumentsGenerated";

export interface LifecycleHook {
  id: string;
  workflowId: string;
  pageId?: string | null;
  name: string;
  phase: LifecycleHookPhase;
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  outputKeys: string[];
  virtualStepIds?: string[];
  enabled: boolean;
  order: number;
  timeoutMs: number;
  mutationMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLifecycleHookInput {
  workflowId: string;
  pageId?: string | null;
  name: string;
  phase: LifecycleHookPhase;
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  outputKeys: string[];
  enabled?: boolean;
  order?: number;
  timeoutMs?: number;
  mutationMode?: boolean;
}

export interface UpdateLifecycleHookInput {
  name?: string;
  phase?: LifecycleHookPhase;
  language?: ScriptLanguage;
  code?: string;
  inputKeys?: string[];
  outputKeys?: string[];
  enabled?: boolean;
  order?: number;
  timeoutMs?: number;
  mutationMode?: boolean;
}

export interface LifecycleHookExecutionResult {
  success: boolean;
  /** Keys are step aliases/IDs; values are whatever the hook emitted */
  data: Record<string, unknown>;
  errors?: Array<{
    hookId: string;
    hookName: string;
    error: string;
  }>;
  consoleOutput?: Array<{
    hookName: string;
    logs: unknown[][];
  }>;
}

// ===================================================================
// DOCUMENT HOOK TYPES
// ===================================================================

export type DocumentHookPhase = "beforeGeneration" | "afterGeneration";

export interface DocumentHook {
  id: string;
  workflowId: string;
  finalBlockDocumentId?: string | null;
  name: string;
  phase: DocumentHookPhase;
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  outputKeys: string[];
  enabled: boolean;
  order: number;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentHookInput {
  workflowId: string;
  finalBlockDocumentId?: string | null;
  name: string;
  phase: DocumentHookPhase;
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  outputKeys: string[];
  enabled?: boolean;
  order?: number;
  timeoutMs?: number;
}

export interface UpdateDocumentHookInput {
  name?: string;
  phase?: DocumentHookPhase;
  language?: ScriptLanguage;
  code?: string;
  inputKeys?: string[];
  outputKeys?: string[];
  enabled?: boolean;
  order?: number;
  timeoutMs?: number;
}

export interface DocumentHookExecutionResult {
  success: boolean;
  /** Keys are step aliases/IDs; values are whatever the hook emitted */
  data: Record<string, unknown>;
  errors?: Array<{
    hookId: string;
    hookName: string;
    error: string;
  }>;
  consoleOutput?: Array<{
    hookName: string;
    logs: unknown[][];
  }>;
}

// ===================================================================
// SCRIPT EXECUTION LOG TYPES
// ===================================================================

export type ScriptExecutionStatus = "success" | "error" | "timeout";

export type ScriptType = "transform_block" | "lifecycle_hook" | "document_hook";

export interface ScriptExecutionLog {
  id: string;
  runId: string;
  scriptType: ScriptType;
  scriptId: string;
  scriptName?: string | null;
  phase?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  status: ScriptExecutionStatus;
  errorMessage?: string | null;
  consoleOutput?: unknown[] | null;
  inputSample?: unknown;
  outputSample?: unknown;
  durationMs?: number | null;
  createdAt: Date;
}

export interface CreateScriptExecutionLogInput {
  runId: string;
  scriptType: ScriptType;
  scriptId: string;
  scriptName?: string;
  phase?: string;
  status: ScriptExecutionStatus;
  errorMessage?: string;
  consoleOutput?: unknown[];
  inputSample?: unknown;
  outputSample?: unknown;
  durationMs?: number;
}

// ===================================================================
// HELPER LIBRARY API TYPES
// ===================================================================

export interface DateHelpers {
  now: () => string;
  add: (date: string, value: number, unit: "days" | "hours" | "minutes" | "seconds") => string;
  subtract: (date: string, value: number, unit: "days" | "hours" | "minutes" | "seconds") => string;
  format: (date: string, formatString: string) => string;
  parse: (dateString: string) => string;
  diff: (date1: string, date2: string, unit: "days" | "hours" | "minutes" | "seconds") => number;
}

export interface StringHelpers {
  upper: (str: string) => string;
  lower: (str: string) => string;
  trim: (str: string) => string;
  replace: (str: string, search: string | RegExp, replacement: string) => string;
  split: (str: string, separator: string) => string[];
  join: (arr: string[], separator: string) => string;
  slug: (str: string) => string;
  capitalize: (str: string) => string;
  truncate: (str: string, length: number) => string;
}

export interface NumberHelpers {
  round: (num: number, decimals?: number) => number;
  ceil: (num: number) => number;
  floor: (num: number) => number;
  abs: (num: number) => number;
  clamp: (num: number, min: number, max: number) => number;
  formatCurrency: (num: number, currency?: string) => string;
  currency: (num: number, currency?: string) => string;
  percent: (num: number, decimals?: number) => string;
}

/** Array helpers are generic so callers retain element types */
export interface ArrayHelpers {
  unique: <T>(arr: T[]) => T[];
  flatten: <T>(arr: T[][]) => T[];
  chunk: <T>(arr: T[], size: number) => T[][];
  sortBy: <T>(arr: T[], key: string) => T[];
  filter: <T>(arr: T[], predicate: (item: T, index: number) => boolean) => T[];
  map: <T, U>(arr: T[], mapper: (item: T, index: number) => U) => U[];
}

export interface ObjectHelpers {
  keys: (obj: Record<string, unknown>) => string[];
  values: (obj: Record<string, unknown>) => unknown[];
  pick: (obj: Record<string, unknown>, keys: string[]) => Record<string, unknown>;
  omit: (obj: Record<string, unknown>, keys: string[]) => Record<string, unknown>;
  merge: (...objects: Record<string, unknown>[]) => Record<string, unknown>;
}

export interface MathHelpers {
  random: (min?: number, max?: number) => number;
  randomInt: (min: number, max: number) => number;
  sum: (arr: number[]) => number;
  avg: (arr: number[]) => number;
  min: (arr: number[]) => number;
  max: (arr: number[]) => number;
}

/** HTTP helpers use a generic return type so callers can opt-in to specific response shapes */
export interface HttpHelpers {
  get: <T = unknown>(url: string, options?: { headers?: Record<string, string> }) => Promise<T>;
  post: <T = unknown>(url: string, body: unknown, options?: { headers?: Record<string, string> }) => Promise<T>;
}

export interface ConsoleHelpers {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface HelperLibraryAPI {
  date: DateHelpers;
  string: StringHelpers;
  number: NumberHelpers;
  array: ArrayHelpers;
  object: ObjectHelpers;
  math: MathHelpers;
  http: HttpHelpers;
  console: ConsoleHelpers;
}

// ===================================================================
// SCRIPT CONTEXT API TYPES
// ===================================================================

export interface ScriptContextAPI {
  workflow: {
    id: string;
  };
  run: {
    id: string;
  };
  phase: string;
  page?: {
    id: string;
  };
  user?: {
    id: string;
  };
  env: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- NODE_ENV is a standard environment variable name
    NODE_ENV?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- BASE_URL is a standard environment variable name
    BASE_URL?: string;
  };
  metadata: Record<string, unknown>;
}

// ===================================================================
// SCRIPT ENGINE TYPES
// ===================================================================

export interface ExecuteScriptParams {
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  data: Record<string, unknown>;
  context: ScriptExecutionContext;
  helpers?: Record<string, unknown>;
  timeoutMs?: number;
  consoleEnabled?: boolean;
  aliasMap?: Record<string, string>; // Map of alias -> stepId
}

export interface ValidateScriptParams {
  language: ScriptLanguage;
  code: string;
}

export interface ValidateScriptResult {
  derivedInputs?: string[];
  derivedOutputs?: string[];
  valid: boolean;
  error?: string;
  warnings?: string[];
}

// ===================================================================
// TEST HOOK TYPES
// ===================================================================

export interface TestHookInput {
  testData: Record<string, unknown>;
  context?: Partial<ScriptExecutionContext>;
}

export interface TestHookResult {
  success: boolean;
  /** Script can emit any value — callers must narrow before use */
  output?: unknown;
  error?: string;
  consoleLogs?: unknown[][];
  durationMs?: number;
}

// ===================================================================
// FRONTEND CONSOLE LOG ENTRY TYPES
// ===================================================================

export interface ConsoleLogEntry {
  id: string;
  scriptName: string;
  scriptType: ScriptType;
  phase: string;
  status: ScriptExecutionStatus;
  consoleLogs?: unknown[][];
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
}
