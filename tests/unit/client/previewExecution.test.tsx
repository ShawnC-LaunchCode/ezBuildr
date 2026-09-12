// @vitest-environment jsdom
/**
 * CB-9a-3a: a preview id is a SESSION, not something to resolve.
 *
 * Under the historical `'resolve'` path a preview run — which deliberately
 * carries no run token (9a-1) — falls through every branch of
 * `resolveUuidRunSession` to `startReplacementRunFromExistingRunId`, which
 * reads the run's `workflowId`, starts a brand new ORDINARY LIVE run, and
 * reports "New session started". That path is shared with every respondent
 * returning to an abandoned run, so it is left exactly as it was; the fix is a
 * new mode that opts out of resolution entirely.
 *
 * The assertions below are deliberately about *whether resolution is
 * attempted*, not about what the fork returns. The fork's internals are live
 * respondent recovery and are not this ticket's contract — asserting them here
 * would couple a preview test to four branches it does not own.
 *
 * The `advance` request/response contract is proven over real HTTP against a
 * real database in `tests/integration/preview.execution.test.ts`; re-asserting
 * its shape against a mocked fetch here would test the mock.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchAPIMock, startRunFromWorkflowIdMock, startRunFromSlugMock,
  setRunTokenMock, getRunTokenMock, useRunRuntimeMock,
  advanceMock, fillAllMock, fillPageMock, toastMock,
} = vi.hoisted(() => ({
  fetchAPIMock: vi.fn(),
  startRunFromWorkflowIdMock: vi.fn(),
  startRunFromSlugMock: vi.fn(),
  setRunTokenMock: vi.fn(),
  getRunTokenMock: vi.fn(),
  useRunRuntimeMock: vi.fn(),
  advanceMock: vi.fn(), fillAllMock: vi.fn(), fillPageMock: vi.fn(), toastMock: vi.fn(),
}));

vi.mock('@/lib/vault-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../client/src/lib/vault-api')>(), fetchAPI: fetchAPIMock,
}));
vi.mock('@/lib/vault-hooks', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../client/src/lib/vault-hooks')>(),
  useRunRuntime: useRunRuntimeMock,
  useWorkflow: () => ({ data: undefined }),
  useAdvance: () => ({ mutateAsync: advanceMock }),
}));
vi.mock('@/lib/runTokens', () => ({ getRunToken: getRunTokenMock, setRunToken: setRunTokenMock, clearRunToken: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/pages/workflow-runner/runner.utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../client/src/pages/workflow-runner/runner.utils')>(),
  isUUID: (value: string) => /^[0-9a-f]{8}-/i.test(value),
  startRunFromWorkflowId: startRunFromWorkflowIdMock,
  startRunFromSlug: startRunFromSlugMock,
}));
vi.mock('@/lib/runner/offlineBuffer', () => ({
  getBufferedStepValues: vi.fn().mockResolvedValue([]), bufferStepValues: vi.fn().mockResolvedValue(undefined),
  removeBufferedStepValues: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/randomizer/aiRandomFill', () => ({
  generateAIRandomValues: fillAllMock, generateAIRandomValuesForSteps: fillPageMock,
}));
vi.mock('@/components/preview/DevToolbar', () => ({
  DevToolbar: (props: { onReset: () => void; onLoadSnapshot: (id: string) => void; onRandomFill: () => void;
    onRandomFillPage: () => void; onExit: () => void; onToggleDevTools: () => void; disabled?: boolean; isAiLoading?: boolean }) => <div>
    <button onClick={props.onReset}>Reset Preview</button>
    <button onClick={() => props.onLoadSnapshot('snapshot-1')}>Load Snapshot</button>
    <button onClick={props.onRandomFillPage} disabled={props.disabled || props.isAiLoading}>Fill Page</button>
    <button onClick={props.onRandomFill} disabled={props.disabled || props.isAiLoading}>Fill Workflow</button>
    <button onClick={props.onToggleDevTools}>DevTools</button>
    <button onClick={props.onExit}>Exit Preview</button>
  </div>,
}));

import { PreviewRunner } from '../../../client/src/components/preview/PreviewRunner';
import type { ApiAdvanceResult, ApiPage, ApiRunRuntime, ApiStep } from '../../../client/src/lib/vault-api';
import { DEFAULT_RESOLVED_BRANDING } from '../../../shared/types/branding';
import { queryKeys } from '../../../client/src/hooks/api/queryKeys';

const PREVIEW_RUN_ID = '11111111-2222-3333-4444-555555555555';

describe('CB-9a-3a preview session plumbing', () => {
  beforeEach(() => {
    getRunTokenMock.mockReturnValue(null);
    useRunRuntimeMock.mockReturnValue({ data: undefined, error: null, isLoading: false });
    fetchAPIMock.mockResolvedValue({ data: { workflowId: 'workflow-1' } });
    startRunFromWorkflowIdMock.mockResolvedValue({ runId: 'a-brand-new-live-run', runToken: 'tok' });
    startRunFromSlugMock.mockResolvedValue({ runId: 'a-slug-run', runToken: 'tok' });
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("uses a 'session' id verbatim and never attempts to resolve it", async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID, 'session'));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(result.current.actualRunId).toBe(PREVIEW_RUN_ID);
    expect(result.current.initError).toBeNull();
    // The whole point. Any of these firing is the preview session being
    // replaced by an ordinary live run behind the author's back.
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
    expect(startRunFromSlugMock).not.toHaveBeenCalled();
    expect(fetchAPIMock).not.toHaveBeenCalled();
    expect(setRunTokenMock).not.toHaveBeenCalled();
  });

  it("still resolves under 'resolve', so live recovery is untouched", async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID, 'resolve'));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    // Resolution was attempted and its result adopted — the historical path.
    expect(startRunFromWorkflowIdMock).toHaveBeenCalledWith(PREVIEW_RUN_ID, undefined);
    expect(result.current.actualRunId).toBe('a-brand-new-live-run');
    expect(result.current.actualRunId).not.toBe(PREVIEW_RUN_ID);
  });

  it("defaults to 'resolve', so no existing caller changes behaviour", async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(startRunFromWorkflowIdMock).toHaveBeenCalled();
    expect(setRunTokenMock).toHaveBeenCalledWith('a-brand-new-live-run', 'tok');
  });

  it('honours a stored run token without resolving, in either mode', async () => {
    getRunTokenMock.mockReturnValue('existing-token');
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(result.current.actualRunId).toBe(PREVIEW_RUN_ID);
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
  });

  it('reports a missing id rather than silently idling', async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(undefined, 'session'));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(result.current.initError).toBe('No run ID provided');
    expect(result.current.actualRunId).toBeNull();
  });
});

const PREVIEW_WORKFLOW = '22222222-2222-4222-8222-222222222222';
const previewPages: ApiPage[] = [0, 1, 2].map((order) => ({
  id: `page-${order + 1}`, workflowId: PREVIEW_WORKFLOW, title: `Page ${order + 1}`, description: null,
  order, createdAt: '2026-09-07T00:00:00Z', config: {},
}));
const previewSteps: ApiStep[] = previewPages.map((page, order) => ({
  id: `input-${order + 1}`, workflowId: PREVIEW_WORKFLOW, pageId: page.id, title: `Answer ${order + 1}`,
  description: null, type: 'text', config: {}, required: false, order: 0, alias: `answer_${order + 1}`,
  visibleIf: null, createdAt: '2026-09-07T00:00:00Z',
}));
previewSteps.push({ ...previewSteps[0], id: 'computed-output', title: 'Computed', type: 'computed', isVirtual: true, alias: 'computed' });

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

describe('CB-9a-3b server-backed preview UI', () => {
  let queryClient: QueryClient;
  let createdIds: string[];
  let retiredIds: string[];
  let serverValues: Map<string, Record<string, unknown>>;
  let definitionTitle: string;

  function runtimeFor(id: string): ApiRunRuntime {
    return {
      contractVersion: 1,
      run: { id, workflowId: PREVIEW_WORKFLOW, workflowVersionId: 'version-1', currentPageId: 'page-1',
        visitedPageIds: ['page-1'], completed: false, generationStatus: null },
      workflow: { id: PREVIEW_WORKFLOW, title: 'Preview fixture', description: null, projectId: null, settings: {} },
      pages: previewPages, steps: previewSteps, sections: [], logicRules: [], branding: DEFAULT_RESOLVED_BRANDING,
      values: Object.entries(serverValues.get(id) ?? {}).map(([stepId, value]) => ({
        id: stepId, runId: id, stepId, value, createdAt: '', updatedAt: '',
      })),
    };
  }
  function mountPreview() {
    return render(<QueryClientProvider client={queryClient}><PreviewRunner workflowId={PREVIEW_WORKFLOW} onExit={vi.fn()} /></QueryClientProvider>);
  }
  async function answerField(number: number): Promise<HTMLInputElement> {
    return screen.findByLabelText<HTMLInputElement>(new RegExp(`Answer ${number}`, 'i'));
  }
  function useTestRuntime(id: string, options: { enabled?: boolean }) {
    return useQuery({ queryKey: queryKeys.runRuntime(id), queryFn: () => Promise.resolve(runtimeFor(id)), enabled: options.enabled });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdIds = []; retiredIds = []; serverValues = new Map(); definitionTitle = 'Preview fixture';
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    getRunTokenMock.mockReturnValue(null);
    fillPageMock.mockResolvedValue({ 'input-1': 'filled page' });
    fillAllMock.mockResolvedValue({ 'input-1': 'one', 'input-2': 'two', 'input-3': 'three' });
    useRunRuntimeMock.mockImplementation(useTestRuntime);
    fetchAPIMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/preview-runs') && init?.method === 'POST') {
        const runId = `33333333-3333-4333-8333-${String(createdIds.length + 1).padStart(12, '0')}`;
        createdIds.push(runId); serverValues.set(runId, {});
        return { runId, workflowId: PREVIEW_WORKFLOW, expiresAt: '2026-09-08T00:00:00Z' };
      }
      if (url.startsWith('/api/preview-runs/')) {
        const runId = url.split('/').at(-1) ?? '';
        if (init?.method === 'DELETE') { retiredIds.push(runId); return undefined; }
        return { runId, workflowId: PREVIEW_WORKFLOW, expiresAt: '2026-09-08T00:00:00Z', notices: ['External send simulated'] };
      }
      if (url.endsWith('/values/bulk')) { return { success: true }; }
      if (url.endsWith('/snapshots/snapshot-1/values')) { return { answer_1: 'snapshot answer', computed: 'stale computed' }; }
      if (url === `/api/workflows/${PREVIEW_WORKFLOW}`) { return { title: definitionTitle, pages: previewPages, logicRules: [], settings: {} }; }
      if (['/sections', '/blocks', '/lifecycle-hooks', '/document-hooks'].some((suffix) => url.endsWith(suffix))) { return []; }
      throw new Error(`Unexpected API: ${url}`);
    });
    advanceMock.mockImplementation(async ({ runId, pageId, values, submissionKey }: {
      runId: string; pageId: string; values: Array<{ stepId: string; value: unknown }>; submissionKey: string;
    }): Promise<ApiAdvanceResult> => {
      const committed = { ...serverValues.get(runId), ...Object.fromEntries(values.map((entry) => [entry.stepId, entry.value])) };
      committed['computed-output'] = `computed:${String(committed['input-1'])}`;
      serverValues.set(runId, committed);
      const index = previewPages.findIndex((page) => page.id === pageId);
      return { success: true, values: committed, blockStates: [], notices: ['External send simulated'],
        navigation: { nextPageId: previewPages[index + 1]?.id ?? null }, submissionKey };
    });
  });
  afterEach(async () => { cleanup(); await act(async () => { await Promise.resolve(); }); queryClient.clear(); });

  it('creates an isolated session and applies committed outputs after Next', async () => {
    mountPreview();
    fireEvent.change(await answerField(1), { target: { value: 'typed answer' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await answerField(2);
    expect(advanceMock).toHaveBeenCalledWith(expect.objectContaining({ runId: createdIds[0], pageId: 'page-1' }));
    expect(queryClient.getQueryData<ApiRunRuntime>(queryKeys.runRuntime(createdIds[0]))?.values).toContainEqual(expect.objectContaining({ stepId: 'computed-output', value: 'computed:typed answer' }));
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
    expect(screen.getByText('External send simulated')).toBeTruthy();
  });

  it('preserves typed edits on failed submit and retries the same unanswered attempt', async () => {
    advanceMock.mockRejectedValueOnce(new Error('Response lost'));
    mountPreview();
    fireEvent.change(await answerField(1), { target: { value: 'keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await waitFor(() => { expect(advanceMock).toHaveBeenCalledTimes(1); });
    expect((await answerField(1)).value).toBe('keep this draft');
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await answerField(2);
    const first = advanceMock.mock.calls[0][0] as { submissionKey: string };
    expect(advanceMock).toHaveBeenLastCalledWith(expect.objectContaining({ submissionKey: first.submissionKey }));
  });

  it('retires and replaces on reset, clears answers and reached pages, and retires on exit', async () => {
    mountPreview();
    fireEvent.change(await answerField(1), { target: { value: 'old answer' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await answerField(2);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Preview' }));
    await waitFor(() => { expect(createdIds).toHaveLength(2); });
    expect((await answerField(1)).value).toBe('');
    expect(retiredIds).toContain(createdIds[0]);
    expect(queryClient.getQueryData<ApiRunRuntime>(queryKeys.runRuntime(createdIds[1]))?.run.visitedPageIds).toEqual(['page-1']);
    fireEvent.click(screen.getByRole('button', { name: 'Exit Preview' }));
    await waitFor(() => { expect(retiredIds).toContain(createdIds[1]); });
  });

  it('loads snapshot inputs into a replacement and recomputes rather than hydrating computed output', async () => {
    mountPreview(); await answerField(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load Snapshot' }));
    await waitFor(() => { expect(createdIds).toHaveLength(2); });
    expect((await answerField(1)).value).toBe('snapshot answer');
    expect(retiredIds).toContain(createdIds[0]);
    expect(queryClient.getQueryData<ApiRunRuntime>(queryKeys.runRuntime(createdIds[1]))?.values).not.toContainEqual(expect.objectContaining({ value: 'stale computed' }));
    fireEvent.click(screen.getByRole('button', { name: /^Next/i })); await answerField(2);
    expect(serverValues.get(createdIds[1])?.['computed-output']).toBe('computed:snapshot answer');
  });

  it('ignores an advance arriving after reset while preserving the replacement draft', async () => {
    const response = pending<ApiAdvanceResult>();
    advanceMock.mockReturnValueOnce(response.promise);
    mountPreview();
    fireEvent.change(await answerField(1), { target: { value: 'old' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await waitFor(() => { expect(advanceMock).toHaveBeenCalledTimes(1); });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Preview' }));
    await waitFor(() => { expect(createdIds).toHaveLength(2); });
    fireEvent.change(await answerField(1), { target: { value: 'replacement draft' } });
    const sent = advanceMock.mock.calls[0][0] as { submissionKey: string };
    await act(async () => { response.resolve({ success: true, submissionKey: sent.submissionKey, values: { 'input-1': 'stale' }, blockStates: [], navigation: { nextPageId: 'page-2' } }); });
    expect((await answerField(1)).value).toBe('replacement draft');
    expect(queryClient.getQueryData<ApiRunRuntime>(queryKeys.runRuntime(createdIds[1]))?.run.currentPageId).toBe('page-1');
  });

  it('requires an explicit restart after a definition change', async () => {
    mountPreview(); await answerField(1);
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['preview-definition', PREVIEW_WORKFLOW] }); });
    definitionTitle = 'Changed workflow';
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['preview-definition', PREVIEW_WORKFLOW] }); });
    expect(await screen.findByRole('button', { name: 'Restart Preview' })).toBeTruthy();
    expect(createdIds).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Restart Preview' }));
    await waitFor(() => { expect(createdIds).toHaveLength(2); });
    await answerField(1);
    expect(retiredIds).toContain(createdIds[0]);
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Restart Preview' })).toBeNull(); });
  });

  it('submits page fill through advance', async () => {
    mountPreview(); await answerField(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fill Page' }));
    await answerField(2);
    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(serverValues.get(createdIds[0])?.['input-1']).toBe('filled page');
  });

  it('full-workflow fill submits every page in order instead of jumping to the end', async () => {
    mountPreview(); await answerField(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fill Workflow' }));
    await screen.findByText('Review your answers');
    expect(advanceMock.mock.calls.map(([args]) => (args as { pageId: string }).pageId)).toEqual(['page-1', 'page-2', 'page-3']);
    expect(serverValues.get(createdIds[0])).toMatchObject({ 'input-1': 'one', 'input-2': 'two', 'input-3': 'three' });
  });

  it('offers retry when session creation fails', async () => {
    const normalRequest = fetchAPIMock.getMockImplementation();
    let failCreation = true;
    fetchAPIMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/preview-runs') && failCreation) { failCreation = false; return Promise.reject(new Error('Creation unavailable')); }
      return normalRequest?.(url, init);
    });
    mountPreview();
    expect(await screen.findByText('Creation unavailable')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Retry Preview' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Preview' }));
    await answerField(1);
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
  });

  it('keeps a validation-failed draft editable and gives the corrected submit a new key', async () => {
    advanceMock.mockImplementationOnce(({ submissionKey }: { submissionKey: string }) => Promise.resolve({
      success: false, errors: ['Rejected answer'], values: {}, blockStates: [], navigation: null, submissionKey,
    }));
    mountPreview();
    fireEvent.change(await answerField(1), { target: { value: 'rejected draft' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await screen.findByText('Rejected answer');
    expect((await answerField(1)).value).toBe('rejected draft');
    fireEvent.change(await answerField(1), { target: { value: 'corrected draft' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    await answerField(2);
    const first = advanceMock.mock.calls[0][0] as { submissionKey: string };
    const second = advanceMock.mock.calls[1][0] as { submissionKey: string };
    expect(second.submissionKey).not.toBe(first.submissionKey);
    expect(serverValues.get(createdIds[0])?.['input-1']).toBe('corrected draft');
  });

  it('ignores generated fill values that arrive after a reset', async () => {
    const generated = pending<Record<string, unknown>>();
    fillPageMock.mockReturnValueOnce(generated.promise);
    mountPreview(); await answerField(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fill Page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset Preview' }));
    await waitFor(() => { expect(createdIds).toHaveLength(2); });
    await act(async () => { generated.resolve({ 'input-1': 'obsolete fill' }); });
    expect((await answerField(1)).value).toBe('');
    expect(advanceMock).not.toHaveBeenCalled();
  });
});
