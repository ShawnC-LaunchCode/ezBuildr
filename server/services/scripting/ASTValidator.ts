/**
 * AST-Based Script Validation for Enhanced Security
 * Uses Abstract Syntax Tree parsing to detect forbidden patterns and enforce security constraints
 */

import * as acorn from "acorn";

import { logger } from "../../logger";

// ===================================================================
// VALIDATION RESULT TYPES
// ===================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  violations?: SecurityViolation[];
  complexity?: ComplexityMetrics;
  warnings?: string[];
}

export interface SecurityViolation {
  type: ViolationType;
  node: string;
  line?: number;
  column?: number;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
}

export type ViolationType =
  | "forbidden_global"
  | "forbidden_import"
  | "forbidden_function"
  | "forbidden_property"
  | "forbidden_operator"
  | "complexity_exceeded"
  | "depth_exceeded"
  | "suspicious_pattern";

export interface ComplexityMetrics {
  nodeCount: number;
  maxDepth: number;
  cyclomaticComplexity: number;
  functionCount: number;
  loopCount: number;
}

export interface ForbiddenPattern {
  pattern: RegExp | string;
  type: ViolationType;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
}

// ===================================================================
// AST VALIDATOR CLASS
// ===================================================================

export class ASTValidator {
  private forbiddenGlobals: Set<string>;
  private forbiddenFunctions: Set<string>;
  private forbiddenProperties: Set<string>;
  private allowedHelpers: Set<string>;
  private maxComplexity: number;
  private maxDepth: number;
  private maxNodes: number;

  constructor(config?: Partial<ASTValidationConfig>) {
    const defaults = getDefaultConfig();
    const merged = { ...defaults, ...config };

    this.forbiddenGlobals = new Set(merged.forbiddenGlobals);
    this.forbiddenFunctions = new Set(merged.forbiddenFunctions);
    this.forbiddenProperties = new Set(merged.forbiddenProperties);
    this.allowedHelpers = new Set(merged.allowedHelpers);
    this.maxComplexity = merged.maxComplexity;
    this.maxDepth = merged.maxDepth;
    this.maxNodes = merged.maxNodes;
  }

  /**
   * Validate JavaScript code using AST parsing
   */
  validateJavaScript(code: string): ValidationResult {
    const startTime = Date.now();
    const violations: SecurityViolation[] = [];
    const warnings: string[] = [];

    try {
      // Parse code into AST
      let ast: acorn.Node;
      try {
        ast = acorn.parse(code, {
          ecmaVersion: 2020,
          sourceType: "script",
          locations: true,
        });
      } catch (parseError) {
        return {
          valid: false,
          error: parseError instanceof Error
            ? `Syntax error: ${parseError.message}`
            : "Failed to parse JavaScript code",
        };
      }

      // Analyze complexity
      const complexity = this.analyzeComplexity(ast);

      // Check complexity limits
      if (complexity.nodeCount > this.maxNodes) {
        violations.push({
          type: "complexity_exceeded",
          node: "Program",
          message: `Script exceeds maximum node count (${complexity.nodeCount} > ${this.maxNodes})`,
          severity: "high",
        });
      }

      if (complexity.maxDepth > this.maxDepth) {
        violations.push({
          type: "depth_exceeded",
          node: "Program",
          message: `Script exceeds maximum nesting depth (${complexity.maxDepth} > ${this.maxDepth})`,
          severity: "high",
        });
      }

      if (complexity.cyclomaticComplexity > this.maxComplexity) {
        warnings.push(
          `High cyclomatic complexity (${complexity.cyclomaticComplexity}). Consider simplifying logic.`
        );
      }

      // Detect forbidden patterns
      const patternViolations = this.detectForbiddenPatterns(ast);
      violations.push(...patternViolations);

      // Check for emit() call (required for output)
      const hasEmit = this.hasEmitCall(ast);
      if (!hasEmit) {
        warnings.push("Code does not call emit(). Script will not produce output.");
      }

      // Log validation metrics
      const durationMs = Date.now() - startTime;
      logger.debug({
        validationDurationMs: durationMs,
        nodeCount: complexity.nodeCount,
        violations: violations.length,
        warnings: warnings.length,
      }, "AST validation completed");

      // Determine if valid (critical/high violations fail validation)
      const criticalViolations = violations.filter(
        v => v.severity === "critical" || v.severity === "high"
      );

      if (criticalViolations.length > 0) {
        return {
          valid: false,
          error: criticalViolations[0].message,
          violations,
          complexity,
          warnings,
        };
      }

      return {
        valid: true,
        violations: violations.length > 0 ? violations : undefined,
        complexity,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      logger.error({ error }, "AST validation failed with exception");
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown validation error",
      };
    }
  }

  /**
   * Validate Python code using basic pattern matching
   * (Full AST parsing would require Python runtime)
   */
  validatePython(code: string): ValidationResult {
    const violations: SecurityViolation[] = [];
    const warnings: string[] = [];

    // Check for forbidden patterns in Python
    const forbiddenPythonPatterns: ForbiddenPattern[] = [
      {
        pattern: /\bimport\s+(os|sys|subprocess|socket|urllib|requests)\b/,
        type: "forbidden_import",
        message: "Forbidden Python import detected (os, sys, subprocess, socket, urllib, requests)",
        severity: "critical",
      },
      {
        pattern: /\bfrom\s+(os|sys|subprocess|socket|urllib|requests)\b/,
        type: "forbidden_import",
        message: "Forbidden Python import detected (os, sys, subprocess, socket, urllib, requests)",
        severity: "critical",
      },
      {
        pattern: /\bopen\s*\(/,
        type: "forbidden_function",
        message: "File access function 'open()' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\beval\s*\(/,
        type: "forbidden_function",
        message: "Dynamic code execution function 'eval()' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\bexec\s*\(/,
        type: "forbidden_function",
        message: "Dynamic code execution function 'exec()' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\bcompile\s*\(/,
        type: "forbidden_function",
        message: "Code compilation function 'compile()' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\b__import__\s*\(/,
        type: "forbidden_function",
        message: "Dynamic import function '__import__()' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\b__builtins__\b/,
        type: "forbidden_global",
        message: "Access to '__builtins__' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\b__globals__\b/,
        type: "forbidden_global",
        message: "Access to '__globals__' is forbidden",
        severity: "critical",
      },
      {
        pattern: /\b__code__\b/,
        type: "forbidden_property",
        message: "Access to '__code__' is forbidden",
        severity: "critical",
      },
    ];

    // Check each pattern
    for (const { pattern, type, message, severity } of forbiddenPythonPatterns) {
      if (typeof pattern === "string" ? code.includes(pattern) : pattern.test(code)) {
        violations.push({
          type,
          node: "Unknown",
          message,
          severity,
        });
      }
    }

    // Check for emit() call
    if (!code.includes("emit(")) {
      warnings.push("Python code does not call emit(). Script will not produce output.");
    }

    // Check code size
    if (code.length > 32 * 1024) {
      violations.push({
        type: "complexity_exceeded",
        node: "Program",
        message: "Code size exceeds 32KB limit",
        severity: "high",
      });
    }

    const criticalViolations = violations.filter(
      v => v.severity === "critical" || v.severity === "high"
    );

    if (criticalViolations.length > 0) {
      return {
        valid: false,
        error: criticalViolations[0].message,
        violations,
        warnings,
      };
    }

    return {
      valid: true,
      violations: violations.length > 0 ? violations : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Analyze code complexity metrics
   */
  analyzeComplexity(ast: acorn.Node): ComplexityMetrics {
    const metrics: ComplexityMetrics = {
      nodeCount: 0,
      maxDepth: 0,
      cyclomaticComplexity: 1, // Start at 1 (base complexity)
      functionCount: 0,
      loopCount: 0,
    };

    const traverse = (node: any, depth: number) => {
      if (!node || typeof node !== "object") {return;}

      metrics.nodeCount++;
      metrics.maxDepth = Math.max(metrics.maxDepth, depth);

      // Count complexity contributors
      switch (node.type) {
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
          metrics.functionCount++;
          metrics.cyclomaticComplexity++;
          break;

        case "IfStatement":
        case "ConditionalExpression":
        case "SwitchCase":
          metrics.cyclomaticComplexity++;
          break;

        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
          metrics.loopCount++;
          metrics.cyclomaticComplexity++;
          break;

        case "LogicalExpression":
          if (node.operator === "&&" || node.operator === "||") {
            metrics.cyclomaticComplexity++;
          }
          break;

        case "CatchClause":
          metrics.cyclomaticComplexity++;
          break;
      }

      // Traverse child nodes
      for (const key in node) {
        if (key === "loc" || key === "range" || key === "start" || key === "end") {
          continue;
        }

        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(c => traverse(c, depth + 1));
        } else if (child && typeof child === "object") {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(ast, 0);
    return metrics;
  }

  /**
   * Detect forbidden patterns in AST
   */
  detectForbiddenPatterns(ast: acorn.Node): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    const traverse = (node: any) => {
      if (!node || typeof node !== "object") {return;}

      try {
        // Check for forbidden identifiers (globals)
        if (node.type === "Identifier") {
          if (this.forbiddenGlobals.has(node.name)) {
            violations.push({
              type: "forbidden_global",
              node: node.name,
              line: node.loc?.start?.line,
              column: node.loc?.start?.column,
              message: `Forbidden global identifier: ${node.name}`,
              severity: "critical",
            });
          }
        }

        // Check for forbidden function calls
        if (node.type === "CallExpression") {
          const calleeName = this.getCalleeName(node.callee);
          if (calleeName && this.forbiddenFunctions.has(calleeName)) {
            violations.push({
              type: "forbidden_function",
              node: calleeName,
              line: node.loc?.start?.line,
              column: node.loc?.start?.column,
              message: `Forbidden function call: ${calleeName}()`,
              severity: "critical",
            });
          }
        }

        // Check for forbidden property access
        if (node.type === "MemberExpression") {
          const propertyName = this.getPropertyName(node);
          if (propertyName && this.forbiddenProperties.has(propertyName)) {
            violations.push({
              type: "forbidden_property",
              node: propertyName,
              line: node.loc?.start?.line,
              column: node.loc?.start?.column,
              message: `Forbidden property access: ${propertyName}`,
              severity: "critical",
            });
          }

          // Check for __proto__ manipulation
          if (propertyName === "__proto__") {
            violations.push({
              type: "forbidden_property",
              node: "__proto__",
              line: node.loc?.start?.line,
              column: node.loc?.start?.column,
              message: "Prototype manipulation via __proto__ is forbidden",
              severity: "critical",
            });
          }
        }

        // Check for dynamic code execution patterns
        if (node.type === "NewExpression" && this.getCalleeName(node.callee) === "Function") {
          violations.push({
            type: "forbidden_function",
            node: "Function",
            line: node.loc?.start?.line,
            column: node.loc?.start?.column,
            message: "Dynamic code execution via Function constructor is forbidden",
            severity: "critical",
          });
        }

        // Check for suspicious patterns (with statements, debugger)
        if (node.type === "WithStatement") {
          violations.push({
            type: "suspicious_pattern",
            node: "with",
            line: node.loc?.start?.line,
            column: node.loc?.start?.column,
            message: "'with' statement is forbidden (unsafe scope manipulation)",
            severity: "high",
          });
        }

        if (node.type === "DebuggerStatement") {
          violations.push({
            type: "suspicious_pattern",
            node: "debugger",
            line: node.loc?.start?.line,
            column: node.loc?.start?.column,
            message: "'debugger' statement should be removed from production code",
            severity: "medium",
          });
        }

        // Traverse child nodes
        for (const key in node) {
          if (key === "loc" || key === "range" || key === "start" || key === "end") {
            continue;
          }

          const child = node[key];
          if (Array.isArray(child)) {
            child.forEach(traverse);
          } else if (child && typeof child === "object") {
            traverse(child);
          }
        }
      } catch (error) {
        logger.warn({ error, nodeType: node.type }, "Error traversing AST node");
      }
    };

    traverse(ast);
    return violations;
  }

  /**
   * Check if code contains emit() call
   */
  private hasEmitCall(ast: acorn.Node): boolean {
    let hasEmit = false;

    const traverse = (node: any) => {
      if (!node || typeof node !== "object" || hasEmit) {return;}

      if (node.type === "CallExpression") {
        const calleeName = this.getCalleeName(node.callee);
        if (calleeName === "emit") {
          hasEmit = true;
          return;
        }
      }

      for (const key in node) {
        if (key === "loc" || key === "range" || key === "start" || key === "end") {
          continue;
        }

        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(traverse);
        } else if (child && typeof child === "object") {
          traverse(child);
        }
      }
    };

    traverse(ast);
    return hasEmit;
  }

  /**
   * Get function/method name from callee node
   */
  private getCalleeName(callee: any): string | null {
    if (!callee) {return null;}

    if (callee.type === "Identifier") {
      return callee.name;
    }

    if (callee.type === "MemberExpression") {
      return this.getPropertyName(callee);
    }

    return null;
  }

  /**
   * Get property name from member expression
   */
  private getPropertyName(node: any): string | null {
    if (node.type !== "MemberExpression") {return null;}

    if (node.property.type === "Identifier" && !node.computed) {
      return node.property.name;
    }

    if (node.computed && node.property.type === "Literal") {
      return String(node.property.value);
    }

    return null;
  }
}

// ===================================================================
// CONFIGURATION
// ===================================================================

export interface ASTValidationConfig {
  forbiddenGlobals: string[];
  forbiddenFunctions: string[];
  forbiddenProperties: string[];
  allowedHelpers: string[];
  maxComplexity: number;
  maxDepth: number;
  maxNodes: number;
}

export function getDefaultConfig(): ASTValidationConfig {
  return {
    forbiddenGlobals: [
      // Node.js globals
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
      // Browser globals (if somehow accessible)
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "Worker",
      "SharedWorker",
      "ServiceWorker",
      "navigator",
      "location",
      "history",
    ],
    forbiddenFunctions: [
      "eval",
      "Function",
      "require",
      "import",
      "importScripts",
      "execScript",
    ],
    forbiddenProperties: [
      "__proto__",
      "constructor",
      "prototype",
      "__defineGetter__",
      "__defineSetter__",
      "__lookupGetter__",
      "__lookupSetter__",
    ],
    allowedHelpers: [
      "input",
      "context",
      "helpers",
      "emit",
      // Helper categories
      "date",
      "string",
      "number",
      "array",
      "object",
      "math",
      "http",
      "console",
    ],
    maxComplexity: 20, // Cyclomatic complexity threshold
    maxDepth: 10, // Max AST nesting depth
    maxNodes: 500, // Max total AST nodes
  };
}

// ===================================================================
// SINGLETON INSTANCE
// ===================================================================

export const astValidator = new ASTValidator();
