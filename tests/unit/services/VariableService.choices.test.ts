import { describe, it, expect, vi, beforeEach } from "vitest";

import { VariableService } from "../../../server/services/VariableService";

/**
 * O-2: `listVariables` now carries each variable's selectable options.
 *
 * The condition editor used to fetch every step separately just to read
 * `config.options` off legacy radio/multiple_choice steps, purely so its
 * value dropdown could offer real choices. Serving them with the variable
 * deleted that second query and the client-side extraction helper.
 *
 * These pin the contract the client now depends on: options for the types
 * that have them, and the field absent — not an empty array — for the types
 * that never do, so `choices` staying undefined remains meaningful.
 */

const { sectionRepoMock, stepRepoMock, verifyAccessMock } = vi.hoisted(() => ({
  sectionRepoMock: { findByWorkflowId: vi.fn() },
  stepRepoMock: { findBySectionIds: vi.fn() },
  verifyAccessMock: vi.fn(),
}));

vi.mock("../../../server/repositories", () => ({
  sectionRepository: sectionRepoMock,
  stepRepository: stepRepoMock,
}));

vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: { verifyAccess: verifyAccessMock },
}));


// RLS-4 precondition 5: `listVariables` now opens a tenant-scoped transaction
// via `withCurrentTenant` when no `tx` is supplied, which needs a real DB
// (unavailable in unit-fast). Passing a fake `tx` takes the reuse branch
// instead — `sectionRepoMock`/`stepRepoMock`/`verifyAccessMock` don't
// inspect it, so any object works.
const fakeTx = {} as never;

const SECTION = { id: "sec-1", title: "Page 1" };

function step(overrides: Record<string, unknown>) {
  return {
    id: "step-x",
    sectionId: "sec-1",
    alias: "alias_x",
    title: "Question",
    type: "short_text",
    config: null,
    ...overrides,
  };
}

describe("VariableService.listVariables — choices (O-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessMock.mockResolvedValue({ id: "wf-1" });
    sectionRepoMock.findByWorkflowId.mockResolvedValue([SECTION]);
  });

  it("carries options for a legacy radio step, resolving alias/id the way stored answers do", async () => {
    stepRepoMock.findBySectionIds.mockResolvedValue([
      step({
        id: "s1",
        type: "radio",
        alias: "plan",
        config: { options: [{ id: "o1", label: "Basic", alias: "basic" }, "Pro"] },
      }),
    ]);

    const [variable] = await new VariableService().listVariables("wf-1", "user-1", fakeTx);

    expect(variable.choices).toEqual([
      { value: "basic", label: "Basic" },
      { value: "Pro", label: "Pro" },
    ]);
  });

  it("carries options for multiple_choice too", async () => {
    stepRepoMock.findBySectionIds.mockResolvedValue([
      step({ id: "s2", type: "multiple_choice", config: { options: ["A", "B"] } }),
    ]);

    const [variable] = await new VariableService().listVariables("wf-1", "user-1", fakeTx);
    expect(variable.choices).toHaveLength(2);
  });

  it("omits `choices` entirely for a step type that never has options", async () => {
    stepRepoMock.findBySectionIds.mockResolvedValue([step({ id: "s3", type: "short_text" })]);

    const [variable] = await new VariableService().listVariables("wf-1", "user-1", fakeTx);
    expect(variable).not.toHaveProperty("choices");
  });

  it("omits `choices` for a choice step whose config carries no options", async () => {
    stepRepoMock.findBySectionIds.mockResolvedValue([
      step({ id: "s4", type: "radio", config: {} }),
    ]);

    const [variable] = await new VariableService().listVariables("wf-1", "user-1", fakeTx);
    expect(variable).not.toHaveProperty("choices");
  });
});
