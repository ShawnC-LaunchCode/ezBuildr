// @vitest-environment jsdom
import type { ReactNode } from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapTab } from "@/components/builder/map/MapTab";
import type { MapFlowNode } from "@/components/builder/map/types";
import type { BuildWorkflowMapInput } from "@shared/workflowMap";
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

import {
  linearThreePages,
  workflowWithBackwardSkip,
  workflowWithConditionalPage,
  workflowWithFinalDocuments,
  workflowWithForwardSkip,
  workflowWithUnreachablePage,
} from "../../fixtures/workflowMap";

/**
 * MAP-5: navigation must go through a URL (`wouter`'s `useLocation`), never
 * the builder store — `grep -rn "useWorkflowBuilder"
 * client/src/components/builder/map/` returns nothing, and this mock makes
 * that the only path a test can observe. `navigateMock` records the exact
 * string `MapTab` pushes, so assertions below check the resulting URL
 * rather than a store call (MAP-5 AC6).
 */
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({
  useLocation: () => ["/workflows/wf-1/builder", navigateMock],
}));

/**
 * MAP-4 AC9: covers AC2 (one node per page, in order, sequential edges),
 * AC3 (final_documents + exactly one terminal node, visually distinct),
 * AC4 (a skip rule renders as a visually distinct edge) and AC5 (a
 * conditional page is marked by more than color — asserted by text/role,
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
 * `NodeProps` — so `PageMapNode` / `FinalDocumentsMapNode` /
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
  pages: [] as BuildWorkflowMapInput["pages"],
  steps: [] as BuildWorkflowMapInput["steps"],
  rules: [] as BuildWorkflowMapInput["rules"],
  isLoading: false,
  isError: false,
}));

/** MAP-6: the map's own findings state, independent of the graph-query mocks above. */
const mockLintData = vi.hoisted(() => ({
  issues: [] as WorkflowLintIssue[],
}));

vi.mock("@/hooks/api/usePages", () => ({
  usePages: () => ({ data: mockQueryData.isLoading ? undefined : mockQueryData.pages, isError: mockQueryData.isError }),
}));
vi.mock("@/hooks/api/useSections", () => ({
  useSections: () => ({ data: mockQueryData.isLoading ? undefined : [], isError: mockQueryData.isError }),
}));
vi.mock("@/hooks/api/useSteps", () => ({
  useWorkflowSteps: () => ({ data: mockQueryData.isLoading ? undefined : mockQueryData.steps, isError: mockQueryData.isError }),
}));
vi.mock("@/hooks/api/useLogicRules", () => ({
  useLogicRules: () => ({ data: mockQueryData.isLoading ? undefined : mockQueryData.rules, isError: mockQueryData.isError }),
}));
vi.mock("@/hooks/api/useWorkflowLint", () => ({
  useWorkflowLint: () => ({ data: mockLintData.issues, isError: false, isLoading: false }),
}));

function mockGraphData(input: BuildWorkflowMapInput): void {
  mockQueryData.pages = input.pages;
  mockQueryData.steps = input.steps;
  mockQueryData.rules = input.rules;
  mockQueryData.isLoading = false;
  mockQueryData.isError = false;
}

afterEach(() => {
  cleanup();
  navigateMock.mockClear();
  mockLintData.issues = [];
});

describe("MapTab (MAP-4)", () => {
  it("renders one node per page, labelled with its title, in order, with sequential edges (AC2)", () => {
    mockGraphData(linearThreePages());
    render(<MapTab workflowId="wf-1" />);

    const nodesContainer = screen.getByTestId("flow-nodes");
    const labels = within(nodesContainer)
      .getAllByText(/^Page [ABC]$|^Complete$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Page A", "Page B", "Page C", "Complete"]);

    // 2 page-to-page edges + 1 page-to-terminal edge, all sequential.
    const edges = screen.getAllByTestId(/^edge-sequential:/);
    expect(edges).toHaveLength(3);
    expect(screen.queryAllByTestId(/^edge-skip:/)).toHaveLength(0);
  });

  it("gives a final_documents step its own node in addition to its page, plus exactly one terminal node (AC3)", () => {
    mockGraphData(workflowWithFinalDocuments());
    render(<MapTab workflowId="wf-1" />);

    expect(screen.getByTestId("node-page-a")).toBeInTheDocument();
    expect(screen.getByTestId("node-step-doc")).toHaveAttribute("data-node-type", "final_documents");
    expect(screen.getByText("Generated Documents")).toBeInTheDocument();
    expect(screen.getByText("Final Documents")).toBeInTheDocument();

    // Exactly one terminal node, visually distinct (its own role/label).
    expect(screen.getAllByRole("img", { name: "Workflow complete" })).toHaveLength(1);
  });

  it("renders a forward skip_to rule as a visually distinct edge from the condition's page to the target (AC4)", () => {
    mockGraphData(workflowWithForwardSkip());
    render(<MapTab workflowId="wf-1" />);

    const skipEdge = screen.getByTestId("edge-skip:rule-skip-forward");
    expect(skipEdge).toHaveAttribute("data-source", "page-a");
    expect(skipEdge).toHaveAttribute("data-target", "page-c");
    // Distinct from a sequential edge by class (never color alone) and its own label.
    expect(skipEdge.className).not.toBe("");
    expect(skipEdge.className).not.toContain("sequential");
    expect(within(skipEdge).getByText("Skip")).toBeInTheDocument();
  });

  it("also draws a backward skip_to edge — MAP-2 draws the route; flow analysis (MAP-3) judges it, not this component", () => {
    mockGraphData(workflowWithBackwardSkip());
    render(<MapTab workflowId="wf-1" />);

    const skipEdge = screen.getByTestId("edge-skip:rule-skip-backward");
    expect(skipEdge).toHaveAttribute("data-source", "page-c");
    expect(skipEdge).toHaveAttribute("data-target", "page-a");
  });

  it("marks a conditional page by more than color — a labelled badge, found by text/role not class name (AC5)", () => {
    mockGraphData(workflowWithConditionalPage());
    render(<MapTab workflowId="wf-1" />);

    const conditionalNode = screen.getByTestId("node-page-a");
    expect(within(conditionalNode).getByText("Conditional")).toBeInTheDocument();
    expect(within(conditionalNode).getByRole("group", { name: /conditional page/i })).toBeInTheDocument();

    const plainNode = screen.getByTestId("node-page-b");
    expect(within(plainNode).queryByText("Conditional")).not.toBeInTheDocument();
    expect(within(plainNode).getByRole("group", { name: "Page B — page" })).toBeInTheDocument();
  });

  it("passes read-only flags through to ReactFlow — nothing draggable, connectable or focusable (AC6)", () => {
    mockGraphData(linearThreePages());
    render(<MapTab workflowId="wf-1" />);

    const stub = screen.getByTestId("react-flow-stub");
    expect(stub).toHaveAttribute("data-nodes-draggable", "false");
    expect(stub).toHaveAttribute("data-nodes-connectable", "false");
    expect(stub).toHaveAttribute("data-edges-focusable", "false");
  });

  it("renders a loading state before all three queries have data, and never throws on an empty graph", () => {
    mockQueryData.pages = [];
    mockQueryData.steps = [];
    mockQueryData.rules = [];
    mockQueryData.isLoading = true;
    mockQueryData.isError = false;

    render(<MapTab workflowId="wf-1" />);
    expect(screen.queryByTestId("react-flow-stub")).not.toBeInTheDocument();
  });
});

/**
 * MAP-5 (GH-153 AC2): node-click-to-inspector. `ReactFlow` is stubbed above
 * exactly as MAP-4 left it — the real `PageMapNode` / `FinalDocumentsMapNode`
 * / `TerminalMapNode` render for real inside it, so these exercise the actual
 * `<button>`, its `onClick`/keyboard handling and `MapTab`'s
 * `handleActivateNode`, not a mock of them.
 */
describe("MapTab node activation (MAP-5)", () => {
  it("navigates to the page's inspector via a URL on click (AC1)", async () => {
    const user = userEvent.setup();
    mockGraphData(linearThreePages());
    render(<MapTab workflowId="wf-1" />);

    await user.click(screen.getByRole("button", { name: "Open Page B page" }));

    expect(navigateMock).toHaveBeenCalledWith(
      "/workflows/wf-1/builder?tab=pages&pageId=page-b"
    );
  });

  it("navigates with the step's id, not the page's, when activating a final_documents node (AC2)", async () => {
    const user = userEvent.setup();
    mockGraphData(workflowWithFinalDocuments());
    render(<MapTab workflowId="wf-1" />);

    await user.click(
      screen.getByRole("button", { name: "Open Generated Documents final documents" })
    );

    expect(navigateMock).toHaveBeenCalledWith(
      "/workflows/wf-1/builder?tab=pages&stepId=step-doc"
    );
  });

  it("does not make the terminal node activatable — no button or link role (AC3)", () => {
    mockGraphData(linearThreePages());
    render(<MapTab workflowId="wf-1" />);

    const terminalNode = screen.getByTestId("node-__complete__");
    expect(within(terminalNode).queryByRole("button")).not.toBeInTheDocument();
    expect(within(terminalNode).queryByRole("link")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("is reachable by Tab, names its page, and activates on both Enter and Space (AC4)", async () => {
    const user = userEvent.setup();
    mockGraphData(linearThreePages());
    render(<MapTab workflowId="wf-1" />);

    const button = screen.getByRole("button", { name: /Page A/i });
    button.focus();
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(navigateMock).toHaveBeenCalledWith(
      "/workflows/wf-1/builder?tab=pages&pageId=page-a"
    );

    navigateMock.mockClear();
    await user.keyboard(" ");
    expect(navigateMock).toHaveBeenCalledWith(
      "/workflows/wf-1/builder?tab=pages&pageId=page-a"
    );
  });
});

/**
 * MAP-6 (GH-153 AC4, second half): flow-diagnostic overlays. `useWorkflowLint`
 * is mocked above (`mockLintData`) — these tests only exercise how `MapTab`
 * groups and renders findings the server already computed; per the ticket's
 * own warning, `analyzeWorkflowFlow` must never run client-side, so nothing
 * here calls it.
 */
describe("MapTab flow diagnostics (MAP-6)", () => {
  const unreachableError: WorkflowLintIssue = {
    type: "error",
    category: "logic",
    message: "Page B is unreachable: nothing on the published path leads to it.",
    target: { tab: "map", pageId: "page-b" },
  };

  const backwardSkipWarning: WorkflowLintIssue = {
    type: "warning",
    category: "logic",
    message: "This rule can never fire; a page reorder likely broke it.",
    target: { tab: "map", pageId: "page-c" },
  };

  it("flags an unreachable page as a blocking error, with its message reachable by hover (AC3)", async () => {
    const user = userEvent.setup();
    mockGraphData(workflowWithUnreachablePage());
    mockLintData.issues = [unreachableError];
    render(<MapTab workflowId="wf-1" />);

    const badge = screen.getByRole("button", { name: /Page B: 1 error, 0 warnings/i });
    await user.hover(badge);
    // `role="tooltip"` is the one accessibly-connected node (Radix also
    // renders a duplicate for touch/no-hover fallback, so a plain text query
    // would match twice) — asserting on it proves both that it's open AND
    // that `aria-describedby` on the trigger actually resolves to real content.
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Blocking error");
    expect(tooltip).toHaveTextContent(unreachableError.message);
  });

  it("flags an unreachable page as a blocking error, with its message reachable by keyboard focus (AC3)", async () => {
    mockGraphData(workflowWithUnreachablePage());
    mockLintData.issues = [unreachableError];
    render(<MapTab workflowId="wf-1" />);

    const badge = screen.getByRole("button", { name: /Page B: 1 error, 0 warnings/i });
    badge.focus();
    expect(badge).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(unreachableError.message);
  });

  it("renders a backward-skip warning as visually distinct from an error — different icon, label and tooltip heading, not colour alone (AC4)", async () => {
    const user = userEvent.setup();
    mockGraphData(linearThreePages());
    mockLintData.issues = [unreachableError, backwardSkipWarning];
    render(<MapTab workflowId="wf-1" />);

    const errorBadge = screen.getByRole("button", { name: /Page B: 1 error, 0 warnings/i });
    const warningBadge = screen.getByRole("button", { name: /Page C: 0 errors, 1 warning/i });

    // Distinct styling (never colour alone — className carries the distinct token pair, not just a hue).
    expect(errorBadge.className).not.toBe(warningBadge.className);
    // Distinct icons.
    expect(errorBadge.querySelector("svg")?.outerHTML).not.toBe(warningBadge.querySelector("svg")?.outerHTML);

    await user.hover(warningBadge);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Warning");
    expect(tooltip).not.toHaveTextContent("Blocking error");
  });

  it("counts a finding whose target.pageId matches no node in a visible summary, rather than dropping it (AC5)", () => {
    const danglingWarning: WorkflowLintIssue = {
      type: "warning",
      category: "logic",
      message: "Stale reference to a page that no longer exists.",
      target: { tab: "map", pageId: "page-ghost" },
    };
    mockGraphData(linearThreePages());
    mockLintData.issues = [danglingWarning];
    render(<MapTab workflowId="wf-1" />);

    expect(screen.getByText(/1 finding isn't shown on the map/i)).toBeInTheDocument();
    // It never silently attaches to some other node either.
    expect(screen.queryByText(danglingWarning.message)).not.toBeInTheDocument();
  });

  it("renders no findings summary and no node badges on a clean workflow", () => {
    mockGraphData(linearThreePages());
    mockLintData.issues = [];
    render(<MapTab workflowId="wf-1" />);

    expect(screen.queryByLabelText("Map findings summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /error|warning/i })).not.toBeInTheDocument();
  });
});
