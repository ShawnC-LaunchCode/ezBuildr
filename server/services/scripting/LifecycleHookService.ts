/**
 * Lifecycle Hook Service
 * Manages lifecycle hooks and their execution during workflow runs
 */

import type {
  LifecycleHook,
  LifecycleHookPhase,
  LifecycleHookExecutionResult,
  CreateLifecycleHookInput,
  UpdateLifecycleHookInput,
  TestHookInput,
  TestHookResult,
  ScriptExecutionLog,
} from "@shared/types/scripting";

import { logger } from "../../logger";
import { lifecycleHookRepository } from "../../repositories/LifecycleHookRepository";
import { scriptExecutionLogRepository } from "../../repositories/ScriptExecutionLogRepository";
import { workflowRepository } from "../../repositories/WorkflowRepository";
import { db } from "../../db";
import { steps as stepsTable, sections as sectionsTable } from "@shared/schema";
import { eq } from "drizzle-orm";

import { scriptEngine } from "./ScriptEngine";

export class LifecycleHookService {
  /**
   * Execute all hooks for a given phase
   * Non-breaking: continues on errors and collects them
   */
  async executeHooksForPhase(params: {
    workflowId: string;
    runId: string;
    phase: LifecycleHookPhase;
    sectionId?: string;
    data: Record<string, any>;
    userId?: string;
  }): Promise<LifecycleHookExecutionResult> {
    const { workflowId, runId, phase, sectionId, data, userId } = params;

    try {
      // Fetch enabled hooks for this phase
      const hooks = await lifecycleHookRepository.findEnabledByPhase(
        workflowId,
        phase,
        sectionId
      );

      if (hooks.length === 0) {
        return {
          success: true,
          data,
        };
      }

      logger.debug(
        {
          workflowId,
          runId,
          phase,
          sectionId,
          hookCount: hooks.length,
        },
        "LifecycleHookService: Executing hooks for phase"
      );

      // Fetch step aliases for data mapping (stepId → alias)
      const steps = await db.select()
        .from(stepsTable)
        .innerJoin(sectionsTable, eq(stepsTable.sectionId, sectionsTable.id))
        .where(eq(sectionsTable.workflowId, workflowId));

      const aliasMap: Record<string, string> = {};
      for (const row of steps) {
        const step = row.steps; // Access steps column from join
        if (step.alias) {
          aliasMap[step.alias] = step.id; // alias → stepId
        }
      }

      logger.debug(
        {
          workflowId,
          aliasCount: Object.keys(aliasMap).length,
        },
        "LifecycleHookService: Built alias map for workflow"
      );

      const errors: Array<{ hookId: string; hookName: string; error: string }> = [];
      const consoleOutput: Array<{ hookName: string; logs: any[][] }> = [];
      const resultData = { ...data };

      // Execute hooks sequentially in order
      for (const hook of hooks) {
        const hookStartTime = Date.now();

        try {
          // Execute the hook
          const result = await scriptEngine.execute({
            language: hook.language,
            code: hook.code,
            inputKeys: hook.inputKeys,
            data: resultData,
            aliasMap, // Pass alias map for stepId → alias resolution
            context: {
              workflowId,
              runId,
              phase,
              sectionId,
              userId,
            },
            timeoutMs: hook.timeoutMs || 1000,
            consoleEnabled: true,
          });

          const durationMs = Date.now() - hookStartTime;

          if (result.ok) {
            // If mutation mode is enabled, merge outputs into data
            if (hook.mutationMode && result.output) {
              // Validate output against outputKeys whitelist
              if (typeof result.output === "object" && result.output !== null && !Array.isArray(result.output)) {
                // Only merge keys that are whitelisted in outputKeys
                for (const key of hook.outputKeys) {
                  if (key in result.output) {
                    resultData[key] = result.output[key];
                  }
                }

                // Warn about non-whitelisted keys
                const outputKeys = Object.keys(result.output);
                const unauthorizedKeys = outputKeys.filter(k => !hook.outputKeys.includes(k));
                if (unauthorizedKeys.length > 0) {
                  logger.warn(
                    {
                      hookId: hook.id,
                      hookName: hook.name,
                      unauthorizedKeys,
                    },
                    "Hook attempted to output non-whitelisted keys (ignored)"
                  );
                }
              } else if (hook.outputKeys.length > 0) {
                // If output is a single value, use the first outputKey
                resultData[hook.outputKeys[0]] = result.output;
              }
            }

            // Collect console logs
            if (result.consoleLogs && result.consoleLogs.length > 0) {
              consoleOutput.push({
                hookName: hook.name,
                logs: result.consoleLogs,
              });
            }

            // Log successful execution
            await this.logExecution({
              runId,
              scriptType: "lifecycle_hook",
              scriptId: hook.id,
              scriptName: hook.name,
              phase,
              status: "success",
              consoleOutput: result.consoleLogs,
              inputSample: this.truncateSample(data),
              outputSample: this.truncateSample(result.output),
              durationMs,
            });

            logger.debug(
              {
                hookId: hook.id,
                hookName: hook.name,
                durationMs,
                mutated: hook.mutationMode,
              },
              "LifecycleHookService: Hook executed successfully"
            );
          } else {
            // Hook failed
            errors.push({
              hookId: hook.id,
              hookName: hook.name,
              error: result.error || "Unknown error",
            });

            // Log error
            await this.logExecution({
              runId,
              scriptType: "lifecycle_hook",
              scriptId: hook.id,
              scriptName: hook.name,
              phase,
              status: result.error?.includes("Timeout") ? "timeout" : "error",
              errorMessage: result.error,
              durationMs,
            });

            logger.warn(
              {
                hookId: hook.id,
                hookName: hook.name,
                error: result.error,
              },
              "LifecycleHookService: Hook execution failed"
            );
          }
        } catch (error) {
          // Unexpected error during hook execution
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push({
            hookId: hook.id,
            hookName: hook.name,
            error: errorMessage,
          });

          await this.logExecution({
            runId,
            scriptType: "lifecycle_hook",
            scriptId: hook.id,
            scriptName: hook.name,
            phase,
            status: "error",
            errorMessage,
            durationMs: Date.now() - hookStartTime,
          });

          logger.error(
            {
              hookId: hook.id,
              hookName: hook.name,
              error,
            },
            "LifecycleHookService: Unexpected error during hook execution"
          );
        }
      }

      return {
        success: errors.length === 0,
        data: resultData,
        errors: errors.length > 0 ? errors : undefined,
        consoleOutput: consoleOutput.length > 0 ? consoleOutput : undefined,
      };
    } catch (error) {
      logger.error(
        {
          error,
          workflowId,
          runId,
          phase,
        },
        "LifecycleHookService: Failed to execute hooks for phase"
      );

      // Non-breaking: return original data on error
      return {
        success: false,
        data,
        errors: [
          {
            hookId: "system",
            hookName: "System Error",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        ],
      };
    }
  }

  /**
   * Create a new lifecycle hook
   */
  async createHook(
    workflowId: string,
    userId: string,
    data: CreateLifecycleHookInput
  ): Promise<LifecycleHook> {
    // Verify workflow ownership
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.creatorId && workflow.creatorId !== userId) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Create hook
    const hook = await lifecycleHookRepository.create({
      ...data,
      workflowId,
    });

    logger.info(
      {
        hookId: hook.id,
        workflowId,
        phase: hook.phase,
      },
      "LifecycleHookService: Created lifecycle hook"
    );

    return hook as LifecycleHook;
  }

  /**
   * Update a lifecycle hook
   */
  async updateHook(
    hookId: string,
    userId: string,
    data: UpdateLifecycleHookInput
  ): Promise<LifecycleHook> {
    // Get hook and verify ownership
    const hook = await lifecycleHookRepository.findByIdWithWorkflow(hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    const workflow = await workflowRepository.findById(hook.workflowId);
    if (!workflow || (workflow.creatorId && workflow.creatorId !== userId)) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Update hook
    const updated = await lifecycleHookRepository.update(hookId, data);

    logger.info(
      {
        hookId,
        workflowId: hook.workflowId,
      },
      "LifecycleHookService: Updated lifecycle hook"
    );

    return updated as LifecycleHook;
  }

  /**
   * Delete a lifecycle hook
   */
  async deleteHook(hookId: string, userId: string): Promise<void> {
    // Get hook and verify ownership
    const hook = await lifecycleHookRepository.findByIdWithWorkflow(hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    const workflow = await workflowRepository.findById(hook.workflowId);
    if (!workflow || (workflow.creatorId && workflow.creatorId !== userId)) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Delete hook
    await lifecycleHookRepository.delete(hookId);

    logger.info(
      {
        hookId,
        workflowId: hook.workflowId,
      },
      "LifecycleHookService: Deleted lifecycle hook"
    );
  }

  /**
   * Test a hook with sample data
   */
  async testHook(
    hookId: string,
    userId: string,
    testInput: TestHookInput
  ): Promise<TestHookResult> {
    // Get hook and verify ownership
    const hook = await lifecycleHookRepository.findByIdWithWorkflow(hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    const workflow = await workflowRepository.findById(hook.workflowId);
    if (!workflow || (workflow.creatorId && workflow.creatorId !== userId)) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Execute hook with test data
    const result = await scriptEngine.execute({
      language: hook.language,
      code: hook.code,
      inputKeys: hook.inputKeys,
      data: testInput.testData,
      context: {
        workflowId: testInput.context?.workflowId || hook.workflowId,
        runId: testInput.context?.runId || "test-run",
        phase: testInput.context?.phase || hook.phase,
        sectionId: testInput.context?.sectionId,
        userId: testInput.context?.userId,
        metadata: testInput.context?.metadata,
      },
      timeoutMs: hook.timeoutMs || 1000,
      consoleEnabled: true,
    });

    return {
      success: result.ok,
      output: result.output,
      error: result.error,
      consoleLogs: result.consoleLogs,
      durationMs: result.durationMs,
    };
  }

  /**
   * List all hooks for a workflow
   */
  async listHooks(workflowId: string, userId: string): Promise<LifecycleHook[]> {
    // Verify workflow ownership
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.creatorId && workflow.creatorId !== userId) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    return await lifecycleHookRepository.findByWorkflowId(workflowId) as LifecycleHook[];
  }

  /**
   * Get execution logs for a run
   */
  async getExecutionLogs(runId: string, userId: string): Promise<ScriptExecutionLog[]> {
    // TODO: Verify run ownership via RunService
    return await scriptExecutionLogRepository.findByRunId(runId) as ScriptExecutionLog[];
  }

  /**
   * Clear execution logs for a run
   */
  async clearExecutionLogs(runId: string, userId: string): Promise<void> {
    // TODO: Verify run ownership via RunService
    await scriptExecutionLogRepository.deleteByRunId(runId);
  }

  /**
   * Log script execution to database
   */
  private async logExecution(params: {
    runId: string;
    scriptType: string;
    scriptId: string;
    scriptName?: string;
    phase?: string;
    status: "success" | "error" | "timeout";
    errorMessage?: string;
    consoleOutput?: any[][];
    inputSample?: any;
    outputSample?: any;
    durationMs?: number;
  }): Promise<void> {
    try {
      await scriptExecutionLogRepository.createLog({
        runId: params.runId,
        scriptType: params.scriptType,
        scriptId: params.scriptId,
        scriptName: params.scriptName,
        phase: params.phase,
        status: params.status,
        errorMessage: params.errorMessage,
        consoleOutput: params.consoleOutput ? JSON.parse(JSON.stringify(params.consoleOutput)) : null,
        inputSample: params.inputSample,
        outputSample: params.outputSample,
        durationMs: params.durationMs,
      });
    } catch (error) {
      logger.error(
        {
          error,
          scriptId: params.scriptId,
        },
        "LifecycleHookService: Failed to log execution"
      );
      // Non-fatal: don't throw
    }
  }

  /**
   * Truncate sample data to first 1KB
   */
  private truncateSample(data: any): any {
    if (data === undefined || data === null) {
      return null;
    }

    try {
      const json = JSON.stringify(data);
      if (json.length > 1024) {
        return JSON.parse(`${json.slice(0, 1024)  }...`);
      }
      return data;
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const lifecycleHookService = new LifecycleHookService();
