import { Parser } from 'expr-eval';

/**
 * Expression Evaluator
 * Safe, deterministic expression evaluation with whitelisted helpers
 *
 * Uses expr-eval library for parsing/evaluating expressions.
 * Does NOT use eval(), Function(), or dynamic code generation.
 */

import type { VariableLineage, ListLineage } from '@shared/types/debug';

export type EvalContext = {
  vars: Record<string, unknown>;   // user answers + computed vars only
  workflowId?: string;             // Current workflow ID
  helpers?: Record<string, (...args: any[]) => any>;
  clock?: () => Date;              // injected clock for determinism (default fixed or from options)
  executionMode?: 'live' | 'preview' | 'snapshot'; // Execution mode
  writes?: Record<string, any>;    // Isolated writes for preview mode
  variableLineage?: Record<string, VariableLineage>; // Variable derivation history
  listLineage?: Record<string, ListLineage>; // List variable sources

  // Performance and Caching
  cache?: {
    queries: Map<string, any>;     // Cache for query results
    scripts: Map<string, any>;     // Cache for compiled scripts
  };
  metrics?: {
    dbTimeMs: number;
    jsTimeMs: number;
    queryCount: number;
  };
  resources?: {
    isolate?: any; // isolated-vm instance
  };

  // Guardrails
  executedSideEffects?: Set<string>; // Block IDs that have already executed a write/send
  limits?: {
    maxExecutionTimeMs?: number;
    maxSteps?: number;
    maxQueryCount?: number;
  };
};

export type ValidateResult = { ok: true } | { ok: false; error: string };

// Forbidden identifiers that could allow prototype access
const FORBIDDEN_IDENTIFIERS = [
  '__proto__',
  'constructor',
  'prototype',
  'eval',
  'Function',
  'this',
];

// Whitelisted helper functions
// Note: expr-eval has built-in functions we leverage:
// - roundTo(n, decimals) - use instead of round(n, decimals)
// - abs, ceil, floor, round (unary), sqrt, etc.
// - min, max, pow (multi-arg)
export const Helpers = {
  // Math helpers
  // Use expr-eval's built-in roundTo instead of custom round
  roundTo: (n: number, digits: number = 0): number => {
    const factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
  },
  // Note: abs, ceil, floor are built-in unary ops in expr-eval
  // We include them here for consistency, but they work as-is
  abs: (n: number): number => Math.abs(n),
  ceil: (n: number): number => Math.ceil(n),
  floor: (n: number): number => Math.floor(n),
  // Note: min, max are built-in functions in expr-eval
  min: (...args: number[]): number => Math.min(...args),
  max: (...args: number[]): number => Math.max(...args),

  // String helpers
  len: (s: string): number => String(s).length,
  upper: (s: string): string => String(s).toUpperCase(),
  lower: (s: string): string => String(s).toLowerCase(),
  contains: (s: string, sub: string): boolean => String(s).includes(String(sub)),
  trim: (s: string): string => String(s).trim(),
  concat: (...parts: any[]): string => parts.map(p => String(p)).join(''),

  // Array helpers
  includes: (arr: any[], v: any): boolean => {
    if (!Array.isArray(arr)) {return false;}
    return arr.includes(v);
  },
  count: (arr: any[]): number => {
    if (!Array.isArray(arr)) {return 0;}
    return arr.length;
  },

  // Date helpers (deterministic via injected clock)
  dateDiff: (unit: string, fromISO: string, toISO?: string, clock?: () => Date): number => {
    const from = new Date(fromISO);
    const to = toISO ? new Date(toISO) : (clock ? clock() : new Date(0));

    const diffMs = to.getTime() - from.getTime();

    switch (unit) {
      case 'days':
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      case 'hours':
        return Math.floor(diffMs / (1000 * 60 * 60));
      case 'minutes':
        return Math.floor(diffMs / (1000 * 60));
      case 'seconds':
        return Math.floor(diffMs / 1000);
      default:
        throw new Error(`Invalid date unit: ${unit}`);
    }
  },

  // Logic helpers
  coalesce: (...vals: any[]): any => {
    for (const val of vals) {
      if (val !== null && val !== undefined) {
        return val;
      }
    }
    return null;
  },
  isEmpty: (v: any): boolean => {
    if (v === null || v === undefined) {return true;}
    if (typeof v === 'string') {return v.trim().length === 0;}
    if (Array.isArray(v)) {return v.length === 0;}
    if (typeof v === 'object') {return Object.keys(v).length === 0;}
    return false;
  },
  not: (v: any): boolean => !v,

  // PDF Helpers
  checkbox: (v: any): string => v ? 'X' : '',
};

// List of all allowed helper names for validation
export const AllowedHelperNames = Object.keys(Helpers);

/**
 * Validate an expression for safety and correctness
 *
 * @param expr - Expression string to validate
 * @param allowedVars - List of allowed variable names
 * @returns Validation result
 */
export function validateExpression(expr: string, allowedVars: string[]): ValidateResult {
  try {
    // Check for forbidden identifiers in the expression string first
    const exprStr = expr.toLowerCase();
    for (const forbidden of FORBIDDEN_IDENTIFIERS) {
      // Use word boundary regex to check for forbidden identifiers
      const pattern = new RegExp(`\\b${forbidden.toLowerCase()}\\b`);
      if (pattern.test(exprStr)) {
        return {
          ok: false,
          error: `Forbidden identifier: ${forbidden}`,
        };
      }
    }

    // Parse the expression
    const parser = new Parser();

    // Register helper functions for validation
    // Note: All helpers registered as functions (not unaryOps) to support multi-arg
    for (const helperName of AllowedHelperNames) {
      // Use a variadic dummy function to support both single and multi-arg helpers
      parser.functions[helperName] = ((...args: any[]) => null) as any;
    }

    const parsed = parser.parse(expr);

    // Get all variables used in the expression
    const usedVars = parsed.variables();

    // Create set of allowed identifiers (vars only, since functions are registered separately)
    const allowedIdentifiers = new Set(allowedVars);

    // Check that all used variables are allowed
    for (const varName of usedVars) {
      // Skip if it's a helper function (already registered)
      if (AllowedHelperNames.includes(varName)) {
        continue;
      }

      if (!allowedIdentifiers.has(varName)) {
        return {
          ok: false,
          error: `Unknown identifier: ${varName}. Allowed: ${Array.from(allowedIdentifiers).join(', ')}`,
        };
      }
    }

    // Expression is valid
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid expression syntax',
    };
  }
}

/**
 * Evaluate an expression safely
 *
 * @param expr - Expression string to evaluate
 * @param ctx - Evaluation context with variables and helpers
 * @param options - Optional evaluation options
 * @returns Evaluated result
 */
export function evaluateExpression(
  expr: string,
  ctx: EvalContext,
  options?: { maxOps?: number; timeoutMs?: number }
): any {
  const maxOps = options?.maxOps ?? 10000;
  const timeoutMs = options?.timeoutMs ?? 50;

  try {
    // Create operation counter
    let opCount = 0;
    const startTime = Date.now();

    // Create combined scope with vars and helpers
    const clock = ctx.clock ?? (() => new Date(0));

    // Bind clock to dateDiff helper
    const helpersWithClock = {
      ...Helpers,
      dateDiff: (unit: string, fromISO: string, toISO?: string) =>
        Helpers.dateDiff(unit, fromISO, toISO, clock),
    };

    // Filter out undefined values from vars
    const cleanVars: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(ctx.vars)) {
      if (value !== undefined) {
        cleanVars[key] = value;
      }
    }

    const scope = {
      ...cleanVars,
      ...helpersWithClock,
      ...ctx.helpers,
    };

    // Parse and evaluate
    const parser = new Parser();

    // Register functions
    for (const [name, fn] of Object.entries(helpersWithClock)) {
      parser.functions[name] = fn;
    }

    const parsed = parser.parse(expr);

    // Check for property access (not fully supported by expr-eval's variables() method)
    // We'll rely on the sandbox nature of expr-eval and the fact that we control the scope
    const exprStr = expr.toLowerCase();
    for (const forbidden of FORBIDDEN_IDENTIFIERS) {
      if (exprStr.includes(forbidden.toLowerCase())) {
        throw new Error(`Forbidden identifier: ${forbidden}`);
      }
    }

    // SECURITY FIX: Add operation counting to prevent DoS
    // Wrap all helpers to count operations and enforce limits
    const MAX_OPERATIONS = options?.maxOps ?? 10000;


    const wrappedHelpers: any = {};
    for (const [name, fn] of Object.entries(helpersWithClock)) {
      wrappedHelpers[name] = (...args: any[]) => {
        opCount++;
        if (opCount > MAX_OPERATIONS) {
          throw new Error(`Expression exceeded maximum operations (${MAX_OPERATIONS})`);
        }
        return (fn as any)(...args);
      };
    }

    // Add wrapped helpers to parser
    for (const [name, fn] of Object.entries(wrappedHelpers)) {
      parser.functions[name] = fn;
    }

    // Evaluate with timeout protection
    const timeoutId = setTimeout(() => {
      throw new Error(`Expression evaluation timeout (${timeoutMs}ms)`);
    }, timeoutMs);

    try {
      // Note: setTimeout doesn't interrupt JS execution, but operation counting does
      const result = parsed.evaluate(cleanVars as any);
      clearTimeout(timeoutId);

      // Additional time check
      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutMs) {
        throw new Error(`Expression evaluation took too long (${elapsed}ms > ${timeoutMs}ms)`);
      }

      return result;
    } catch (evalError) {
      clearTimeout(timeoutId);
      throw evalError;
    }
  } catch (error) {
    // Sanitize error message (no stack traces)
    const message = error instanceof Error ? error.message : 'Expression evaluation failed';
    throw new Error(`Expression error: ${message}`);
  }
}

/**
 * Check if an expression is a simple boolean condition
 */
export function isBooleanExpression(expr: string): boolean {
  try {
    const parser = new Parser();
    const parsed = parser.parse(expr);
    // This is a heuristic - we can't definitively know without evaluating
    return true;
  } catch {
    return false;
  }
}
