import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { variableAPI, type ApiWorkflowVariable } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useWorkflowVariables(workflowId: string | undefined): UseQueryResult<ApiWorkflowVariable[]> {
    return useQuery({
        queryKey: queryKeys.variables(workflowId ?? ""),
        queryFn: () => variableAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}
