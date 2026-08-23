/**
 * Assembles the workflow map's graph from the same TanStack Query hooks the
 * rest of the builder already uses (MAP-4) — no new API endpoint needed.
 *
 * `ApiPage`, `ApiStep` and `ApiLogicRule` (client/src/lib/vault-api.ts)
 * are structural supersets of `buildWorkflowMap`'s input types
 * (`shared/workflowMap.ts`), so they're passed straight in with no adapter
 * and no cast — the same "no adapter needed" relationship MAP-3 has with
 * MAP-2's output.
 *
 * The resulting graph is held in this hook's own `useMemo`, never in the
 * zustand builder store — CLAUDE.md convention 8 reserves that store for
 * ephemeral UI state, and this is server data already owned by the three
 * query hooks below.
 */
import { useMemo } from "react";

import { useLogicRules } from "@/hooks/api/useLogicRules";
import { usePages } from "@/hooks/api/usePages";
import { useWorkflowSteps } from "@/hooks/api/useSteps";
import { buildWorkflowMap, type WorkflowMapGraph } from "@shared/workflowMap";

const EMPTY_GRAPH: WorkflowMapGraph = { nodes: [], edges: [] };

export interface UseWorkflowMapGraphResult {
  graph: WorkflowMapGraph;
  /** True until pages, steps and rules have all loaded at least once. */
  isLoading: boolean;
  isError: boolean;
}

export function useWorkflowMapGraph(workflowId: string | undefined): UseWorkflowMapGraphResult {
  const pagesQuery = usePages(workflowId);
  const stepsQuery = useWorkflowSteps(workflowId);
  const rulesQuery = useLogicRules(workflowId);

  const pages = pagesQuery.data;
  const steps = stepsQuery.data;
  const rules = rulesQuery.data;

  const graph = useMemo<WorkflowMapGraph>(() => {
    if (!pages || !steps || !rules) {
      return EMPTY_GRAPH;
    }
    return buildWorkflowMap({ pages, steps, rules });
  }, [pages, steps, rules]);

  return {
    graph,
    isLoading: !pages || !steps || !rules,
    isError: pagesQuery.isError || stepsQuery.isError || rulesQuery.isError,
  };
}
