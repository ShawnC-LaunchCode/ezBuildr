import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore, useCallback, useEffect, useRef, useState } from 'react';

import { fetchAPI, type ApiAdvanceResult, type ApiRunRuntime } from '@/lib/vault-api';
import { queryKeys } from '@/hooks/api/queryKeys';

import type { PreviewEnvironment, PreviewRunState } from './PreviewEnvironment';

export function usePreviewEnvironment(env: PreviewEnvironment | null): PreviewRunState | null {
    const subscribe = useCallback((callback: () => void) => {
        if (!env) {return () => { };}
        return env.subscribe(callback);
    }, [env]);

    const getSnapshot = useCallback((): PreviewRunState | null => {
        if (!env) {return null;}
        return env.getState();
    }, [env]);

    const getServerSnapshot = useCallback((): PreviewRunState | null => {
        return null;
    }, []);

    return useSyncExternalStore<PreviewRunState | null>(subscribe, getSnapshot, getServerSnapshot);
}

interface ServerPreviewSession {
    runId: string;
    workflowId: string;
    expiresAt: string;
    notices?: string[];
}

export const previewResultKey = (runId: string) => ['preview-advance', runId] as const;

interface ServerPreviewSessionState {
    runId: string | null;
    initialValues: Record<string, unknown>;
    isReplacing: boolean;
    error: string | null | undefined;
    session: ServerPreviewSession | undefined;
    result: ApiAdvanceResult | undefined;
    replace: (snapshotId?: string) => Promise<string | null>;
    retire: () => Promise<void>;
    applyResult: (id: string, response: ApiAdvanceResult) => void;
}

function mergeRuntime(previous: ApiRunRuntime | undefined, id: string, response: ApiAdvanceResult): ApiRunRuntime | undefined {
    if (!previous) { return previous; }
    const nextPageId = response.navigation?.nextPageId;
    const existing = new Map(previous.values.map((entry) => [entry.stepId, entry]));
    return {
        ...previous,
        values: Object.entries(response.values).map(([stepId, value]) => ({
            id: existing.get(stepId)?.id ?? stepId, runId: id, stepId, value,
            createdAt: existing.get(stepId)?.createdAt ?? '', updatedAt: existing.get(stepId)?.updatedAt ?? '',
        })),
        run: {
            ...previous.run, currentPageId: nextPageId ?? previous.run.currentPageId,
            visitedPageIds: nextPageId && !previous.run.visitedPageIds.includes(nextPageId)
                ? [...previous.run.visitedPageIds, nextPageId] : previous.run.visitedPageIds,
        },
    };
}

/** Server identity and request lifetime; answers and execution results stay in Query. */
export function useServerPreviewSession(workflowId: string): ServerPreviewSessionState {
    const queryClient = useQueryClient();
    const [runId, setRunId] = useState<string | null>(null);
    const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
    const [isReplacing, setIsReplacing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const currentId = useRef<string | null>(null);
    const generation = useRef(0);
    const ownedIds = useRef(new Set<string>());
    const queue = useRef(Promise.resolve());

    const retireOwned = useCallback(async () => {
        for (const id of ownedIds.current) {
            await fetchAPI(`/api/preview-runs/${id}`, { method: 'DELETE' });
            ownedIds.current.delete(id);
            queryClient.removeQueries({ queryKey: queryKeys.runRuntime(id) });
            queryClient.removeQueries({ queryKey: previewResultKey(id) });
        }
    }, [queryClient]);

    const replace = useCallback((snapshotId?: string) => {
        const requestedGeneration = ++generation.current;
        currentId.current = null;
        setRunId(null);
        setError(null);
        setIsReplacing(true);
        queue.current = queue.current.then(async () => {
            await retireOwned();
            if (generation.current !== requestedGeneration) { return; }
            const values = snapshotId && snapshotId !== 'none'
                ? await fetchAPI<Record<string, unknown>>(`/api/workflows/${workflowId}/snapshots/${snapshotId}/values`)
                : {};
            if (generation.current !== requestedGeneration) { return; }
            const session = await fetchAPI<ServerPreviewSession>(`/api/workflows/${workflowId}/preview-runs`, {
                method: 'POST', body: JSON.stringify({}),
            });
            ownedIds.current.add(session.runId);
            if (generation.current !== requestedGeneration) { await retireOwned(); return; }
            queryClient.setQueryData(['preview-session', session.runId], session);
            currentId.current = session.runId;
            setInitialValues(values);
            setRunId(session.runId);
        }).catch((failure: unknown) => {
            if (generation.current === requestedGeneration) {
                setError(failure instanceof Error ? failure.message : 'Unable to start preview. Please retry.');
            }
        }).finally(() => {
            if (generation.current === requestedGeneration) { setIsReplacing(false); }
        });
        return queue.current.then(() => currentId.current);
    }, [retireOwned, workflowId, queryClient]);

    const retire = useCallback(async () => {
        ++generation.current;
        currentId.current = null;
        setRunId(null);
        await queue.current;
        await retireOwned();
    }, [retireOwned]);

    useEffect(() => {
        void replace();
        return () => {
            ++generation.current;
            currentId.current = null;
            queue.current = queue.current.then(retireOwned).catch(() => {
                // Abandoned sessions also have a server-enforced expiry and cleanup.
            });
        };
    }, [replace, retireOwned]);

    const session = useQuery({
        queryKey: ['preview-session', runId],
        queryFn: () => fetchAPI<ServerPreviewSession>(`/api/preview-runs/${runId}`),
        enabled: runId !== null,
        refetchInterval: 15000,
        retry: false,
    });
    const result = useQuery<ApiAdvanceResult>({
        queryKey: previewResultKey(runId ?? ''), enabled: false,
    });
    const applyResult = useCallback((id: string, response: ApiAdvanceResult) => {
        if (currentId.current !== id) { return; }
        queryClient.setQueryData(previewResultKey(id), response);
        queryClient.setQueryData<ApiRunRuntime>(queryKeys.runRuntime(id), (previous) => mergeRuntime(previous, id, response));
    }, [queryClient]);

    return { runId, initialValues, isReplacing, error: error ?? session.error?.message,
        session: session.data, result: result.data, replace, retire, applyResult };
}
