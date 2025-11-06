/**
 * TanStack Query hooks for Vault-Logic API
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { workflowAPI, sectionAPI, stepAPI, blockAPI, transformBlockAPI, runAPI, type ApiWorkflow, type ApiSection, type ApiStep, type ApiBlock, type ApiTransformBlock, type ApiRun } from "./vault-api";

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  workflows: ["workflows"] as const,
  workflow: (id: string) => ["workflows", id] as const,
  sections: (workflowId: string) => ["sections", workflowId] as const,
  steps: (sectionId: string) => ["steps", sectionId] as const,
  blocks: (workflowId: string, phase?: string) => ["blocks", workflowId, phase] as const,
  transformBlocks: (workflowId: string) => ["transformBlocks", workflowId] as const,
  transformBlock: (id: string) => ["transformBlocks", id] as const,
  runs: (workflowId: string) => ["runs", workflowId] as const,
  run: (id: string) => ["runs", id] as const,
  runWithValues: (id: string) => ["runs", id, "values"] as const,
};

// ============================================================================
// Workflows
// ============================================================================

export function useWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflows,
    queryFn: workflowAPI.list,
  });
}

export function useWorkflow(id: string | undefined, options?: Omit<UseQueryOptions<ApiWorkflow>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: queryKeys.workflow(id!),
    queryFn: () => workflowAPI.get(id!),
    enabled: !!id,
    ...options,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ApiWorkflow> & { id: string }) =>
      workflowAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}

// ============================================================================
// Sections
// ============================================================================

export function useSections(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sections(workflowId!),
    queryFn: () => sectionAPI.list(workflowId!),
    enabled: !!workflowId,
  });
}

export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...data }: { workflowId: string; title: string; description?: string; order: number }) =>
      sectionAPI.create(workflowId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
    },
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId, ...data }: Partial<ApiSection> & { id: string; workflowId: string }) =>
      sectionAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
    },
  });
}

export function useReorderSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, sections }: { workflowId: string; sections: Array<{ id: string; order: number }> }) =>
      sectionAPI.reorder(workflowId, sections),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
      sectionAPI.delete(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
    },
  });
}

// ============================================================================
// Steps
// ============================================================================

export function useSteps(sectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.steps(sectionId!),
    queryFn: () => stepAPI.list(sectionId!),
    enabled: !!sectionId,
  });
}

export function useCreateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, ...data }: Omit<ApiStep, "id" | "createdAt"> & { sectionId: string }) =>
      stepAPI.create(sectionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
    },
  });
}

export function useUpdateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sectionId, ...data }: Partial<ApiStep> & { id: string; sectionId: string }) =>
      stepAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
    },
  });
}

export function useReorderSteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, steps }: { sectionId: string; steps: Array<{ id: string; order: number }> }) =>
      stepAPI.reorder(sectionId, steps),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
    },
  });
}

export function useDeleteStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sectionId }: { id: string; sectionId: string }) =>
      stepAPI.delete(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
    },
  });
}

// ============================================================================
// Blocks
// ============================================================================

export function useBlocks(workflowId: string | undefined, phase?: string) {
  return useQuery({
    queryKey: queryKeys.blocks(workflowId!, phase),
    queryFn: () => blockAPI.list(workflowId!, phase as any),
    enabled: !!workflowId,
  });
}

export function useCreateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...data }: Omit<ApiBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }) =>
      blockAPI.create(workflowId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}

export function useUpdateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId, ...data }: Partial<ApiBlock> & { id: string; workflowId: string }) =>
      blockAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}

export function useReorderBlocks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, blocks }: { workflowId: string; blocks: Array<{ id: string; order: number }> }) =>
      blockAPI.reorder(workflowId, blocks),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}

export function useDeleteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
      blockAPI.delete(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}

// ============================================================================
// Transform Blocks
// ============================================================================

export function useTransformBlocks(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transformBlocks(workflowId!),
    queryFn: () => transformBlockAPI.list(workflowId!),
    enabled: !!workflowId,
  });
}

export function useTransformBlock(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transformBlock(id!),
    queryFn: () => transformBlockAPI.get(id!),
    enabled: !!id,
  });
}

export function useCreateTransformBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...data }: Omit<ApiTransformBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }) =>
      transformBlockAPI.create(workflowId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
    },
  });
}

export function useUpdateTransformBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId, ...data }: Partial<ApiTransformBlock> & { id: string; workflowId: string }) =>
      transformBlockAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlock(variables.id) });
    },
  });
}

export function useDeleteTransformBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
      transformBlockAPI.delete(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
    },
  });
}

export function useTestTransformBlock() {
  return useMutation({
    mutationFn: ({ id, testData }: { id: string; testData: Record<string, any> }) =>
      transformBlockAPI.test(id, testData),
  });
}

// ============================================================================
// Runs
// ============================================================================

export function useRuns(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.runs(workflowId!),
    queryFn: () => runAPI.list(workflowId!),
    enabled: !!workflowId,
  });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.run(id!),
    queryFn: () => runAPI.get(id!),
    enabled: !!id,
  });
}

export function useRunWithValues(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.runWithValues(id!),
    queryFn: () => runAPI.getWithValues(id!),
    enabled: !!id,
  });
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, queryParams, ...data }: { workflowId: string; participantId?: string; metadata?: any; queryParams?: Record<string, string> }) =>
      runAPI.create(workflowId, data, queryParams),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runs(variables.workflowId) });
    },
  });
}

export function useUpsertValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, stepId, value }: { runId: string; stepId: string; value: any }) =>
      runAPI.upsertValue(runId, stepId, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runWithValues(variables.runId) });
    },
  });
}

export function useSubmitSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, sectionId, values }: { runId: string; sectionId: string; values: Array<{ stepId: string; value: any }> }) =>
      runAPI.submitSection(runId, sectionId, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runWithValues(variables.runId) });
    },
  });
}

export function useNext() {
  return useMutation({
    mutationFn: ({ runId, currentSectionId }: { runId: string; currentSectionId: string }) =>
      runAPI.next(runId, currentSectionId),
  });
}

export function useCompleteRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runAPI.complete,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.run(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.runs(data.workflowId) });
    },
  });
}
