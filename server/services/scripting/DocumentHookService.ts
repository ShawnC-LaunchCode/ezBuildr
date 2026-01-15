/**
 * Document Hook Service
 * Manages document hooks and their execution during document generation
 */

import type {
  DocumentHook,
  DocumentHookPhase,
  DocumentHookExecutionResult,
  CreateDocumentHookInput,
  UpdateDocumentHookInput,
  TestHookInput,
  TestHookResult,
} from "@shared/types/scripting";

import { logger } from "../../logger";
import { documentHookRepository } from "../../repositories/DocumentHookRepository";
import { scriptExecutionLogRepository } from "../../repositories/ScriptExecutionLogRepository";
import { workflowRepository } from "../../repositories/WorkflowRepository";

import { scriptEngine } from "./ScriptEngine";

export class DocumentHookService {
  /**
   * Execute all hooks for a given phase
   * Non-breaking: continues on errors and collects them
   */
  async executeHooksForPhase(params: {
    workflowId: string;
    runId: string;
    phase: DocumentHookPhase;
    documentId?: string;
    data: Record<string, any>;
    userId?: string;
  }): Promise<DocumentHookExecutionResult> {
    const { workflowId, runId, phase, documentId, data, userId } = params;

    try {
      // Fetch enabled hooks for this phase
      const hooks = await documentHookRepository.findEnabledByPhase(
        workflowId,
        phase,
        documentId
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
          documentId,
          hookCount: hooks.length,
        },
        "DocumentHookService: Executing hooks for phase"
      );

      const errors: Array<{ hookId: string; hookName: string; error: string }> = [];
      const consoleOutput: Array<{ hookName: string; logs: any[][] }> = [];
      let resultData = { ...data };

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
            context: {
              workflowId,
              runId,
              phase,
              userId,
              metadata: documentId ? { documentId } : {},
            },
            timeoutMs: hook.timeoutMs || 3000,
            consoleEnabled: true,
          });

          const durationMs = Date.now() - hookStartTime;

          if (result.ok) {
            // Merge output into resultData
            if (result.output && typeof result.output === "object" && result.output !== null) {
              resultData = { ...resultData, ...result.output };
            } else if (result.output !== undefined && hook.outputKeys.length > 0) {
              // Single value output
              const key = hook.outputKeys[0];
              if (key) resultData[key] = result.output;
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
              scriptType: "document_hook",
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
              },
              "DocumentHookService: Hook executed successfully"
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
              scriptType: "document_hook",
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
              "DocumentHookService: Hook execution failed"
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
            scriptType: "document_hook",
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
            "DocumentHookService: Unexpected error during hook execution"
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
        "DocumentHookService: Failed to execute hooks for phase"
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
   * Create a new document hook
   */
  async createHook(
    workflowId: string,
    userId: string,
    data: CreateDocumentHookInput
  ): Promise<DocumentHook> {
    // Verify workflow ownership
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.creatorId && workflow.creatorId !== userId) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Create hook
    const hook = await documentHookRepository.create({
      ...data,
      workflowId,
    });

    logger.info(
      {
        hookId: hook.id,
        workflowId,
        phase: hook.phase,
      },
      "DocumentHookService: Created document hook"
    );

    return hook as DocumentHook;
  }

  /**
   * Update a document hook
   */
  async updateHook(
    hookId: string,
    userId: string,
    data: UpdateDocumentHookInput
  ): Promise<DocumentHook> {
    // Get hook and verify ownership
    const hook = await documentHookRepository.findByIdWithWorkflow(hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    const workflow = await workflowRepository.findById(hook.workflowId);
    if (!workflow || (workflow.creatorId && workflow.creatorId !== userId)) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Update hook
    const updated = await documentHookRepository.update(hookId, data);

    logger.info(
      {
        hookId,
        workflowId: hook.workflowId,
      },
      "DocumentHookService: Updated document hook"
    );

    return updated as DocumentHook;
  }

  /**
   * Delete a document hook
   */
  async deleteHook(hookId: string, userId: string): Promise<void> {
    // Get hook and verify ownership
    const hook = await documentHookRepository.findByIdWithWorkflow(hookId);
    if (!hook) {
      throw new Error("Hook not found");
    }

    const workflow = await workflowRepository.findById(hook.workflowId);
    if (!workflow || (workflow.creatorId && workflow.creatorId !== userId)) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    // Delete hook
    await documentHookRepository.delete(hookId);

    logger.info(
      {
        hookId,
        workflowId: hook.workflowId,
      },
      "DocumentHookService: Deleted document hook"
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
    const hook = await documentHookRepository.findByIdWithWorkflow(hookId);
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
        userId: testInput.context?.userId,
        metadata: testInput.context?.metadata,
      },
      timeoutMs: hook.timeoutMs || 3000,
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
  async listHooks(workflowId: string, userId: string): Promise<DocumentHook[]> {
    // Verify workflow ownership
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.creatorId && workflow.creatorId !== userId) {
      throw new Error("Unauthorized: You do not own this workflow");
    }

    return (await documentHookRepository.findByWorkflowId(workflowId)) as DocumentHook[];
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
        consoleOutput: params.consoleOutput
          ? JSON.parse(JSON.stringify(params.consoleOutput))
          : null,
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
        "DocumentHookService: Failed to log execution"
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
        return JSON.parse(`${json.slice(0, 1024)}...`);
      }
      return data;
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const documentHookService = new DocumentHookService();
