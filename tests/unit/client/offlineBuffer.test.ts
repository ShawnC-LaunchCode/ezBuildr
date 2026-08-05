// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  bufferStepValues,
  getBufferedStepValues,
  removeBufferedStepValues,
  getAllBufferedRuns,
  countPendingBufferedValues,
  clearOfflineBuffer,
  resetMemoryFallback,
} from '../../../client/src/lib/runner/offlineBuffer';

describe('offlineBuffer (Memory & IndexedDB Fallback)', () => {
  beforeEach(async () => {
    resetMemoryFallback();
    await clearOfflineBuffer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buffers step values and retrieves them for a specific run', async () => {
    await bufferStepValues('run-123', [
      { stepId: 'step-1', value: 'Alice' },
      { stepId: 'step-2', value: 42 },
    ]);

    const buffered = await getBufferedStepValues('run-123');
    expect(buffered).toHaveLength(2);
    expect(buffered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: 'run-123', stepId: 'step-1', value: 'Alice', status: 'pending' }),
        expect.objectContaining({ runId: 'run-123', stepId: 'step-2', value: 42, status: 'pending' }),
      ])
    );
  });

  it('overwrites previous buffered value for the same run and stepId', async () => {
    await bufferStepValues('run-123', [{ stepId: 'step-1', value: 'draft-1' }]);
    await bufferStepValues('run-123', [{ stepId: 'step-1', value: 'draft-2' }]);

    const buffered = await getBufferedStepValues('run-123');
    expect(buffered).toHaveLength(1);
    expect(buffered[0].value).toBe('draft-2');
  });

  it('removes specific step values after synchronization', async () => {
    await bufferStepValues('run-abc', [
      { stepId: 'step-1', value: 'one' },
      { stepId: 'step-2', value: 'two' },
      { stepId: 'step-3', value: 'three' },
    ]);

    await removeBufferedStepValues('run-abc', ['step-1', 'step-3']);

    const remaining = await getBufferedStepValues('run-abc');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].stepId).toBe('step-2');
  });

  it('removes all buffered values for a run', async () => {
    await bufferStepValues('run-xyz', [
      { stepId: 'step-1', value: 'a' },
      { stepId: 'step-2', value: 'b' },
    ]);

    await removeBufferedStepValues('run-xyz');
    const remaining = await getBufferedStepValues('run-xyz');
    expect(remaining).toHaveLength(0);
  });

  it('lists all distinct runs with buffered values and counts pending items', async () => {
    await bufferStepValues('run-1', [{ stepId: 's1', value: 'v1' }]);
    await bufferStepValues('run-2', [
      { stepId: 's1', value: 'v1' },
      { stepId: 's2', value: 'v2' },
    ]);

    const runs = await getAllBufferedRuns();
    expect(runs).toContain('run-1');
    expect(runs).toContain('run-2');

    const totalCount = await countPendingBufferedValues();
    expect(totalCount).toBe(3);

    const run2Count = await countPendingBufferedValues('run-2');
    expect(run2Count).toBe(2);
  });

  it('handles empty inputs gracefully', async () => {
    await bufferStepValues('', []);
    const buffered = await getBufferedStepValues('');
    expect(buffered).toEqual([]);
  });
});

describe('offlineBuffer with IndexedDB Mock Interface', () => {
  beforeEach(async () => {
    resetMemoryFallback();
    // Create an in-memory mock IDB database to simulate the exact IndexedDB callbacks
    const fakeStore = new Map<string, unknown>();

    const mockIdbStore = {
      put: vi.fn((item: { id: string }) => {
        fakeStore.set(item.id, item);
      }),
      delete: vi.fn((key: string) => {
        fakeStore.delete(key);
      }),
      clear: vi.fn(() => {
        fakeStore.clear();
      }),
      count: vi.fn(() => {
        const req = {
          result: fakeStore.size,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      index: vi.fn((_indexName: string) => ({
        getAll: vi.fn(() => {
          const results = Array.from(fakeStore.values());
          const req = {
            result: results,
            onsuccess: null as (() => void) | null,
            onerror: null as (() => void) | null,
          };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
        count: vi.fn(() => {
          const req = {
            result: fakeStore.size,
            onsuccess: null as (() => void) | null,
            onerror: null as (() => void) | null,
          };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
        openKeyCursor: vi.fn(() => {
          const req = {
            result: null,
            onsuccess: null as (() => void) | null,
            onerror: null as (() => void) | null,
          };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
      })),
    };

    const mockTx = {
      objectStore: vi.fn(() => mockIdbStore),
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
    };

    const mockDb = {
      transaction: vi.fn(() => {
        setTimeout(() => mockTx.oncomplete?.(), 0);
        return mockTx;
      }),
      objectStoreNames: {
        contains: vi.fn(() => true),
      },
      createObjectStore: vi.fn(() => ({
        createIndex: vi.fn(),
      })),
      onclose: null as (() => void) | null,
    };

    const openRequest = {
      result: mockDb,
      error: null,
      onupgradeneeded: null as ((ev: unknown) => void) | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onblocked: null as (() => void) | null,
    };

    (window as unknown as { indexedDB: unknown }).indexedDB = {
      open: vi.fn(() => {
        setTimeout(() => openRequest.onsuccess?.(), 0);
        return openRequest;
      }),
    };
    (window as unknown as { IDBKeyRange: unknown }).IDBKeyRange = {
      only: vi.fn((val) => val),
    };
  });

  afterEach(() => {
    resetMemoryFallback();
    vi.restoreAllMocks();
  });

  it('uses native IndexedDB when available to buffer and clear records', async () => {
    await bufferStepValues('run-idb-1', [
      { stepId: 'step-a', value: 'hello-idb' },
    ]);

    const buffered = await getBufferedStepValues('run-idb-1');
    expect(buffered.length).toBeGreaterThan(0);

    await removeBufferedStepValues('run-idb-1', ['step-a']);
    await clearOfflineBuffer();
  });
});
