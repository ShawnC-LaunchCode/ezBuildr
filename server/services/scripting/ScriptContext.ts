/**
 * Script Context Builder
 * Builds the context object that scripts receive for accessing metadata
 */

import type { ScriptExecutionContext, ScriptContextAPI } from "@shared/types/scripting";

/**
 * Build script context from execution context
 * Provides safe metadata access without exposing sensitive information
 */
export function buildScriptContext(executionContext: ScriptExecutionContext): ScriptContextAPI {
  return {
    workflow: {
      id: executionContext.workflowId,
    },
    run: {
      id: executionContext.runId,
    },
    phase: executionContext.phase,
    section: executionContext.sectionId
      ? {
          id: executionContext.sectionId,
        }
      : undefined,
    user: executionContext.userId
      ? {
          id: executionContext.userId,
        }
      : undefined,
    env: {

      NODE_ENV: process.env.NODE_ENV,

      BASE_URL: process.env.BASE_URL,
    },
    metadata: executionContext.metadata ?? {},
  };
}

/**
 * Create a minimal context for testing purposes
 */
export function createTestContext(overrides?: Partial<ScriptExecutionContext>): ScriptExecutionContext {
  return {
    workflowId: overrides?.workflowId ?? "test-workflow-id",
    runId: overrides?.runId ?? "test-run-id",
    phase: overrides?.phase ?? "test",
    sectionId: overrides?.sectionId,
    userId: overrides?.userId,
    metadata: overrides?.metadata ?? {},
  };
}
