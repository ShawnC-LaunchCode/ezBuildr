// @vitest-environment jsdom
import type { ReactNode } from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MapTab } from "@/components/builder/map/MapTab";
import type { MapFlowNode } from "@/components/builder/map/types";
import type { ApiLogicRule, ApiPage, ApiStep } from "@/lib/vault-api";

/**
 * MAP-8's own fixture, not `tests/fixtures/workflowMap.ts` — that file's
 * `WorkflowMapRuleInput` has no `when` field at all (`buildWorkflowMap` never
 * reads one), so a rule built from it evaluates as "always fires" once fed
 * through the real simulator (`evaluateConditionExpression`'s `!expression`
 * branch). This fixture mirrors `workflowWithForwardSkip`'s shape but adds a
 * genuine `when`, so the skip only fires once the respondent's answer says
 * so — exactly the same "add a real `when` locally" pattern MAP-7's own test
 * file used for the identical reason.
 */
const createdAt = "2026-08-08T00:00:00.000Z";

const pages: ApiPage[] = [
  { id: "page-a", workflowId: "wf-1", title: "Page A", description: null, order: 0, createdAt },
  { id: "page-b", workflowId: "wf-1", title: "Page B", description: null, order: 1, createdAt },
  { id: "page-c", workflowId: "wf-1", title: "Page C", description: null, order: 2, createdAt },
];

const steps: ApiStep[] = [
  {
    id: "step-a-trigger",
    workflowId: "wf-1",
    pageId: "page-a",
    type: "yes_no",
    title: "Skip ahead?",
    description: null,
    required: false,
    alias: null,
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
    conditionStepId: "step-a-trigger",
    when: {
      type: "group",
      id: "grp-1",
      operator: "AND",
      conditions: [
        { type: "condition", id: "cond-1", variable: "step-a-trigger", operator: "is_true", value: true, valueType: "constant" },
      ],
    },
    targetType: "page",
    targetStepId: null,
    targetPageId: "page-c",
    action: "skip_to",
    order: 1,
  },
];

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({
  useLocation: () => ["/workflows/wf-1/builder", navigateMock],
}));

interface StubFlowNode {
  id: string;
  type: string;
  data: MapFlowNode["data"];
}
interface StubFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  className?: string;
}
interface StubNodeComponentProps {
  id: string;
  data: MapFlowNode["data"];
  type: string;
  dragging: boolean;
  zIndex: number;
  selectable: boolean;
  deletable: boolean;
  draggable: boolean;
  selected: boolean;
}
type StubNodeTypes = Record<string, (props: StubNodeComponentProps) => JSX.Element>;

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    ReactFlow: (props: { nodes: StubFlowNode[]; edges: StubFlowEdge[]; nodeTypes: StubNodeTypes }) => (
      <div data-testid="react-flow-stub">
        <div data-testid="flow-nodes">
          {props.nodes.map((node) => {
            const NodeComponent = props.nodeTypes[node.type];
            return (
              <div data-testid={`node-${node.id}`} data-node-type={node.type} key={node.id}>
                <NodeComponent
                  id={node.id}
                  data={node.data}
                  type={node.type}
                  dragging={false}
                  zIndex={0}
                  selectable={false}
                  deletable={false}
                  draggable={false}
                  selected={false}
                />
              </div>
            );
          })}
        </div>
        <div data-testid="flow-edges">
          {props.edges.map((edge) => (
            <div
              data-testid={`edge-${edge.id}`}
              data-source={edge.source}
              data-target={edge.target}
              className={edge.className}
              key={edge.id}
            >
              {edge.label}
            </div>
          ))}
        </div>
      </div>
    ),
  };
});

vi.mock("@/hooks/api/usePages", () => ({
  usePages: () => ({ data: pages, isError: false }),
}));
vi.mock("@/hooks/api/useSteps", () => ({
  useWorkflowSteps: () => ({ data: steps, isError: false }),
}));
vi.mock("@/hooks/api/useLogicRules", () => ({
  useLogicRules: () => ({ data: rules, isError: false }),
}));
vi.mock("@/hooks/api/useWorkflowLint", () => ({
  useWorkflowLint: () => ({ data: [], isError: false, isLoading: false }),
}));

beforeAll(() => {
  // jsdom doesn't implement these — Radix Select's pointer interactions need
  // them. Same polyfill as `tests/unit/client/logic/ConditionValueInput.test.tsx`.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
});

describe("MapTab simulation panel (MAP-8)", () => {
  it("shows one answer field for the step the skip rule's `when` references, and nothing else (AC1)", () => {
    render(<MapTab workflowId="wf-1" />);
    expect(screen.getByRole("group", { name: "Skip ahead?" })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /Skip ahead\?/ })).toHaveLength(1);
  });

  it("renders every node as normal (no dim/highlight classes) before any answer is entered — the skip hasn't fired yet", () => {
    render(<MapTab workflowId="wf-1" />);
    const pageB = screen.getByTestId("node-page-b");
    const group = within(pageB).getByRole("group");
    expect(group.className).not.toContain("workflow-map-node-dimmed");
    expect(group.className).not.toContain("workflow-map-node-onpath");
  });

  it("dims the skipped page and highlights the skip edge once the triggering answer is entered (AC3/AC4)", async () => {
    const user = userEvent.setup();
    render(<MapTab workflowId="wf-1" />);

    // The yes_no field renders as a choices Select (AC7 — ConditionValueInput, no bespoke boolean input).
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Yes" }));

    const pageB = await screen.findByTestId("node-page-b");
    const dimmedGroup = within(pageB).getByRole("group");
    expect(dimmedGroup.className).toContain("workflow-map-node-dimmed");
    expect(within(pageB).getByText(/not on the currently simulated path/i)).toBeInTheDocument();

    const pageA = screen.getByTestId("node-page-a");
    expect(within(pageA).getByRole("group").className).toContain("workflow-map-node-onpath");

    const skipEdge = screen.getByTestId("edge-skip:rule-skip-forward");
    expect(skipEdge.className).toContain("workflow-map-edge-onpath");
    const sequentialAB = screen.getByTestId("edge-sequential:page-a->page-b");
    expect(sequentialAB.className).toContain("workflow-map-edge-dimmed");
  });

  it("leaves an unrelated existing test's exact accessible name untouched even while a simulation is dimming that same node", async () => {
    const user = userEvent.setup();
    render(<MapTab workflowId="wf-1" />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Yes" }));

    // aria-label must stay exactly "Page B — page" — MAP-4's own test
    // asserts this exact string elsewhere; simulation state must never leak
    // into it (see simulationStyles.ts's doc comment).
    await screen.findByText(/not on the currently simulated path/i);
    expect(screen.getByRole("group", { name: "Page B — page" })).toBeInTheDocument();
  });
});
