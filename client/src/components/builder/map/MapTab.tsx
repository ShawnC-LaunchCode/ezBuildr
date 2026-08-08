/**
 * The Map tab (MAP-4 / GH-153 AC1): a read-only, auto-laid-out graph of a
 * workflow's sections, skip routes and final documents. Per D-4 this tab
 * never authors anything — no drag, no connect, no persisted position —
 * it composes `shared/workflowMap.ts` (MAP-2) with `@xyflow/react` (MAP-1)
 * and nothing else. Node-click-to-inspector (MAP-5) is wired below, and
 * flow-diagnostic overlays (MAP-6) on top of that.
 *
 * MAP-5 / GH-153 AC2: activating a node navigates to
 * `/workflows/:id/builder?tab=sections&sectionId=<id>` (or `&stepId=<id>`
 * for a `final_documents` node) via wouter's `useLocation`, exactly as
 * `ReviewIssueList.tsx`'s `buildIssuePath` does for its own deep links.
 * `WorkflowBuilder.tsx` already reads those query params in a `useEffect`
 * and calls `selectSection`/`selectStep` itself — the map never calls the
 * builder store directly, so this survives a page reload or a shared URL.
 *
 * MAP-6 / GH-153 AC4 (second half): flow-diagnostic findings
 * (`useWorkflowLint`, the same shared hook the Review tab consumes) are
 * grouped by `target.sectionId` (`mapLintDecoration.ts`) and handed to each
 * node as `data.findings` — this component computes no diagnostics itself.
 */
import "@xyflow/react/dist/style.css";
import "./map.css";

import { Background, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";

import { Skeleton } from "@/components/ui/skeleton";
import { useWorkflowLint } from "@/hooks/api/useWorkflowLint";
import type { WorkflowMapNode } from "@shared/workflowMap";

import { MapFindingsSummary } from "./MapFindingsSummary";
import { MapLegend } from "./MapLegend";
import { decorateMapFindings, summarizeMapFindings } from "./mapLintDecoration";
import { toFlowEdges, toFlowNodes } from "./toFlowElements";
import { workflowMapNodeTypes } from "./nodeTypes";
import { useWorkflowMapGraph } from "./useWorkflowMapGraph";

interface MapTabProps {
  workflowId: string | undefined;
}

export function MapTab({ workflowId }: MapTabProps) {
  const { graph, isLoading, isError } = useWorkflowMapGraph(workflowId);
  const { data: lintIssues } = useWorkflowLint(workflowId);
  const [, navigate] = useLocation();

  const handleActivateNode = useCallback(
    (node: WorkflowMapNode) => {
      if (!workflowId) { return; }
      const params = new URLSearchParams({ tab: "sections" });
      if (node.kind === "final_documents") {
        params.set("stepId", node.id);
      } else {
        params.set("sectionId", node.id);
      }
      navigate(`/workflows/${workflowId}/builder?${params.toString()}`);
    },
    [navigate, workflowId]
  );

  const nodeIds = useMemo(() => new Set(graph.nodes.map((node) => node.id)), [graph]);
  const decoration = useMemo(
    () => decorateMapFindings(lintIssues ?? [], nodeIds),
    [lintIssues, nodeIds]
  );
  const findingsSummary = useMemo(() => summarizeMapFindings(decoration), [decoration]);

  const nodes = useMemo(
    () => toFlowNodes(graph.nodes, graph.edges, handleActivateNode, decoration.bySection),
    [graph, handleActivateNode, decoration]
  );
  const edges = useMemo(() => toFlowEdges(graph.edges), [graph]);

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
        Couldn&apos;t load the workflow map. Try reloading the page.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-8">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-16 w-64" />
      </div>
    );
  }

  return (
    <div className="workflow-map flex flex-1 flex-col overflow-hidden bg-background">
      <MapLegend />
      <MapFindingsSummary counts={findingsSummary} />
      <div className="relative flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowMapNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
