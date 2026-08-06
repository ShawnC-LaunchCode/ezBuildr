import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { getRunToken, setRunToken } from "@/lib/runTokens";
import { fetchAPI, type ApiRunRuntime, type ApiStepValue } from "@/lib/vault-api";
import { useRunRuntime } from "@/lib/vault-hooks";
import { isUUID, startRunFromSlug, startRunFromWorkflowId, type StepValue } from "@/pages/workflow-runner/runner.utils";
import type { PreviewEnvironment, PreviewRunState } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";

const RESERVED_URL_PARAMS = ['ref', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'token', 'resume'];

type RunnerMode = 'preview' | 'production';
type InitialValues = Record<string, StepValue> | undefined;
type RunWithValues = ApiRunRuntime['run'] & { values: ApiStepValue[] };

interface ResolvedRunSession {
  runId: string;
  runToken?: string;
  notifyNewSession?: boolean;
}

interface UseRunSessionReturn {
  actualRunId: string | null;
  isInitializing: boolean;
  initError: string | null;
  mode: RunnerMode;
  previewState: PreviewRunState | null;
  run: RunWithValues | undefined;
  runtime: ApiRunRuntime | undefined;
  workflowId: string | undefined;
}

function parseInitialValuesFromUrl(urlParams: URLSearchParams): Record<string, StepValue> {
  const initialValues: Record<string, StepValue> = {};
  for (const [key, value] of urlParams.entries()) {
    if (RESERVED_URL_PARAMS.includes(key)) {
      continue;
    }
    try {
      initialValues[key] = JSON.parse(value);
    } catch {
      initialValues[key] = value;
    }
  }
  return initialValues;
}

function consumeRunTokenFromUrl(runId: string, urlParams: URLSearchParams): void {
  if (typeof window === 'undefined') {
    return;
  }
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const tokenFromUrl = urlParams.get('token') ?? hashParams.get('token');
  if (!tokenFromUrl || !isUUID(runId)) {
    return;
  }
  setRunToken(runId, tokenFromUrl);

  const newUrl = new URL(window.location.href);
  newUrl.searchParams.delete('token');
  if (newUrl.hash.includes('token=')) {
    const hashParamsToClean = new URLSearchParams(newUrl.hash.substring(1));
    hashParamsToClean.delete('token');
    const newHash = hashParamsToClean.toString();
    newUrl.hash = newHash ? `#${newHash}` : '';
  }
  window.history.replaceState({}, '', newUrl.toString());
}

async function consumeResumeLinkFromUrl(runId: string, urlParams: URLSearchParams): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }
  const resumeToken = urlParams.get('resume');
  if (!resumeToken || !isUUID(runId)) {
    return false;
  }
  const response = await fetchAPI<{
    data: { runId: string; runToken: string };
  }>(`/api/runs/${runId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ token: resumeToken }),
  });
  setRunToken(response.data.runId, response.data.runToken);
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('resume');
  window.history.replaceState({}, '', cleanUrl.toString());
  return true;
}

function toResolvedSession(runData: { runId: string; runToken: string }): ResolvedRunSession {
  return {
    runId: runData.runId,
    runToken: runData.runToken,
  };
}

async function startReplacementRunFromExistingRunId(
  runId: string,
  initialValues: InitialValues
): Promise<ResolvedRunSession | null> {
  try {
    const result = await fetchAPI<{ data?: { workflowId?: string } }>(`/api/runs/${runId}`);
    const workflowId = result.data?.workflowId;
    if (!workflowId) {
      return null;
    }

    const newRunData = await startRunFromWorkflowId(workflowId, initialValues);
    return {
      ...toResolvedSession(newRunData),
      notifyNewSession: true,
    };
  } catch {
    return null;
  }
}

async function resolveUuidRunSession(runId: string, initialValues: InitialValues): Promise<ResolvedRunSession> {
  const runToken = getRunToken(runId);
  if (runToken) {
    return { runId };
  }

  try {
    return toResolvedSession(await startRunFromWorkflowId(runId, initialValues));
  } catch {
    // UUIDs can also be public workflow identifiers or existing run IDs.
  }

  try {
    return toResolvedSession(await startRunFromSlug(runId, initialValues));
  } catch {
    // Fall through to the existing-run fork fallback.
  }

  return (await startReplacementRunFromExistingRunId(runId, initialValues)) ?? { runId };
}

async function resolveRunSession(runId: string, initialValues: InitialValues): Promise<ResolvedRunSession> {
  if (isUUID(runId)) {
    return resolveUuidRunSession(runId, initialValues);
  }

  return toResolvedSession(await startRunFromSlug(runId, initialValues));
}

export function useRunSession(runId?: string, previewEnvironment?: PreviewEnvironment): UseRunSessionReturn {
  const [actualRunId, setActualRunId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const { toast } = useToast();

  const previewState = usePreviewEnvironment(previewEnvironment ?? null);
  const mode: RunnerMode = previewEnvironment ? 'preview' : 'production';

  useEffect(() => {
    if (previewEnvironment) {
      if (runId) {
        setActualRunId(runId);
      }
      setIsInitializing(false);
      return;
    }

    async function initialize(): Promise<void> {
      if (!runId) {
        setInitError('No run ID provided');
        setIsInitializing(false);
        return;
      }

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const initialValues = parseInitialValuesFromUrl(urlParams);
        const initialValuesArg = Object.keys(initialValues).length > 0 ? initialValues : undefined;
        const resumed = await consumeResumeLinkFromUrl(runId, urlParams);
        if (!resumed) {
          consumeRunTokenFromUrl(runId, urlParams);
        }

        const resolvedRun = await resolveRunSession(runId, initialValuesArg);
        setActualRunId(resolvedRun.runId);
        if (resolvedRun.runToken) {
          setRunToken(resolvedRun.runId, resolvedRun.runToken);
        }
        if (resolvedRun.notifyNewSession) {
          toast({
            title: "New session started",
            description: "Created a new run for this workflow",
          });
        }
      } catch (error) {
        setInitError(error instanceof Error ? error.message : 'Failed to load workflow');
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : 'Failed to load workflow',
          variant: "destructive",
        });
      } finally {
        setIsInitializing(false);
      }
    }

    void initialize();
  }, [runId, toast, previewEnvironment]);

  const { data: runtime, error: runtimeError, isLoading: isRuntimeLoading } = useRunRuntime(actualRunId ?? '', {
    enabled: mode === 'production' && actualRunId !== null && !isInitializing,
  });
  // Memoized on `runtime` (react-query keeps that reference stable across
  // re-renders via structural sharing, only changing on a real refetch) so
  // downstream effects that depend on `run` — e.g. useRunValues' saved-run
  // hydration — don't re-fire on every render. An unmemoized spread here
  // previously produced a brand-new object every render, which retriggered
  // that hydration effect every render, clobbering in-progress answers back
  // to the server snapshot and running away into React's "Maximum update
  // depth exceeded" (ICW2-B10).
  const run = useMemo(
    () => (runtime == null ? undefined : { ...runtime.run, values: runtime.values }),
    [runtime]
  );

  const workflowId = mode === 'preview' ? previewState?.workflowId : run?.workflowId;
  const effectiveInitError = initError ?? (runtimeError instanceof Error ? runtimeError.message : null);

  return {
    actualRunId,
    isInitializing: isInitializing || (mode === 'production' && actualRunId !== null && isRuntimeLoading),
    initError: effectiveInitError,
    mode,
    previewState,
    run,
    runtime,
    workflowId,
  };
}
