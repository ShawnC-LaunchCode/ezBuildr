// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApiLogicRule, ApiSection, ApiStep } from "@/lib/vault-api";

const createdAt = "2026-08-08T00:00:00.000Z";

/**
 * A forward `skip_to` rule conditioned on a step referenced by **alias**
 * (`skip_ahead`), while its real database id is `step-a-trigger-uuid`. This
 * is the exact shape that makes AC2's "keyed by step id" requirement testable
 * at all: if the panel/hook ever keyed the simulator's `data` object by
 * alias instead, this fixture's condition would be permanently unresolvable
 * (`conditionEvaluator` fails safe on an unresolved operand) and the skip
 * would never fire no matter what answer was entered.
 */
const sections: ApiSection[] = [
  { id: "section-a", workflowId: "wf-1", title: "Section A", description: null, order: 0, createdAt },
  { id: "section-b", workflowId: "wf-1", title: "Section B", description: null, order: 1, createdAt },
  { id: "section-c", workflowId: "wf-1", title: "Section C", description: null, order: 2, createdAt },
];

const steps: ApiStep[] = [
  {
    id: "step-a-trigger-uuid",
    workflowId: "wf-1",
    sectionId: "section-a",
    type: "yes_no",
    title: "Skip ahead?",
    description: null,
    required: false,
    alias: "skip_ahead",
    order: 0,
    isVirtual: false,
    config: null,
    createdAt,
  },
];

const rules: ApiLogicRule[] = [
  {
    id: "rule-skip-forward",
    workflowId: "wf-1",
    conditionStepId: "step-a-trigger-uuid",
    when: {
      type: "group",
      id: "grp-1",
      operator: "AND",
      conditions: [
        { type: "condition", id: "cond-1", variable: "skip_ahead", operator: "is_true", value: true, valueType: "constant" },
      ],
    },
    targetType: "section",
    targetStepId: null,
    targetSectionId: "section-c",
    action: "skip_to",
    order: 1,
  },
];

vi.mock("@/hooks/api/useSections", () => ({
  useSections: () => ({ data: sections, isError: false }),
}));
vi.mock("@/hooks/api/useSteps", () => ({
  useWorkflowSteps: () => ({ data: steps, isError: false }),
}));
vi.mock("@/hooks/api/useLogicRules", () => ({
  useLogicRules: () => ({ data: rules, isError: false }),
}));

const simulateSpy = vi.hoisted(() => vi.fn());
vi.mock("@shared/workflowSimulation", async () => {
  const actual = await vi.importActual<typeof import("@shared/workflowSimulation")>("@shared/workflowSimulation");
  return {
    ...actual,
    simulateWorkflowPath: (...args: Parameters<typeof actual.simulateWorkflowPath>) => {
      simulateSpy(...args);
      return actual.simulateWorkflowPath(...args);
    },
  };
});

import { useWorkflowSimulation } from "@/components/builder/map/useWorkflowSimulation";

describe("useWorkflowSimulation (MAP-8 AC1/AC2)", () => {
  it("lists the step referenced by the rule's `when`, and no other step (AC1)", () => {
    const { result } = renderHook(() => useWorkflowSimulation("wf-1"));
    expect(result.current.fields.map((f) => f.step.id)).toEqual(["step-a-trigger-uuid"]);
  });

  it("passes the simulator a `data` object keyed by the step's real id, never its alias (AC2)", () => {
    const { result } = renderHook(() => useWorkflowSimulation("wf-1"));

    act(() => {
      result.current.setAnswer("step-a-trigger-uuid", true);
    });

    expect(simulateSpy).toHaveBeenCalled();
    const lastCall = simulateSpy.mock.calls[simulateSpy.mock.calls.length - 1][0];
    expect(lastCall.data).toEqual({ "step-a-trigger-uuid": true });
    expect(lastCall.data).not.toHaveProperty("skip_ahead");
  });

  it("resolves the alias-keyed condition correctly, proving the answer actually reaches the rule (not just the right shape)", () => {
    const { result } = renderHook(() => useWorkflowSimulation("wf-1"));

    // Before any answer: the skip condition is unmet, so the full path runs.
    expect(result.current.simulation?.visited).toEqual(["section-a", "section-b", "section-c"]);

    act(() => {
      result.current.setAnswer("step-a-trigger-uuid", true);
    });

    // After answering "yes" (keyed by id): the alias-referencing rule fires and section-b is skipped.
    expect(result.current.simulation?.visited).toEqual(["section-c"]);
    expect(result.current.simulation?.notVisited).toEqual(["section-a", "section-b"]);
  });

  it("resets to no answers and the full path when resetAnswers is called", () => {
    const { result } = renderHook(() => useWorkflowSimulation("wf-1"));

    act(() => {
      result.current.setAnswer("step-a-trigger-uuid", true);
    });
    expect(result.current.simulation?.visited).toEqual(["section-c"]);

    act(() => {
      result.current.resetAnswers();
    });

    expect(result.current.answers).toEqual({});
    expect(result.current.simulation?.visited).toEqual(["section-a", "section-b", "section-c"]);
  });
});
