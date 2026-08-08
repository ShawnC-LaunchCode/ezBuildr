// @vitest-environment jsdom
import type { ReactNode } from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapTab } from "@/components/builder/map/MapTab";
import type { MapFlowNode } from "@/components/builder/map/types";
import type { BuildWorkflowMapInput } from "@shared/workflowMap";

import {
  linearThreeSections,
  workflowWithBackwardSkip,
  workflowWithConditionalSection,
  workflowWithFinalDocuments,
  workflowWithForwardSkip,
} from "../../fixtures/workflowMap";

/**
 * MAP-4 AC9: covers AC2 (one node per section, in order, sequential edges),
 * AC3 (final_documents + exactly one terminal node, visually distinct),
 * AC4 (a skip rule renders as a visually distinct edge) and AC5 (a
 * conditional section is marked by more than color — asserted by text/role,
 * never by class name), plus AC6 (nothing draggable/connectable/focusable).
 *
 * `@xyflow/react`'s canvas (`ReactFlow`, `ReactFlowProvider`, `Background`,
 * `Controls`, `Handle`) is stubbed: jsdom never reports real element
 * dimensions (no layout engine), so the real library's `ResizeObserver`
 * path never measures nodes and keeps them permanently `visibility:
 * hidden` — a jsdom limitation, not something worth faking a layout engine
 * to work around. What belongs to *this* component is which node/edge data
 * gets built and which node component renders it, which the stub below
 * exercises for real by rendering `nodeTypes[node.type]` with genuine
 * `NodeProps` — so `SectionMapNode` / `FinalDocumentsMapNode` /
 * `TerminalMapNode` run unmodified. `Handle` is stubbed to `null` only
 * because it requires the real library's internal store context, which the
 * stub `ReactFlowProvider` below doesn't set up. `mapLayout.test.ts` and
 * `toFlowElements.test.ts` cover the pure node/edge-conversion logic (kind,
 * class, position) without any of this.
 */
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
    ReactFlow: (props: {
      nodes: StubFlowNode[];
      edges: StubFlowEdge[];
      nodesDraggable?: boolean;
      nodesConnectable?: boolean;
      edgesFocusable?: boolean;
      nodeTypes: StubNodeTypes;
    }) => (
      <div
        data-testid="react-flow-stub"
        data-nodes-draggable={String(props.nodesDraggable)}
        data-nodes-connectable={String(props.nodesConnectable)}
        data-edges-focusable={String(props.edgesFocusable)}
      >
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

const mockQueryData = vi.hoisted(() => ({
  sections: [] as BuildWorkflowMapInput["sections"],
  steps: [] as BuildWorkflowMapInput["steps"],
  rules: [] as BuildWorkflowMapInput["rules"],
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/api/useSections", () => ({
  useSections: () => ({ data: mockQueryData.isLoading ? undefined : mockQueryData.sections, isError: mockQueryData.isError }),
}));
vi.mock("@/hooks/api/useSteps", () => ({
  useWorkflowSteps: () => ({ data: mockQueryData.isLoading ? undefined : mockQueryData.steps, isError: mockQueryData.isError }),
}));
vi.mock("@/hooks/api/useLogicRules", () => ({
  useLogicRules: () => ({ data: mockQueryData.isLoading ? undefined : mockQueryData.rules, isError: mockQueryData.isError }),
}));

function mockGraphData(input: BuildWorkflowMapInput): void {
  mockQueryData.sections = input.sections;
  mockQueryData.steps = input.steps;
  mockQueryData.rules = input.rules;
  mockQueryData.isLoading = false;
  mockQueryData.isError = false;
}

afterEach(() => {
  cleanup();
});

describe("MapTab (MAP-4)", () => {
  it("renders one node per section, labelled with its title, in order, with sequential edges (AC2)", () => {
    mockGraphData(linearThreeSections());
    render(<MapTab workflowId="wf-1" />);

    const nodesContainer = screen.getByTestId("flow-nodes");
    const labels = within(nodesContainer)
      .getAllByText(/^Section [ABC]$|^Complete$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Section A", "Section B", "Section C", "Complete"]);

    // 2 section-to-section edges + 1 section-to-terminal edge, all sequential.
    const edges = screen.getAllByTestId(/^edge-sequential:/);
    expect(edges).toHaveLength(3);
    expect(screen.queryAllByTestId(/^edge-skip:/)).toHaveLength(0);
  });

  it("gives a final_documents step its own node in addition to its section, plus exactly one terminal node (AC3)", () => {
    mockGraphData(workflowWithFinalDocuments());
    render(<MapTab workflowId="wf-1" />);

    expect(screen.getByTestId("node-section-a")).toBeInTheDocument();
    expect(screen.getByTestId("node-step-doc")).toHaveAttribute("data-node-type", "final_documents");
    expect(screen.getByText("Generated Documents")).toBeInTheDocument();
    expect(screen.getByText("Final Documents")).toBeInTheDocument();

    // Exactly one terminal node, visually distinct (its own role/label).
    expect(screen.getAllByRole("img", { name: "Workflow complete" })).toHaveLength(1);
  });

  it("renders a forward skip_to rule as a visually distinct edge from the condition's section to the target (AC4)", () => {
    mockGraphData(workflowWithForwardSkip());
    render(<MapTab workflowId="wf-1" />);

    const skipEdge = screen.getByTestId("edge-skip:rule-skip-forward");
    expect(skipEdge).toHaveAttribute("data-source", "section-a");
    expect(skipEdge).toHaveAttribute("data-target", "section-c");
    // Distinct from a sequential edge by class (never color alone) and its own label.
    expect(skipEdge.className).not.toBe("");
    expect(skipEdge.className).not.toContain("sequential");
    expect(within(skipEdge).getByText("Skip")).toBeInTheDocument();
  });

  it("also draws a backward skip_to edge — MAP-2 draws the route; flow analysis (MAP-3) judges it, not this component", () => {
    mockGraphData(workflowWithBackwardSkip());
    render(<MapTab workflowId="wf-1" />);

    const skipEdge = screen.getByTestId("edge-skip:rule-skip-backward");
    expect(skipEdge).toHaveAttribute("data-source", "section-c");
    expect(skipEdge).toHaveAttribute("data-target", "section-a");
  });

  it("marks a conditional section by more than color — a labelled badge, found by text/role not class name (AC5)", () => {
    mockGraphData(workflowWithConditionalSection());
    render(<MapTab workflowId="wf-1" />);

    const conditionalNode = screen.getByTestId("node-section-a");
    expect(within(conditionalNode).getByText("Conditional")).toBeInTheDocument();
    expect(within(conditionalNode).getByRole("group", { name: /conditional section/i })).toBeInTheDocument();

    const plainNode = screen.getByTestId("node-section-b");
    expect(within(plainNode).queryByText("Conditional")).not.toBeInTheDocument();
    expect(within(plainNode).getByRole("group", { name: "Section B — section" })).toBeInTheDocument();
  });

  it("passes read-only flags through to ReactFlow — nothing draggable, connectable or focusable (AC6)", () => {
    mockGraphData(linearThreeSections());
    render(<MapTab workflowId="wf-1" />);

    const stub = screen.getByTestId("react-flow-stub");
    expect(stub).toHaveAttribute("data-nodes-draggable", "false");
    expect(stub).toHaveAttribute("data-nodes-connectable", "false");
    expect(stub).toHaveAttribute("data-edges-focusable", "false");
  });

  it("renders a loading state before all three queries have data, and never throws on an empty graph", () => {
    mockQueryData.sections = [];
    mockQueryData.steps = [];
    mockQueryData.rules = [];
    mockQueryData.isLoading = true;
    mockQueryData.isError = false;

    render(<MapTab workflowId="wf-1" />);
    expect(screen.queryByTestId("react-flow-stub")).not.toBeInTheDocument();
  });
});
