import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";

import { DevToolsPanel } from "@/components/devtools/DevToolsPanel";
import { Button } from "@/components/ui/button";
import { useServerPreviewSession } from "@/lib/previewRunner/usePreviewEnvironment";
import type { TraceEntry } from "@/lib/previewRunner/PreviewEnvironment";
import { generateAIRandomValues, generateAIRandomValuesForSteps } from "@/lib/randomizer/aiRandomFill";
import { fetchAPI, type ApiAdvanceResult, type ApiPage, type ApiStep } from "@/lib/vault-api";
import { useRunRuntime } from "@/lib/vault-hooks";
import { WorkflowRunner, type PreviewRunnerControls } from "@/pages/WorkflowRunner";

import { DevToolbar } from "./DevToolbar";
import { PreviewVariablesPanel } from "./variables/PreviewVariablesPanel";

interface PreviewRunnerProps {
    workflowId: string;
    onExit: () => void;
}

interface PreviewDefinition {
    title: string;
    description: string | null;
    pages: Array<ApiPage & { steps: ApiStep[] }>;
    logicRules: unknown;
    transformBlocks: unknown;
    settings: unknown;
    branding: unknown;
}

async function readDefinition(workflowId: string): Promise<string> {
    const [workflow, sections, blocks, lifecycleHooks, documentHooks] = await Promise.all([
        fetchAPI<PreviewDefinition>(`/api/workflows/${workflowId}`),
        fetchAPI<unknown>(`/api/workflows/${workflowId}/sections`),
        fetchAPI<unknown>(`/api/workflows/${workflowId}/blocks`),
        fetchAPI<unknown>(`/api/workflows/${workflowId}/lifecycle-hooks`),
        fetchAPI<unknown>(`/api/workflows/${workflowId}/document-hooks`),
    ]);
    // Exclude currentVersion: creating a preview itself pins a new draft version.
    return JSON.stringify({ title: workflow.title, description: workflow.description,
        pages: workflow.pages, rules: workflow.logicRules, transforms: workflow.transformBlocks,
        settings: workflow.settings, branding: workflow.branding, sections, blocks, lifecycleHooks, documentHooks });
}

export function PreviewRunner({ workflowId, onExit }: PreviewRunnerProps) {
    const preview = useServerPreviewSession(workflowId);
    const { data: runtime } = useRunRuntime(preview.runId ?? '', { enabled: preview.runId !== null });
    const definition = useQuery({
        queryKey: ['preview-definition', workflowId], queryFn: () => readDefinition(workflowId),
        refetchInterval: 10000, staleTime: 0, retry: false,
    });
    const [pinnedDefinition, setPinnedDefinition] = useState<{ runId: string; fingerprint: string } | null>(null);
    const [showDevTools, setShowDevTools] = useState(false);
    const [showVariables, setShowVariables] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [toolError, setToolError] = useState<string | null>(null);
    const controls = useRef<PreviewRunnerControls | null>(null);
    const activeRunId = useRef(preview.runId);
    activeRunId.current = preview.runId;

    useEffect(() => {
        if (preview.runId && definition.data && pinnedDefinition?.runId !== preview.runId) {
            setPinnedDefinition({ runId: preview.runId, fingerprint: definition.data });
        }
    }, [preview.runId, definition.data, pinnedDefinition]);
    const definitionChanged = pinnedDefinition?.runId === preview.runId && definition.data !== undefined &&
        pinnedDefinition?.fingerprint !== definition.data;
    const onControls = useCallback((value: PreviewRunnerControls | null) => { controls.current = value; }, []);
    const onResult = useCallback((result: ApiAdvanceResult) => {
        if (preview.runId) { preview.applyResult(preview.runId, result); }
    }, [preview.runId, preview.applyResult]);
    const serverPreview = useMemo(() => ({ initialValues: preview.initialValues, onControls, onResult }),
        [preview.initialValues, onControls, onResult]);

    const replace = async (snapshotId?: string) => {
        activeRunId.current = null;
        controls.current = null;
        setIsAiLoading(false);
        setToolError(null);
        const refreshing = definition.refetch();
        const nextId = await preview.replace(snapshotId);
        const latest = await refreshing;
        if (nextId && latest.data) { setPinnedDefinition({ runId: nextId, fingerprint: latest.data }); }
    };
    const exit = async () => {
        activeRunId.current = null;
        controls.current = null;
        try { await preview.retire(); onExit(); }
        catch (error) { setToolError(error instanceof Error ? error.message : 'Unable to retire preview. Retry Exit Preview.'); }
    };
    const fill = async (entireWorkflow: boolean) => {
        const id = preview.runId;
        const runner = controls.current;
        if (!id || !runner || !runtime || isAiLoading) { return; }
        setIsAiLoading(true);
        setToolError(null);
        try {
            const values = entireWorkflow
                ? await generateAIRandomValues(runtime.steps, workflowId, runtime.workflow.title)
                : await generateAIRandomValuesForSteps(runner.steps, workflowId, runtime.workflow.title);
            if (activeRunId.current !== id) { return; }
            if (entireWorkflow) { await runner.fillWorkflow(values); }
            else { await runner.fillPage(values); }
        } catch (error) {
            if (activeRunId.current === id) { setToolError(error instanceof Error ? error.message : 'Auto-fill failed. Retry or continue manually.'); }
        } finally {
            if (activeRunId.current === id) { setIsAiLoading(false); }
        }
    };

    const committedValues = useMemo(() => preview.result?.values ?? Object.fromEntries(
        (runtime?.values ?? []).map((entry) => [entry.stepId, entry.value])), [preview.result, runtime?.values]);
    const trace = useMemo<TraceEntry[]>(() => (preview.result?.blockStates ?? []).map((state) => ({
        id: state.stepId, stepId: state.stepId, type: 'step',
        status: state.errorMessage ? 'failed' : state.status === 'fired' ? 'executed' : 'skipped',
        message: `${runtime?.steps.find((step) => step.id === state.stepId)?.title ?? 'Code Block'}: ${state.status}`,
        details: { pendingInputs: state.pendingInputs, error: state.errorMessage },
        timestamp: state.firedAt ? new Date(state.firedAt).getTime() : Date.now(),
    })), [preview.result, runtime?.steps]);
    const failure = preview.error ?? definition.error?.message ?? toolError;
    const notices = [...new Set([...(preview.session?.notices ?? []), ...(preview.result?.notices ?? [])])];

    return (
        <div className="h-screen w-screen fixed inset-0 z-50 flex flex-col bg-background">
            <DevToolbar workflowId={workflowId} onExit={() => { void exit(); }}
                onReset={() => { void replace(); }} onRandomFill={() => { void fill(true); }}
                onRandomFillPage={() => { void fill(false); }} onLoadSnapshot={(id) => { void replace(id); }}
                onToggleDevTools={() => { setShowVariables(false); setShowDevTools((open) => !open); }} showDevTools={showDevTools}
                onToggleVariables={() => { setShowDevTools(false); setShowVariables((open) => !open); }} showVariables={showVariables}
                isAiLoading={isAiLoading} disabled={preview.isReplacing || definitionChanged || !!failure || !runtime} />
            <div className="border-b px-4 py-2 text-xs bg-muted/30" role="status">
                Preview: external actions are simulated or unavailable. No live delivery or external writes.
                {notices.map((notice) => <p key={notice} className="mt-1">{notice}</p>)}
            </div>
            {failure && <div role="alert" className="border-b px-4 py-3 text-sm text-destructive flex flex-wrap items-center gap-3">
                <span>{failure}</span><Button variant="outline" size="sm" onClick={() => { void replace(); }}>Retry Preview</Button>
            </div>}
            {definitionChanged && <div role="alert" className="px-4 py-4 border-b text-sm flex flex-wrap items-center gap-3">
                <span>The workflow changed. Restart preview to use the updated definition.</span>
                <Button onClick={() => { void replace(); }}>Restart Preview</Button>
            </div>}
            {preview.isReplacing && <div className="flex-1 flex items-center justify-center gap-2" role="status">
                <Loader2 className="animate-spin motion-reduce:animate-none w-5 h-5" /> Starting preview…
            </div>}
            {preview.runId && <div className={definitionChanged || preview.error ? 'hidden' : 'flex-1 flex overflow-hidden relative min-h-0'}>
                <div className="flex-1 min-w-0 overflow-auto">
                    <WorkflowRunner key={preview.runId} runId={preview.runId} runIdKind="session" serverPreview={serverPreview} />
                </div>
                {runtime && <DevToolsPanel data={{ workflowId, pages: runtime.pages, steps: runtime.steps, values: committedValues, trace }}
                    isOpen={showDevTools} onClose={() => setShowDevTools(false)} />}
                {showVariables && <PreviewVariablesPanel key={preview.runId} runId={preview.runId} values={committedValues}
                    result={preview.result} onClose={() => setShowVariables(false)} />}
            </div>}
        </div>
    );
}
