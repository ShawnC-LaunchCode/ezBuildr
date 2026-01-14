/**
 * Shared TypeScript types for the Custom Scripting System
 * Used across backend, frontend, and shared code
 */

// ===================================================================
// SCRIPT EXECUTION TYPES
// ===================================================================

export type ScriptLanguage = "javascript" | "python";

export interface ScriptExecutionContext {
  workflowId: string;
  runId: string;
  phase: string;
  sectionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ScriptExecutionResult {
  ok: boolean;
  output?: any;
  error?: string;
  consoleLogs?: any[][];
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
  sectionId?: string | null;
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
  sectionId?: string | null;
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
  data: Record<string, any>;
  errors?: Array<{
    hookId: string;
    hookName: string;
    error: string;
  }>;
  consoleOutput?: Array<{
    hookName: string;
    logs: any[][];
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
  data: Record<string, any>;
  errors?: Array<{
    hookId: string;
    hookName: string;
    error: string;
  }>;
  consoleOutput?: Array<{
    hookName: string;
    logs: any[][];
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
  consoleOutput?: any[] | null;
  inputSample?: any | null;
  outputSample?: any | null;
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
  consoleOutput?: any[];
  inputSample?: any;
  outputSample?: any;
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

export interface ArrayHelpers {
  unique: (arr: any[]) => any[];
  flatten: (arr: any[]) => any[];
  chunk: (arr: any[], size: number) => any[][];
  sortBy: (arr: any[], key: string) => any[];
  filter: (arr: any[], predicate: (item: any, index: number) => boolean) => any[];
  map: (arr: any[], mapper: (item: any, index: number) => any) => any[];
}

export interface ObjectHelpers {
  keys: (obj: Record<string, any>) => string[];
  values: (obj: Record<string, any>) => any[];
  pick: (obj: Record<string, any>, keys: string[]) => Record<string, any>;
  omit: (obj: Record<string, any>, keys: string[]) => Record<string, any>;
  merge: (...objects: Record<string, any>[]) => Record<string, any>;
}

export interface MathHelpers {
  random: (min?: number, max?: number) => number;
  randomInt: (min: number, max: number) => number;
  sum: (arr: number[]) => number;
  avg: (arr: number[]) => number;
  min: (arr: number[]) => number;
  max: (arr: number[]) => number;
}

export interface HttpHelpers {
  get: (url: string, options?: { headers?: Record<string, string> }) => Promise<any>;
  post: (url: string, body: any, options?: { headers?: Record<string, string> }) => Promise<any>;
}

export interface ConsoleHelpers {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
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
  section?: {
    id: string;
  };
  user?: {
    id: string;
  };
  env: {
    NODE_ENV?: string;
    BASE_URL?: string;
  };
  metadata: Record<string, any>;
}

// ===================================================================
// SCRIPT ENGINE TYPES
// ===================================================================

export interface ExecuteScriptParams {
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  data: Record<string, any>;
  context: ScriptExecutionContext;
  helpers?: Record<string, any>;
  timeoutMs?: number;
  consoleEnabled?: boolean;
  aliasMap?: Record<string, string>; // Map of alias -> stepId
}

export interface ValidateScriptParams {
  language: ScriptLanguage;
  code: string;
}

export interface ValidateScriptResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

// ===================================================================
// TEST HOOK TYPES
// ===================================================================

export interface TestHookInput {
  testData: Record<string, any>;
  context?: Partial<ScriptExecutionContext>;
}

export interface TestHookResult {
  success: boolean;
  output?: any;
  error?: string;
  consoleLogs?: any[][];
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
  consoleLogs?: any[][];
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
}
