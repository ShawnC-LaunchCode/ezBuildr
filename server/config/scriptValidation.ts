/**
 * Script Validation Configuration
 * Defines security policies and limits for custom script execution
 */

import type { ASTValidationConfig } from "../services/scripting/ASTValidator";

// ===================================================================
// VALIDATION PROFILES
// ===================================================================

/**
 * Strict validation profile (default)
 * Maximum security, recommended for production
 */
export const strictValidationConfig: ASTValidationConfig = {
  forbiddenGlobals: [
    // Node.js core globals
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    "process",
    "global",
    "globalThis",
    "Buffer",
    "clearImmediate",
    "setImmediate",
    "clearInterval",
    "clearTimeout",
    "setInterval",
    "setTimeout",

    // Browser/DOM globals
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "Worker",
    "SharedWorker",
    "ServiceWorker",
    "navigator",
    "location",
    "history",
    "screen",
    "alert",
    "confirm",
    "prompt",

    // Deprecated/dangerous globals
    "escape",
    "unescape",
    "uneval",
  ],
  forbiddenFunctions: [
    // Dynamic code execution
    "eval",
    "Function",
    "GeneratorFunction",
    "AsyncFunction",
    "AsyncGeneratorFunction",

    // Module loading
    "require",
    "import",
    "importScripts",

    // Legacy/unsafe functions
    "execScript",
    "uneval",
  ],
  forbiddenProperties: [
    // Prototype manipulation
    "__proto__",
    "constructor",
    "prototype",

    // Property descriptor manipulation
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",

    // Internal properties
    "__esModule",
    "__webpack_require__",
    "__non_webpack_require__",
  ],
  allowedHelpers: [
    // Core script context
    "input",
    "context",
    "helpers",
    "emit",

    // Helper library categories
    "date",
    "string",
    "number",
    "array",
    "object",
    "math",
    "http",
    "console",

    // Allowed standard functions/objects
    "Array",
    "Object",
    "String",
    "Number",
    "Boolean",
    "Date",
    "Math",
    "JSON",
    "RegExp",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Symbol",
    "BigInt",
    "Proxy",
    "Reflect",
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",

    // Safe utility methods
    "isNaN",
    "isFinite",
    "parseInt",
    "parseFloat",
    "encodeURI",
    "decodeURI",
    "encodeURIComponent",
    "decodeURIComponent",
  ],
  maxComplexity: 20, // Cyclomatic complexity limit
  maxDepth: 10, // Maximum AST nesting depth
  maxNodes: 500, // Maximum total AST nodes
};

/**
 * Moderate validation profile
 * Balanced security and flexibility, suitable for trusted users
 */
export const moderateValidationConfig: ASTValidationConfig = {
  ...strictValidationConfig,
  maxComplexity: 30,
  maxDepth: 15,
  maxNodes: 1000,
};

/**
 * Permissive validation profile
 * Minimal restrictions, for development/testing only
 * WARNING: Do not use in production
 */
export const permissiveValidationConfig: ASTValidationConfig = {
  forbiddenGlobals: [
    // Only block the most dangerous globals
    "require",
    "module",
    "process",
    "global",
    "globalThis",
    "eval",
  ],
  forbiddenFunctions: [
    "eval",
    "Function",
    "require",
  ],
  forbiddenProperties: [
    "__proto__",
  ],
  allowedHelpers: [
    ...strictValidationConfig.allowedHelpers,
  ],
  maxComplexity: 50,
  maxDepth: 20,
  maxNodes: 2000,
};

// ===================================================================
// PROFILE SELECTION
// ===================================================================

export type ValidationProfile = "strict" | "moderate" | "permissive";

export function getValidationConfig(profile: ValidationProfile = "strict"): ASTValidationConfig {
  switch (profile) {
    case "strict":
      return strictValidationConfig;
    case "moderate":
      return moderateValidationConfig;
    case "permissive":
      return permissiveValidationConfig;
    default:
      return strictValidationConfig;
  }
}

// ===================================================================
// ENVIRONMENT-BASED CONFIGURATION
// ===================================================================

/**
 * Get validation config based on environment
 * - Production: Always strict
 * - Test: Configurable via env var
 * - Development: Configurable via env var
 */
export function getValidationConfigForEnvironment(): ASTValidationConfig {
  const env = process.env.NODE_ENV || "development";
  const configProfile = (process.env.SCRIPT_VALIDATION_PROFILE || "strict") as ValidationProfile;

  // Always use strict in production
  if (env === "production") {
    return strictValidationConfig;
  }

  // Use configured profile for dev/test
  return getValidationConfig(configProfile);
}

// ===================================================================
// CUSTOM CONFIGURATION BUILDER
// ===================================================================

export class ValidationConfigBuilder {
  private config: ASTValidationConfig;

  constructor(baseProfile: ValidationProfile = "strict") {
    this.config = { ...getValidationConfig(baseProfile) };
  }

  /**
   * Add forbidden global identifiers
   */
  forbidGlobals(...globals: string[]): this {
    this.config.forbiddenGlobals.push(...globals);
    return this;
  }

  /**
   * Allow specific global identifiers
   */
  allowGlobals(...globals: string[]): this {
    this.config.forbiddenGlobals = this.config.forbiddenGlobals.filter(
      g => !globals.includes(g)
    );
    return this;
  }

  /**
   * Add forbidden function names
   */
  forbidFunctions(...functions: string[]): this {
    this.config.forbiddenFunctions.push(...functions);
    return this;
  }

  /**
   * Set complexity limits
   */
  setComplexityLimits(options: {
    maxComplexity?: number;
    maxDepth?: number;
    maxNodes?: number;
  }): this {
    if (options.maxComplexity !== undefined) {
      this.config.maxComplexity = options.maxComplexity;
    }
    if (options.maxDepth !== undefined) {
      this.config.maxDepth = options.maxDepth;
    }
    if (options.maxNodes !== undefined) {
      this.config.maxNodes = options.maxNodes;
    }
    return this;
  }

  /**
   * Build final configuration
   */
  build(): ASTValidationConfig {
    return { ...this.config };
  }
}

// ===================================================================
// EXAMPLES
// ===================================================================

/*
// Example 1: Use strict profile (default)
import { getValidationConfig } from './scriptValidation';
const config = getValidationConfig('strict');

// Example 2: Use environment-based config
import { getValidationConfigForEnvironment } from './scriptValidation';
const config = getValidationConfigForEnvironment();

// Example 3: Build custom config
import { ValidationConfigBuilder } from './scriptValidation';
const config = new ValidationConfigBuilder('moderate')
  .forbidGlobals('myCustomGlobal')
  .setComplexityLimits({ maxNodes: 750 })
  .build();
*/
