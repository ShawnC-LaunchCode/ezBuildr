import { beforeEach, describe, expect, it, vi } from "vitest";

const serializeWorkflow = vi.fn();

vi.mock("../../../server/services/VersionService", () => ({
  versionService: { serializeWorkflow },
}));

/** Minimal WorkflowContentData-shaped fixture the lint service consumes. */
function content(overrides: Record<string, unknown> = {}) {
  return {
    title: "WF",
    sections: [
      {
        id: "s1",
        title: "Page 1",
        steps: [{ id: "st1", title: "Name", alias: "name" }],
      },
    ],
    logicRules: [],
    transformBlocks: [],
    lifecycleHooks: [],
    documentHooks: [],
    ...overrides,
  };
}

describe("WorkflowLintService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function lint(data: Record<string, unknown>) {
    serializeWorkflow.mockResolvedValue(data);
    const { WorkflowLintService } = await import("../../../server/services/WorkflowLintService");
    return new WorkflowLintService().lint("wf-1", "user-1");
  }

  it("errors when the workflow has no sections", async () => {
    const results = await lint(content({ sections: [] }));
    expect(results.some(r => r.type === "error" && /at least one section/i.test(r.message))).toBe(true);
  });

  it("errors when sections exist but contain no questions", async () => {
    const results = await lint(content({
      sections: [{ id: "s1", title: "Empty page", steps: [] }],
    }));
    expect(results.some(r => r.type === "error" && /at least one question/i.test(r.message))).toBe(true);
  });

  it("errors on a logic rule referencing an unknown alias", async () => {
    const results = await lint(content({
      logicRules: [{ conditionStepAlias: "ghost", targetAlias: "name", operator: "equals", targetType: "step" }],
    }));
    const err = results.find(r => r.type === "error" && r.message.includes("ghost"));
    expect(err).toBeDefined();
  });

  it("warns — without throwing — on an object-shaped visibleIf referencing an unknown alias", async () => {
    // visibleIf is persisted as a ConditionExpression object (jsonb), not a string.
    // The service must walk it, not call String.match on it (regression guard).
    const results = await lint(content({
      sections: [{
        id: "s1",
        title: "Page 1",
        steps: [{
          id: "st1",
          title: "Details",
          alias: "details",
          visibleIf: {
            type: "group",
            operator: "AND",
            conditions: [{ type: "condition", variable: "missing_alias", operator: "is_true" }],
          },
        }],
      }],
    }));
    const warn = results.find(r => r.type === "warning" && r.message.includes("missing_alias"));
    expect(warn).toBeDefined();
  });

  it("does not flag a visibleIf that references a real alias", async () => {
    const results = await lint(content({
      sections: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "st1", title: "Has pet?", alias: "has_pet" },
          {
            id: "st2",
            title: "Pet name",
            alias: "pet_name",
            visibleIf: {
              type: "group",
              operator: "AND",
              conditions: [{ type: "condition", variable: "has_pet", operator: "is_true" }],
            },
          },
        ],
      }],
    }));
    expect(results.some(r => r.message.includes("has_pet") && r.type === "warning")).toBe(false);
  });

  it("warns on a step with no alias", async () => {
    const results = await lint(content({
      sections: [{ id: "s1", title: "Page 1", steps: [{ id: "st1", title: "Unnamed" }] }],
    }));
    expect(results.some(r => r.type === "warning" && /no alias/i.test(r.message))).toBe(true);
  });

  it("returns no errors for a clean, well-formed workflow", async () => {
    const results = await lint(content({
      logicRules: [{ conditionStepAlias: "name", targetAlias: "name", operator: "is_not_empty", targetType: "step" }],
    }));
    expect(results.filter(r => r.type === "error")).toHaveLength(0);
  });
});
