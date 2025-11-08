/**
 * TanStack Query hooks for Vault-Logic API
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { projectAPI, workflowAPI, variableAPI, sectionAPI, stepAPI, blockAPI, transformBlockAPI, runAPI, accountAPI, workflowModeAPI, type ApiProject, type ApiProjectWithWorkflows, type ApiWorkflow, type ApiWorkflowVariable, type ApiSection, type ApiStep, type ApiBlock, type ApiTransformBlock, type ApiRun, type AccountPreferences, type WorkflowModeResponse } from "./vault-api";

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  projectWorkflows: (projectId: string) => ["projects", projectId, "workflows"] as const,
  workflows: ["workflows"] as const,
  workflowsUnfiled: ["workflows", "unfiled"] as const,
  workflow: (id: string) => ["workflows", id] as const,
  variables: (workflowId: string) => ["workflows", workflowId, "variables"] as const,
  sections: (workflowId: string) => ["sections", workflowId] as const,
  steps: (sectionId: string) => ["steps", sectionId] as const,
  step: (id: string) => ["steps", "single", id] as const,
  blocks: (workflowId: string, phase?: string) => ["blocks", workflowId, phase] as const,
  transformBlocks: (workflowId: string) => ["transformBlocks", workflowId] as const,
  transformBlock: (id: string) => ["transformBlocks", id] as const,
  runs: (workflowId: string) => ["runs", workflowId] as const,
  run: (id: string) => ["runs", id] as const,
  runWithValues: (id: string) => ["runs", id, "values"] as const,
  accountPreferences: ["account", "preferences"] as const,
  workflowMode: (workflowId: string) => ["workflows", workflowId, "mode"] as const,
};

// ============================================================================
// Projects
// ============================================================================

export function useProjects(activeOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => projectAPI.list(activeOnly),
  });
}

export function useProject(id: string | undefined, options?: Omit<UseQueryOptions<ApiProjectWithWorkflows>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: queryKeys.project(id!),
    queryFn: () => projectAPI.get(id!),
    enabled: !!id,
    ...options,
  });
}

export function useProjectWorkflows(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectWorkflows(projectId!),
    queryFn: () => projectAPI.getWorkflows(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ApiProject> & { id: string }) =>
      projectAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.archive,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUnarchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.unarchive,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ============================================================================
// Workflows
// ============================================================================

export function useWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflows,
    queryFn: workflowAPI.list,
  });
}

export function useUnfiledWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflowsUnfiled,
    queryFn: workflowAPI.listUnfiled,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
    },
  });
}

export function useMoveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string | null }) =>
      workflowAPI.moveToProject(id, projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(data.id) });
      if (data.projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectWorkflows(data.projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.project(data.projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ============================================================================
// Workflow Variables
// ============================================================================

export function useWorkflowVariables(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.variables(workflowId!),
    queryFn: () => variableAPI.list(workflowId!),
    enabled: !!workflowId,
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

export function useStep(stepId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.step(stepId!),
    queryFn: () => stepAPI.get(stepId!),
    enabled: !!stepId,
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.step(variables.id) });
      // Invalidate variables when step alias changes
      const section = data?.sectionId;
      if (section) {
        // Get workflowId from the section - we'll need to query for it
        // For simplicity, just invalidate all workflow variables queries
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
      }
    },
  });
}

export function useReorderSteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, steps }: { sectionId: string; steps: Array<{ id: string; order: number }> }) =>
      stepAPI.reorder(sectionId, steps),
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.steps(variables.sectionId) });

      // Snapshot the previous value
      const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(variables.sectionId));

      // Optimistically update to the new value
      if (previousSteps) {
        const updatedSteps = previousSteps.map((step) => {
          const newOrder = variables.steps.find((s) => s.id === step.id);
          return newOrder ? { ...step, order: newOrder.order } : step;
        });
        queryClient.setQueryData(queryKeys.steps(variables.sectionId), updatedSteps);
      }

      // Return context with the previous value
      return { previousSteps };
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousSteps) {
        queryClient.setQueryData(queryKeys.steps(variables.sectionId), context.previousSteps);
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success to ensure sync with server
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
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["blocks", variables.workflowId] });

      // Snapshot the previous value
      const previousBlocks = queryClient.getQueryData<ApiBlock[]>(queryKeys.blocks(variables.workflowId));

      // Optimistically update to the new value
      if (previousBlocks) {
        const updatedBlocks = previousBlocks.map((block) => {
          const newOrder = variables.blocks.find((b) => b.id === block.id);
          return newOrder ? { ...block, order: newOrder.order } : block;
        });
        queryClient.setQueryData(queryKeys.blocks(variables.workflowId), updatedBlocks);
      }

      // Return context with the previous value
      return { previousBlocks };
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousBlocks) {
        queryClient.setQueryData(queryKeys.blocks(variables.workflowId), context.previousBlocks);
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ["blocks", variables.workflowId] });
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

// ============================================================================
// Account & Mode Preferences
// ============================================================================

export function useAccountPreferences() {
  return useQuery({
    queryKey: queryKeys.accountPreferences,
    queryFn: () => accountAPI.getPreferences(),
  });
}

export function useUpdateAccountPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountAPI.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accountPreferences });
      // Invalidate all workflow modes since the default has changed
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useWorkflowMode(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflowMode(workflowId!),
    queryFn: () => workflowModeAPI.getMode(workflowId!),
    enabled: !!workflowId,
  });
}

export function useSetWorkflowMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, modeOverride }: { workflowId: string; modeOverride: 'easy' | 'advanced' | null }) =>
      workflowModeAPI.setMode(workflowId, modeOverride),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowMode(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
    },
  });
}
