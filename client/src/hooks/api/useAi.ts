import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { fetchAPI } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

import type {
    AiEditProposal,
    WorkflowPatchOp,
} from "../../../../shared/validation/aiWorkflowEdit.schema";
import type {
    AIConnectLogicRequest,
    AIConnectLogicResponse,
    AIVisualizeLogicRequest,
    AIVisualizeLogicResponse,
} from "../../../../shared/types/ai";

/**
 * AI workflow editing on the hardened ops pipeline (ICW2-10).
 *
 * `/api/workflows/:id/ai/edit` serves both halves of the manual-review flow:
 * a `dryRun` propose that writes nothing, then an apply of the reviewed ops
 * through the snapshot + transaction pipeline.
 */
export interface AiEditApplyResult {
    workflowId: string;
    versionId: string | null;
    versionNumber?: number;
    noChanges: boolean;
    summary: string[];
    warnings: string[];
}

const AI_EDIT_URL = (workflowId: string): string =>
    `/api/workflows/${workflowId}/ai/edit`;

/** Propose changes without writing anything. */
export function useProposeAiEdit(): UseMutationResult<
    AiEditProposal,
    unknown,
    { workflowId: string; userMessage: string }
> {
    return useMutation({
        mutationFn: async ({ workflowId, userMessage }) => {
            const res = await fetchAPI<{ data: AiEditProposal }>(AI_EDIT_URL(workflowId), {
                method: 'POST',
                body: JSON.stringify({ userMessage, dryRun: true }),
            });
            return res.data;
        },
    });
}

/**
 * Apply ops. With `ops` omitted the server generates and applies in one shot
 * (easy-mode auto-apply); with `ops` supplied it applies exactly the reviewed
 * proposal.
 */
export function useApplyAiEdit(): UseMutationResult<
    AiEditApplyResult,
    unknown,
    { workflowId: string; userMessage: string; ops?: WorkflowPatchOp[] }
> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ workflowId, userMessage, ops }) => {
            const res = await fetchAPI<{ data: AiEditApplyResult }>(AI_EDIT_URL(workflowId), {
                method: 'POST',
                body: JSON.stringify(ops !== undefined ? { userMessage, ops } : { userMessage }),
            });
            return res.data;
        },
        onSuccess: async (_result, variables) => {
            // The ops pipeline writes pages, steps and logic rules directly,
            // so every builder-facing cache for this workflow is now stale.
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: ["steps"] });
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useConnectLogic(): UseMutationResult<AIConnectLogicResponse, unknown, AIConnectLogicRequest> {
    return useMutation({
        mutationFn: (data: AIConnectLogicRequest) =>
            fetchAPI<AIConnectLogicResponse>('/api/ai/workflows/generate-logic', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    });
}

export function useVisualizeLogic(): UseMutationResult<AIVisualizeLogicResponse, unknown, AIVisualizeLogicRequest> {
    return useMutation({
        mutationFn: (data: AIVisualizeLogicRequest) =>
            fetchAPI<AIVisualizeLogicResponse>('/api/ai/workflows/visualize-logic', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    });
}
