// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRunValues } from '../../../client/src/hooks/runner/useRunValues';
import * as offlineBuffer from '../../../client/src/lib/runner/offlineBuffer';
import { fetchAPI } from '@/lib/vault-api';

vi.mock('@/lib/vault-api', () => ({
  fetchAPI: vi.fn(),
}));

describe('useRunValues with offline buffering and conflict recovery', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    offlineBuffer.resetMemoryFallback();
    await offlineBuffer.clearOfflineBuffer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates initial values and merges uncommitted offline buffered values', async () => {
    // Pre-populate offline buffer with an uncommitted step value
    await offlineBuffer.bufferStepValues('run-100', [
      { stepId: 'step-offline', value: 'offline-draft' },
    ]);

    const initialRun = {
      values: [{ stepId: 'step-server', value: 'server-value' }],
    };

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-100',
        run: initialRun,
        previewState: null,
        previewEnvironment: null,
      })
    );

    // Wait for async hydration of buffered items
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.formValues).toMatchObject({
      'step-server': 'server-value',
      'step-offline': 'offline-draft',
    });
  });

  it('hydrates a buffered value over an older server snapshot when the field stayed untouched', async () => {
    await offlineBuffer.bufferStepValues('run-buffer-wins', [
      {
        stepId: 'step-1',
        value: 'newer-offline-draft',
        clientTimestamp: new Date('2026-08-05T10:00:00Z').getTime(),
        clientRevision: 2,
      },
    ]);
    const initialRun = {
      values: [
        {
          stepId: 'step-1',
          value: 'older-server-value',
          updatedAt: '2026-08-05T09:00:00.000Z',
        },
      ],
    };

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-buffer-wins',
        run: initialRun,
        previewState: null,
        previewEnvironment: null,
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.formValues['step-1']).toBe('newer-offline-draft');
  });

  it('preserves a local edit and its timestamp when IndexedDB hydration resolves late', async () => {
    let resolveBufferedRead: ((entries: offlineBuffer.BufferedStepValue[]) => void) | undefined;
    const bufferedRead = new Promise<offlineBuffer.BufferedStepValue[]>((resolve) => {
      resolveBufferedRead = resolve;
    });
    vi.spyOn(offlineBuffer, 'getBufferedStepValues').mockReturnValue(bufferedRead);
    vi.mocked(fetchAPI).mockResolvedValue({ success: true });

    const staleBufferedTimestamp = new Date('2026-08-01T09:00:00Z').getTime();
    const initialRun = {
      values: [
        {
          stepId: 'step-1',
          value: 'server-value',
          updatedAt: '2026-08-02T09:00:00.000Z',
        },
      ],
    };
    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-late-hydration',
        run: initialRun,
        previewState: null,
        previewEnvironment: null,
      })
    );

    const editStartedAt = Date.now();
    act(() => {
      result.current.handleUpdateValue('step-1', 'fresh-local-edit');
    });

    await act(async () => {
      resolveBufferedRead?.([
        {
          id: 'run-late-hydration:step-1',
          runId: 'run-late-hydration',
          stepId: 'step-1',
          value: 'stale-buffered-value',
          clientTimestamp: staleBufferedTimestamp,
          clientRevision: 1,
          status: 'pending',
        },
      ]);
      await bufferedRead;
    });

    expect(result.current.formValues['step-1']).toBe('fresh-local-edit');

    await act(async () => {
      await result.current.saveNow();
    });

    const saveCall = vi.mocked(fetchAPI).mock.calls.at(-1);
    expect(saveCall).toBeDefined();
    const payload = JSON.parse((saveCall?.[1] as { body: string }).body) as {
      values: Array<{ stepId: string; value: string; clientTimestamp: number }>;
    };
    const savedStep = payload.values.find((entry) => entry.stepId === 'step-1');
    expect(savedStep?.value).toBe('fresh-local-edit');
    expect(savedStep?.clientTimestamp).toBeGreaterThanOrEqual(editStartedAt);
  });

  it('buffers values to offline store when save fails due to network', async () => {
    const fetchApiMock = vi.mocked(fetchAPI).mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-200',
        run: { values: [] },
        previewState: null,
        previewEnvironment: null,
      })
    );

    act(() => {
      result.current.handleUpdateValue('step-1', 'new-answer');
    });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(fetchApiMock).toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('offline');

    const buffered = await offlineBuffer.getBufferedStepValues('run-200');
    expect(buffered).toHaveLength(1);
    expect(buffered[0].stepId).toBe('step-1');
    expect(buffered[0].value).toBe('new-answer');
  });

  it('flushes buffered values upon successful save and updates conflicts if returned', async () => {
    await offlineBuffer.bufferStepValues('run-300', [
      { stepId: 'step-1', value: 'my-draft' },
    ]);

    const fetchApiMock = vi.mocked(fetchAPI).mockResolvedValue({
      success: true,
      conflicts: [
        {
          stepId: 'step-1',
          serverValue: 'server-authority-value',
          serverUpdatedAt: new Date().toISOString(),
        },
      ],
    });

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-300',
        run: { values: [] },
        previewState: null,
        previewEnvironment: null,
      })
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    act(() => {
      result.current.handleUpdateValue('step-1', 'my-draft');
    });

    await act(async () => {
      await result.current.saveNow();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchApiMock).toHaveBeenCalled();
    // Conflict server value should override local draft
    expect(result.current.formValues['step-1']).toBe('server-authority-value');

    // Buffered values should have been cleared after flush
    const remaining = await offlineBuffer.getBufferedStepValues('run-300');
    expect(remaining).toHaveLength(0);
  });

  it('preserves in-flight local edits when a conflict response arrives for an earlier submitted snapshot', async () => {
    let resolveSave: ((val: unknown) => void) | undefined;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    vi.mocked(fetchAPI)
      .mockReturnValueOnce(savePromise as never)
      .mockResolvedValue({ success: true });

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-inflight',
        run: { values: [] },
        previewState: null,
        previewEnvironment: null,
      })
    );

    // Initial edit: user types 'draft-1'
    act(() => {
      result.current.handleUpdateValue('step-1', 'draft-1');
    });

    // Start saving 'draft-1' (in-flight request)
    let saveExecution: Promise<void>;
    act(() => {
      saveExecution = result.current.saveNow();
    });

    // While save is in-flight, user types 'newer-draft-2'
    act(() => {
      result.current.handleUpdateValue('step-1', 'newer-draft-2');
    });

    // Server responds with a conflict for the first in-flight draft
    await act(async () => {
      resolveSave?.({
        success: true,
        conflicts: [
          {
            stepId: 'step-1',
            serverValue: 'server-stale-conflict',
            serverUpdatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveExecution!;
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // User's newer local edit MUST be preserved and not clobbered by server-stale-conflict!
    expect(result.current.formValues['step-1']).toBe('newer-draft-2');
  });

  it('tracks per-step timestamps so editing one field does not mark other fields newly edited', async () => {
    const initialRun = {
      values: [
        { stepId: 'step-1', value: 'old-val-1', updatedAt: '2026-08-01T00:00:00.000Z' },
        { stepId: 'step-2', value: 'old-val-2', updatedAt: '2026-08-01T00:00:00.000Z' },
      ],
    };

    const fetchApiMock = vi.mocked(fetchAPI).mockResolvedValue({ success: true });

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-per-step',
        run: initialRun,
        previewState: null,
        previewEnvironment: null,
      })
    );

    // Edit ONLY step-2
    act(() => {
      result.current.handleUpdateValue('step-2', 'new-val-2');
    });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(fetchApiMock).toHaveBeenCalled();
    const lastCall = fetchApiMock.mock.calls[fetchApiMock.mock.calls.length - 1];
    const body = JSON.parse((lastCall[1] as { body: string }).body) as {
      values: Array<{ stepId: string; value: string; clientTimestamp: number }>;
    };

    const step1Entry = body.values.find((v) => v.stepId === 'step-1');
    const step2Entry = body.values.find((v) => v.stepId === 'step-2');

    expect(step1Entry).toBeDefined();
    expect(step2Entry).toBeDefined();

    // Step 1 retains its initial 2026-08-01 timestamp (not updated to Date.now())
    const initialTime = new Date('2026-08-01T00:00:00.000Z').getTime();
    expect(step1Entry!.clientTimestamp).toBe(initialTime);

    // Step 2 has the recent edit timestamp
    expect(step2Entry!.clientTimestamp).toBeGreaterThan(initialTime);
  });

  it('safely handles reconnect flush with conflict recovery and does not overwrite server value on subsequent save', async () => {
    // Stage an offline draft in IndexedDB
    await offlineBuffer.bufferStepValues('run-reconnect', [
      { stepId: 'step-1', value: 'offline-edit', clientTimestamp: new Date('2026-08-05T09:00:00Z').getTime() },
    ]);

    const fetchApiMock = vi.mocked(fetchAPI).mockResolvedValue({
      success: true,
      conflicts: [
        {
          stepId: 'step-1',
          serverValue: 'authoritative-server-value',
          serverUpdatedAt: new Date('2026-08-05T09:30:00Z').toISOString(),
        },
      ],
    });

    const { result } = renderHook(() =>
      useRunValues({
        mode: 'production',
        actualRunId: 'run-reconnect',
        run: { values: [] },
        previewState: null,
        previewEnvironment: null,
      })
    );

    // Simulate reconnect event
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchApiMock).toHaveBeenCalled();
    // Conflict is reconciled into formValues
    expect(result.current.formValues['step-1']).toBe('authoritative-server-value');

    // Subsequent live save sends updated timestamp corresponding to the reconciled server value
    await act(async () => {
      await result.current.saveNow();
    });

    const secondCall = fetchApiMock.mock.calls[fetchApiMock.mock.calls.length - 1];
    const parsedBody = JSON.parse((secondCall[1] as { body: string }).body) as {
      values: Array<{ stepId: string; value: string; clientTimestamp: number }>;
    };

    const step1Payload = parsedBody.values.find((v) => v.stepId === 'step-1');
    expect(step1Payload?.value).toBe('authoritative-server-value');
    expect(step1Payload?.clientTimestamp).toBe(new Date('2026-08-05T09:30:00Z').getTime());
  });
});
