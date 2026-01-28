import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { variableAPI } from "../../lib/vault-api";
import { queryKeys } from "./queryKeys";

export function useWorkflowVariables(workflowId: string | undefined): UseQueryResult<unknown[]> {
    return useQuery({
        queryKey: queryKeys.variables(workflowId ?? ""),
        queryFn: () => variableAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}
