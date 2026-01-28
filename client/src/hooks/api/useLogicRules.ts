import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { logicRuleAPI } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useLogicRules(workflowId: string | undefined): UseQueryResult<unknown[]> {
    return useQuery({
        queryKey: queryKeys.logicRules(workflowId ?? ""),
        queryFn: () => logicRuleAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}
