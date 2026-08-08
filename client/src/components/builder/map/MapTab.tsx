/**
 * The Map tab (MAP-4 / GH-153 AC1): a read-only, auto-laid-out graph of a
 * workflow's sections, skip routes and final documents. Per D-4 this tab
 * never authors anything — no drag, no connect, no persisted position —
 * it composes `shared/workflowMap.ts` (MAP-2) with `@xyflow/react` (MAP-1)
 * and nothing else. Node-click-to-inspector (MAP-5) and lint-finding
 * overlays (MAP-6) land in later tickets on top of this component tree.
 */
import "@xyflow/react/dist/style.css";
import "./map.css";

import { Background, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { MapLegend } from "./MapLegend";
import { toFlowEdges, toFlowNodes } from "./toFlowElements";
import { workflowMapNodeTypes } from "./nodeTypes";
import { useWorkflowMapGraph } from "./useWorkflowMapGraph";

interface MapTabProps {
  workflowId: string | undefined;
}

export function MapTab({ workflowId }: MapTabProps) {
  const { graph, isLoading, isError } = useWorkflowMapGraph(workflowId);

  const nodes = useMemo(() => toFlowNodes(graph.nodes, graph.edges), [graph]);
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
