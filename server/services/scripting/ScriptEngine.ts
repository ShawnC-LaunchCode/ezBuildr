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

import { getValidationConfigForEnvironment } from "../../config/scriptValidation";
import { logger } from "../../logger";
import { executeCodeWithHelpers } from "../../utils/enhancedSandboxExecutor";

import { ASTValidator } from "./ASTValidator";
import { helperLibrary } from "./HelperLibrary";
import { buildScriptContext } from "./ScriptContext";


export class ScriptEngine {
  private astValidator: ASTValidator;

  constructor() {
    // Initialize AST validator with environment-based config
    const validationConfig = getValidationConfigForEnvironment();
    this.astValidator = new ASTValidator(validationConfig);
  }

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
      const { aliasMap } = params;

      for (const key of inputKeys) {
        // Resolve key to stepId if possible
        const dataKey = aliasMap?.[key] || key;

        if (dataKey in data) {
          input[key] = data[dataKey];
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
   * Validate script syntax and security using AST parsing
   */
  async validate(params: ValidateScriptParams): Promise<ValidateScriptResult> {
    const { language, code } = params;

    try {
      // Basic validation: code size (32KB limit)
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

      // Perform AST-based validation
      let validationResult;

      if (language === "javascript") {
        // Use AST validator for JavaScript
        validationResult = this.astValidator.validateJavaScript(code);

        // Log validation results
        logger.debug({
          valid: validationResult.valid,
          violations: validationResult.violations?.length || 0,
          warnings: validationResult.warnings?.length || 0,
          complexity: validationResult.complexity,
        }, "JavaScript AST validation completed");

        // Return validation result
        if (!validationResult.valid) {
          return {
            valid: false,
            error: validationResult.error,
          };
        }

        // Log warnings but still return valid
        if (validationResult.warnings && validationResult.warnings.length > 0) {
          logger.info({
            warnings: validationResult.warnings,
          }, "Script validation warnings");
        }

        return {
          valid: true,
          warnings: validationResult.warnings,
        };
      } else if (language === "python") {
        // Use pattern-based validation for Python
        validationResult = this.astValidator.validatePython(code);

        logger.debug({
          valid: validationResult.valid,
          violations: validationResult.violations?.length || 0,
          warnings: validationResult.warnings?.length || 0,
        }, "Python validation completed");

        if (!validationResult.valid) {
          return {
            valid: false,
            error: validationResult.error,
          };
        }

        if (validationResult.warnings && validationResult.warnings.length > 0) {
          logger.info({
            warnings: validationResult.warnings,
          }, "Script validation warnings");
        }

        return {
          valid: true,
          warnings: validationResult.warnings,
        };
      } else {
        return {
          valid: false,
          error: `Unsupported language: ${language}`,
        };
      }
    } catch (error) {
      logger.error({ error }, "Script validation failed with exception");
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
