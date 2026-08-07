import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { logicRuleAPI, type ApiLogicRule, type LogicRuleInput } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useLogicRules(workflowId: string | undefined): UseQueryResult<ApiLogicRule[]> {
    return useQuery({
        queryKey: queryKeys.logicRules(workflowId ?? ""),
        queryFn: () => logicRuleAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useCreateLogicRule(): UseMutationResult<ApiLogicRule, unknown, { workflowId: string } & LogicRuleInput> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to create rule." },
        mutationFn: ({ workflowId, ...data }: { workflowId: string } & LogicRuleInput) =>
            logicRuleAPI.create(workflowId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useUpdateLogicRule(): UseMutationResult<ApiLogicRule, unknown, { id: string; workflowId: string } & Partial<LogicRuleInput>> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to save rule. Change has been reverted." },
        mutationFn: ({ id, workflowId, ...data }: { id: string; workflowId: string } & Partial<LogicRuleInput>) =>
            logicRuleAPI.update(workflowId, id, data),
        onMutate: async (variables) => {
            const { id, workflowId, ...data } = variables;
            await queryClient.cancelQueries({ queryKey: queryKeys.logicRules(workflowId) });
            const previousRules = queryClient.getQueryData<ApiLogicRule[]>(queryKeys.logicRules(workflowId));
            if (previousRules) {
                const updatedRules = previousRules.map((rule) =>
                    rule.id === id ? { ...rule, ...data } : rule
                );
                queryClient.setQueryData(queryKeys.logicRules(workflowId), updatedRules);
            }
            return { previousRules };
        },
        onError: (err, variables, context) => {
            if (context?.previousRules) {
                queryClient.setQueryData(queryKeys.logicRules(variables.workflowId), context.previousRules);
            }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        onSettled: async (_, __, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useReorderLogicRules(): UseMutationResult<unknown, unknown, { workflowId: string; rules: Array<{ id: string; order: number }> }> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to reorder rules. The order has been reverted." },
        mutationFn: ({ workflowId, rules }: { workflowId: string; rules: Array<{ id: string; order: number }> }) =>
            logicRuleAPI.reorder(workflowId, rules),
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            const previousRules = queryClient.getQueryData<ApiLogicRule[]>(queryKeys.logicRules(variables.workflowId));
            if (previousRules) {
                const updatedRules = previousRules
                    .map((rule) => {
                        const newOrder = variables.rules.find((r) => r.id === rule.id);
                        return newOrder ? { ...rule, order: newOrder.order } : rule;
                    })
                    .sort((a, b) => a.order - b.order);
                queryClient.setQueryData(queryKeys.logicRules(variables.workflowId), updatedRules);
            }
            return { previousRules };
        },
        onError: (err, variables, context) => {
            if (context?.previousRules) {
                queryClient.setQueryData(queryKeys.logicRules(variables.workflowId), context.previousRules);
            }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        onSettled: async (_, __, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
        },
    });
}

export function useDeleteLogicRule(): UseMutationResult<void, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            logicRuleAPI.delete(variables.workflowId, variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
