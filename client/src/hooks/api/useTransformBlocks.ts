import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { transformBlockAPI, type ApiTransformBlock } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useTransformBlocks(workflowId: string | undefined): UseQueryResult<ApiTransformBlock[]> {
    return useQuery({
        queryKey: queryKeys.transformBlocks(workflowId ?? ""),
        queryFn: () => transformBlockAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useTransformBlock(id: string | undefined): UseQueryResult<ApiTransformBlock> {
    return useQuery({
        queryKey: queryKeys.transformBlock(id ?? ""),
        queryFn: () => transformBlockAPI.get(id ?? ""),
        enabled: !!id && id !== "undefined",
    });
}

export function useCreateTransformBlock(): UseMutationResult<ApiTransformBlock, unknown, Omit<ApiTransformBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, ...data }: Omit<ApiTransformBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }) => {
            if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
            return transformBlockAPI.create(workflowId, data);
        },
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
        },
    });
}

export function useUpdateTransformBlock(): UseMutationResult<ApiTransformBlock, unknown, Partial<ApiTransformBlock> & { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, workflowId, ...data }: Partial<ApiTransformBlock> & { id: string; workflowId: string }) => {
            if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
            return transformBlockAPI.update(id, data);
        },
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.transformBlock(variables.id) });
        },
    });
}

export function useDeleteTransformBlock(): UseMutationResult<{ success: boolean }, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            transformBlockAPI.delete(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
        },
    });
}

export function useTestTransformBlock(): UseMutationResult<{ success: boolean; output: any; error?: string }, unknown, { id: string; testData: Record<string, any> }> {
    return useMutation({
        mutationFn: ({ id, testData }: { id: string; testData: Record<string, any> }) =>
            transformBlockAPI.test(id, testData),
    });
}
