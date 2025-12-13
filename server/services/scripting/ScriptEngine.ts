/**
 * Script Engine - Core execution service for Custom Scripting System
 * Orchestrates script execution with helper library and context injection
 */

import type {
  ExecuteScriptParams,
  ScriptExecutionResult,
  ValidateScriptParams,
  ValidateScriptResult,
  ScriptLanguage,
} from "@shared/types/scripting";
import { executeCodeWithHelpers } from "../../utils/enhancedSandboxExecutor";
import { buildScriptContext } from "./ScriptContext";
import { helperLibrary } from "./HelperLibrary";
import { logger } from "../../logger";

export class ScriptEngine {
  /**
   * Execute script with full context and helpers
   */
  async execute(params: ExecuteScriptParams): Promise<ScriptExecutionResult> {
    const {
      language,
      code,
      inputKeys,
      data,
      context,
      helpers = helperLibrary as any,
      timeoutMs = 1000,
      consoleEnabled = false,
    } = params;

    try {
      // Build input object with whitelisted keys only
      const input: Record<string, unknown> = {};
      for (const key of inputKeys) {
        if (key in data) {
          input[key] = data[key];
        }
      }

      // Build script context (metadata, env, etc.)
      const scriptContext = buildScriptContext(context);

      // Log execution start (debug level)
      logger.debug({
        language,
        inputKeys,
        phase: context.phase,
        workflowId: context.workflowId,
        runId: context.runId,
      }, "ScriptEngine: Executing script");

      // Execute with helpers and context injection
      // Extract resources if available in context (casted to any as ScriptEngine uses generics/loose types often)
      const resources = (context as any).resources || {};
      const cache = (context as any).cache || {};

      const result = await executeCodeWithHelpers({
        language,
        code,
        input,
        context: scriptContext,
        helpers,
        timeoutMs,
        consoleEnabled,
        isolate: resources.isolate,
        scriptCache: cache.scripts,
      });

      // Log execution result (debug level)
      logger.debug({
        success: result.ok,
        durationMs: result.durationMs,
        hasOutput: result.output !== undefined,
        hasConsoleLogs: result.consoleLogs && result.consoleLogs.length > 0,
      }, "ScriptEngine: Execution complete");

      return result;
    } catch (error) {
      logger.error({ error }, "ScriptEngine: Execution failed");
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown execution error",
      };
    }
  }

  /**
   * Validate script syntax without execution
   * Currently performs basic validation - could be enhanced with AST parsing
   */
  async validate(params: ValidateScriptParams): Promise<ValidateScriptResult> {
    const { language, code } = params;

    try {
      // Basic validation: code size
      if (code.length > 32 * 1024) {
        return {
          valid: false,
          error: "Code size exceeds 32KB limit",
        };
      }

      // Basic validation: non-empty code
      if (!code.trim()) {
        return {
          valid: false,
          error: "Code cannot be empty",
        };
      }

      if (language === "javascript") {
        // Basic validation: check for obviously malicious patterns first
        const dangerousPatterns = [
          /require\s*\(/,
          /import\s+/,
          /eval\s*\(/,
          /Function\s*\(/,
          /process\./,
          /global\./,
          /__proto__/,
          /constructor\s*\(/,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(code)) {
            return {
              valid: false,
              error: `Potentially unsafe code pattern detected: ${pattern.toString()}`,
            };
          }
        }

        // Syntax validation: Use Function constructor in a safe, non-executing way
        // We wrap in try-catch to catch syntax errors without executing code
        try {
          // Create function without calling it - this validates syntax only
          new Function('input', 'context', 'helpers', code);
        } catch (syntaxError) {
          return {
            valid: false,
            error: syntaxError instanceof Error ? syntaxError.message : "Syntax error",
          };
        }
      } else if (language === "python") {
        // Python syntax validation would require running Python parser
        // For now, just check for basic structure
        if (!code.includes("emit(")) {
          return {
            valid: false,
            error: "Python code must call emit() to produce output",
          };
        }
      } else {
        return {
          valid: false,
          error: `Unsupported language: ${language}`,
        };
      }

      return {
        valid: true,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown validation error",
      };
    }
  }

  /**
   * Test execute a script with sample data
   * Useful for testing in UI before saving
   */
  async test(params: {
    language: ScriptLanguage;
    code: string;
    inputKeys: string[];
    testData: Record<string, any>;
    timeoutMs?: number;
  }): Promise<ScriptExecutionResult> {
    const { language, code, inputKeys, testData, timeoutMs = 1000 } = params;

    // Create test execution context
    const testContext = {
      workflowId: "test-workflow",
      runId: "test-run",
      phase: "test",
    };

    return this.execute({
      language,
      code,
      inputKeys,
      data: testData,
      context: testContext,
      timeoutMs,
      consoleEnabled: true, // Always capture console logs in test mode
    });
  }
}

/**
 * Singleton instance of ScriptEngine
 */
export const scriptEngine = new ScriptEngine();
