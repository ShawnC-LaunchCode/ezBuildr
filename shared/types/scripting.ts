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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata can contain any type of value
  metadata?: Record<string, any>;
}

export interface ScriptExecutionResult {
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script output can be any type
  output?: any;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console logs can contain any values
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook data can contain any type of value
  data: Record<string, any>;
  errors?: Array<{
    hookId: string;
    hookName: string;
    error: string;
  }>;
  consoleOutput?: Array<{
    hookName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console logs can contain any values
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hook data can contain any type of value
  data: Record<string, any>;
  errors?: Array<{
    hookId: string;
    hookName: string;
    error: string;
  }>;
  consoleOutput?: Array<{
    hookName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console logs can contain any values
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console output can contain any values
  consoleOutput?: any[] | null; // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- input sample can be any type
  inputSample?: any | null; // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- output sample can be any type
  outputSample?: any | null; // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console output can contain any values
  consoleOutput?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- input sample can be any type
  inputSample?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- output sample can be any type
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- array helpers work with arrays of any type
  unique: (arr: any[]) => any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- array helpers work with arrays of any type
  flatten: (arr: any[]) => any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- array helpers work with arrays of any type
  chunk: (arr: any[], size: number) => any[][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- array helpers work with arrays of any type
  sortBy: (arr: any[], key: string) => any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- array helpers work with arrays of any type
  filter: (arr: any[], predicate: (item: any, index: number) => boolean) => any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- array helpers work with arrays of any type
  map: (arr: any[], mapper: (item: any, index: number) => any) => any[];
}

export interface ObjectHelpers {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object helpers work with objects of any type
  keys: (obj: Record<string, any>) => string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object helpers work with objects of any type
  values: (obj: Record<string, any>) => any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object helpers work with objects of any type
  pick: (obj: Record<string, any>, keys: string[]) => Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object helpers work with objects of any type
  omit: (obj: Record<string, any>, keys: string[]) => Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- object helpers work with objects of any type
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP responses can be any type
  get: (url: string, options?: { headers?: Record<string, string> }) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP responses and request bodies can be any type
  post: (url: string, body: any, options?: { headers?: Record<string, string> }) => Promise<any>;
}

export interface ConsoleHelpers {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console methods accept any arguments
  log: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console methods accept any arguments
  warn: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console methods accept any arguments
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
    // eslint-disable-next-line @typescript-eslint/naming-convention -- NODE_ENV is a standard environment variable name
    NODE_ENV?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- BASE_URL is a standard environment variable name
    BASE_URL?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata can contain any type of value
  metadata: Record<string, any>;
}

// ===================================================================
// SCRIPT ENGINE TYPES
// ===================================================================

export interface ExecuteScriptParams {
  language: ScriptLanguage;
  code: string;
  inputKeys: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script data can contain any type of value
  data: Record<string, any>;
  context: ScriptExecutionContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- helpers can be any type
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test data can contain any type
  testData: Record<string, any>;
  context?: Partial<ScriptExecutionContext>;
}

export interface TestHookResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script output can be any type
  output?: any;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console logs can contain any values
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- console logs can contain any values
  consoleLogs?: any[][];
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
}
