import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { variableAPI, type ApiWorkflowVariable } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useWorkflowVariables(
    workflowId: string | undefined,
    options?: { enabled?: boolean }
): UseQueryResult<ApiWorkflowVariable[]> {
    return useQuery({
        queryKey: queryKeys.variables(workflowId ?? ""),
        queryFn: () => variableAPI.list(workflowId ?? ""),
        enabled: (options?.enabled ?? true) && !!workflowId && workflowId !== "undefined",
    });
}
