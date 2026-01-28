import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { workflowAPI, type ApiWorkflow } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useWorkflows(): UseQueryResult<ApiWorkflow[]> {
    return useQuery({
        queryKey: queryKeys.workflows,
        queryFn: workflowAPI.list,
    });
}

export function useUnfiledWorkflows(): UseQueryResult<ApiWorkflow[]> {
    return useQuery({
        queryKey: queryKeys.workflowsUnfiled,
        queryFn: workflowAPI.listUnfiled,
    });
}

export function useWorkflow(id: string | undefined, options?: Omit<UseQueryOptions<ApiWorkflow>, "queryKey" | "queryFn">): UseQueryResult<ApiWorkflow> {
    return useQuery({
        queryKey: queryKeys.workflow(id ?? ""),
        queryFn: () => workflowAPI.get(id ?? ""),
        enabled: !!id && id !== "undefined",
        ...options,
    });
}

export function useCreateWorkflow(): UseMutationResult<ApiWorkflow, unknown, { title: string; projectId?: string | null; description?: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: workflowAPI.create,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
        },
    });
}

export function useUpdateWorkflow(): UseMutationResult<ApiWorkflow, unknown, Partial<ApiWorkflow> & { id: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }: Partial<ApiWorkflow> & { id: string }) =>
            workflowAPI.update(id, data),
        onSuccess: async (_, variables) => {
            // Invalidate the specific workflow and all its sub-resources (sections, steps, blocks, etc.)
            await queryClient.invalidateQueries({ queryKey: ["workflows", variables.id] });
            await queryClient.invalidateQueries({ queryKey: ["sections", variables.id] });
            await queryClient.invalidateQueries({ queryKey: ["steps"] }); // Steps often have weird keys, safer to nuke 'em
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useDeleteWorkflow(): UseMutationResult<void, unknown, string> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: workflowAPI.delete,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
        },
    });
}

export function useMoveWorkflow(): UseMutationResult<ApiWorkflow, unknown, { id: string; projectId: string | null }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, projectId }: { id: string; projectId: string | null }) =>
            workflowAPI.moveToProject(id, projectId),
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflow(data.id) });
            if (data.projectId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.projectWorkflows(data.projectId) });
                await queryClient.invalidateQueries({ queryKey: queryKeys.project(data.projectId) });
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

export function useTransferWorkflow(): UseMutationResult<ApiWorkflow, unknown, { id: string; targetOwnerType: 'user' | 'org'; targetOwnerUuid: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetOwnerType, targetOwnerUuid }: {
      id: string;
      targetOwnerType: 'user' | 'org';
      targetOwnerUuid: string;
    }) => workflowAPI.transfer(id, targetOwnerType, targetOwnerUuid),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflow(data.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
    },
  });
}