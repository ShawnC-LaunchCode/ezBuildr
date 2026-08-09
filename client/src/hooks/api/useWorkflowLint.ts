import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

/**
 * The single fetch of `GET /api/workflows/:id/lint` (MAP-6). Both the Review
 * tab's publish gate and the Map tab's flow-diagnostic overlay render the
 * same findings, so they share one query key and one cache entry rather than
 * each holding an independent copy that can drift — see D-3 in
 * `tickets/backlog/WORKFLOW_MAP.md`.
 *
 * The query key is unchanged from the inline `useQuery` this replaces
 * (`ReviewTab.tsx`, pre-MAP-6) so an in-flight cache entry survives the
 * extraction.
 */
export function useWorkflowLint(workflowId: string | undefined): UseQueryResult<WorkflowLintIssue[]> {
  return useQuery({
    queryKey: ["workflow", workflowId ?? "", "lint"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/workflows/${workflowId}/lint`);
      if (!res.ok) { throw new Error("Failed to lint workflow"); }
      return res.json() as Promise<WorkflowLintIssue[]>;
    },
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
