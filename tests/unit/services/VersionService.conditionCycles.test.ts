import { describe, it, expect } from "vitest";

import { versionService } from "../../../server/services/VersionService";
import type { WorkflowGraph } from "../../../shared/zod-schemas.js";

/**
 * `versionService.validateWorkflow` is the exact synchronous core of the
 * publish gate — `publishVersion` (server/services/VersionService.ts) calls
 * the async `lintSerializedWorkflow`/`summarizeLintResults` pair built from
 * the same `lintWorkflowContent` results and throws when `valid` is false
 * unless the caller passes `force`. Exercising `validateWorkflow` directly
 * proves the gate blocks without needing to stand up ACL/DB mocks for the
 * full `publishVersion` call.
 */
function graphWithVisibleIfCycle(): WorkflowGraph {
  const raw = {
    id: "00000000-0000-0000-0000-000000000001",
    title: "WF",
    pages: [{
      id: "00000000-0000-0000-0000-000000000002",
      title: "Page 1",
      steps: [
        {
          id: "00000000-0000-0000-0000-000000000003",
          title: "A",
          alias: "a",
          type: "short_text",
          visibleIf: {
            type: "group",
            operator: "AND",
            conditions: [{ type: "condition", variable: "b", operator: "is_true" }],
          },
        },
        {
          id: "00000000-0000-0000-0000-000000000004",
          title: "B",
          alias: "b",
          type: "short_text",
          visibleIf: {
            type: "group",
            operator: "AND",
            conditions: [{ type: "condition", variable: "a", operator: "is_true" }],
          },
        },
      ],
    }],
    logicRules: [],
    transformBlocks: [],
    lifecycleHooks: [],
    documentHooks: [],
  };
  return raw as unknown as WorkflowGraph;
}

describe("VersionService.validateWorkflow — LU-3 publish gate blocks on a visibleIf cycle", () => {
  it("marks a workflow with a circular visibleIf reference invalid, with a circular-reference error", () => {
    const result = versionService.validateWorkflow("wf-1", graphWithVisibleIfCycle());
    expect(result.valid).toBe(false);
    expect(result.errors.some((message) => /circular|cycle/i.test(message))).toBe(true);
  });
});
