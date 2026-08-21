/**
 * Lifecycle Hook Service
 * Manages lifecycle hooks and their execution during workflow runs
 */

import { eq } from "drizzle-orm";

import { steps as stepsTable, sections as sectionsTable } from "@shared/schema";
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
import { withCurrentTenant } from "../../utils/rlsContext";
import { runAuthResolver } from "../runs/RunAuthResolver";
import { workflowService } from "../WorkflowService";

import { scriptEngine } from "./ScriptEngine";

import type { DbTransaction } from "../../repositories";

const WORKFLOW_NOT_FOUND_MSG = "Workflow not found";

export class LifecycleHookService {
  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-2e, ambient-only variant). Reuses a caller-supplied `tx`
   * rather than nesting.
   *
   * Only the DB phase of a method goes inside: `scriptEngine.execute` runs a
   * sandboxed script (a subprocess, for Python) and must never be held inside
   * an open transaction — see TENANT_ISOLATION_RLS §2d.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }
  /**
   * Read the hooks for a phase plus the workflow's step-alias map, in one
   * tenant-scoped transaction. `steps` is RLS-covered; without a tenant the
   * alias map would silently come back empty under enforcement, so this reads
   * it scoped and fails loudly instead.
   */
  private async loadHooksAndAliases(
    workflowId: string,
    phase: LifecycleHookPhase,
    sectionId: string | undefined
  ): Promise<{ hooks: LifecycleHook[]; aliasMap: Record<string, string> }> {
    return this.withTx(undefined, async (tx) => {
      const hooks = await lifecycleHookRepository.findEnabledByPhase(
        workflowId,
        phase,
        sectionId,
        tx
      ) as LifecycleHook[];

      if (hooks.length === 0) {
        return { hooks, aliasMap: {} };
      }

      const rows = await tx.select()
        .from(stepsTable)
        .innerJoin(sectionsTable, eq(stepsTable.sectionId, sectionsTable.id))
        .where(eq(sectionsTable.workflowId, workflowId));

      const aliasMap: Record<string, string> = {};
      for (const row of rows) {
        const step = row.steps; // Access steps column from join
        if (step.alias) {
          aliasMap[step.alias] = step.id; // alias → stepId
        }
      }
      return { hooks, aliasMap };
    });
  }
  /**
   * Execute all hooks for a given phase
   * Non-breaking: continues on errors and collects them
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity, complexity
  async executeHooksForPhase(params: {
    workflowId: string;
    runId: string;
    phase: LifecycleHookPhase;
    sectionId?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>;
    userId?: string;
  }): Promise<LifecycleHookExecutionResult> {
    const { workflowId, runId, phase, sectionId, data, userId } = params;

    try {
      // Fetch enabled hooks for this phase, plus the step aliases used for
      // data mapping (stepId → alias) — one scoped transaction for both.
      const { hooks, aliasMap } = await this.loadHooksAndAliases(workflowId, phase, sectionId);

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

      logger.debug(
        {
          workflowId,
          aliasCount: Object.keys(aliasMap).length,
        },
        "LifecycleHookService: Built alias map for workflow"
      );

      const errors: Array<{ hookId: string; hookName: string; error: string }> = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            timeoutMs: hook.timeoutMs ?? 1000,
            consoleEnabled: true,
          });

          const durationMs = Date.now() - hookStartTime;

          if (result.ok) {
            // If mutation mode is enabled, merge outputs into data
            if (hook.mutationMode && result.output) {
              // Validate output against outputKeys whitelist
              // eslint-disable-next-line max-depth
              if (typeof result.output === "object" && result.output !== null && !Array.isArray(result.output)) {
                // Only merge keys that are whitelisted in outputKeys
                // eslint-disable-next-line max-depth
                for (const key of hook.outputKeys) {
                  // eslint-disable-next-line max-depth
                  if (key in result.output) {
                    resultData[key] = (result.output as Record<string, unknown>)[key];
                  }
                }

                // Warn about non-whitelisted keys
                const outputKeys = Object.keys(result.output);
                const unauthorizedKeys = outputKeys.filter(k => !hook.outputKeys.includes(k));
                // eslint-disable-next-line max-depth
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
                const key = hook.outputKeys[0];
                // eslint-disable-next-line max-depth
                if (key) {resultData[key] = result.output;}
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Lifecycle hook values are intentionally dynamic.
              inputSample: this.truncateSample(data),
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Lifecycle hook values are intentionally dynamic.
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
              error: result.error ?? "Unknown error",
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
    const hook = await this.withTx(undefined, async (tx) => {
      // Verify workflow ownership
      const workflow = await workflowRepository.findById(workflowId, tx);
      if (!workflow) {
        throw new Error(WORKFLOW_NOT_FOUND_MSG);
      }
      await workflowService.verifyAccess(workflowId, userId, 'edit', tx);

      // Create hook
      return lifecycleHookRepository.create({
        ...data,
        workflowId,
      }, tx);
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
    const { hook, updated } = await this.withTx(undefined, async (tx) => {
      // Get hook and verify ownership
      const found = await lifecycleHookRepository.findByIdWithWorkflow(hookId, tx);
      if (!found) {
        throw new Error("Hook not found");
      }

      const workflow = await workflowRepository.findById(found.workflowId, tx);
      if (!workflow) {
        throw new Error(WORKFLOW_NOT_FOUND_MSG);
      }
      await workflowService.verifyAccess(found.workflowId, userId, 'edit', tx);

      // Update hook
      return { hook: found, updated: await lifecycleHookRepository.update(hookId, data, tx) };
    });

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
    const hook = await this.withTx(undefined, async (tx) => {
      // Get hook and verify ownership
      const found = await lifecycleHookRepository.findByIdWithWorkflow(hookId, tx);
      if (!found) {
        throw new Error("Hook not found");
      }

      const workflow = await workflowRepository.findById(found.workflowId, tx);
      if (!workflow) {
        throw new Error(WORKFLOW_NOT_FOUND_MSG);
      }
      await workflowService.verifyAccess(found.workflowId, userId, 'edit', tx);

      // Delete hook
      await lifecycleHookRepository.delete(hookId, tx);
      return found;
    });

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
    // Get hook and verify ownership. The transaction closes before the script
    // runs — a sandboxed execution must not be held inside one (§2d).
    const hook = await this.withTx(undefined, async (tx) => {
      const found = await lifecycleHookRepository.findByIdWithWorkflow(hookId, tx);
      if (!found) {
        throw new Error("Hook not found");
      }

      const workflow = await workflowRepository.findById(found.workflowId, tx);
      if (!workflow) {
        throw new Error(WORKFLOW_NOT_FOUND_MSG);
      }
      await workflowService.verifyAccess(found.workflowId, userId, 'view', tx);
      return found;
    });

    // Execute hook with test data
    const result = await scriptEngine.execute({
      language: hook.language,
      code: hook.code,
      inputKeys: hook.inputKeys,
      data: testInput.testData,
      context: {
        workflowId: testInput.context?.workflowId ?? hook.workflowId,
        runId: testInput.context?.runId ?? "test-run",
        phase: testInput.context?.phase ?? hook.phase,
        sectionId: testInput.context?.sectionId,
        userId: testInput.context?.userId,
        metadata: testInput.context?.metadata,
      },
      timeoutMs: hook.timeoutMs ?? 1000,
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
    return this.withTx(undefined, async (tx) => {
      // Verify workflow ownership
      const workflow = await workflowRepository.findById(workflowId, tx);
      if (!workflow) {
        throw new Error(WORKFLOW_NOT_FOUND_MSG);
      }
      await workflowService.verifyAccess(workflowId, userId, 'view', tx);

      return await lifecycleHookRepository.findByWorkflowId(workflowId, tx) as LifecycleHook[];
    });
  }

  /**
   * Get execution logs for a run
   */
  async getExecutionLogs(runId: string, userId: string): Promise<ScriptExecutionLog[]> {
    const { access } = await runAuthResolver.resolveRun(runId, userId);
    if (access === 'none') {
      throw new Error("Unauthorized: You do not have access to this run");
    }
    return await scriptExecutionLogRepository.findByRunId(runId) as ScriptExecutionLog[];
  }

  /**
   * Clear execution logs for a run
   */
  async clearExecutionLogs(runId: string, userId: string): Promise<void> {
    const { access } = await runAuthResolver.resolveRun(runId, userId);
    if (access === 'none') {
      throw new Error("Unauthorized: You do not have access to this run");
    }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consoleOutput?: any[][];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSample?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private truncateSample(data: any): any {
    if (data === undefined || data == null) {
      return null;
    }

    try {
      const json = JSON.stringify(data);
      if (json.length > 1024) {

        return JSON.parse(`${json.slice(0, 1024)}...`);
      }
      return data;
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const lifecycleHookService = new LifecycleHookService();
