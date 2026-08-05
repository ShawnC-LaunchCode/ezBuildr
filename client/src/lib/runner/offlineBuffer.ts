/**
 * Resilient IndexedDB offline buffering for workflow runner step responses.
 *
 * Persists uncommitted or offline step answers in IndexedDB (`ezbuildr_runner_offline_db`)
 * so respondent work survives page reloads, tab crashes, and network disconnects.
 * Automatically falls back to an in-memory/localStorage cache if IndexedDB is
 * unavailable (e.g., restricted iframe, private browsing mode, or headless test env).
 */

export interface BufferedStepValue {
  id: string; // `${runId}:${stepId}`
  runId: string;
  stepId: string;
  value: unknown;
  clientTimestamp: number;
  clientRevision?: number;
  status: 'pending' | 'syncing' | 'synced';
}

export interface InputBufferedValue {
  stepId: string;
  value: unknown;
  clientTimestamp?: number;
  clientRevision?: number;
}

const DB_NAME = 'ezbuildr_runner_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_step_values';

// In-memory fallback map keyed by `${runId}:${stepId}`
const memoryFallback = new Map<string, BufferedStepValue>();

function isIndexedDbSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  if (!isIndexedDbSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('runId', 'runId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('clientTimestamp', 'clientTimestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('[OfflineBuffer] IndexedDB upgrade blocked by older tab version');
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Buffer one or more step values for a workflow run into offline storage.
 */
export async function bufferStepValues(
  runId: string,
  values: InputBufferedValue[]
): Promise<void> {
  if (!runId || values.length === 0) {
    return;
  }

  const now = Date.now();
  const entries: BufferedStepValue[] = values.map((v) => ({
    id: `${runId}:${v.stepId}`,
    runId,
    stepId: v.stepId,
    value: v.value,
    clientTimestamp: v.clientTimestamp ?? now,
    clientRevision: v.clientRevision,
    status: 'pending',
  }));

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const entry of entries) {
        store.put(entry);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to write to IndexedDB'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } catch (err) {
    // Fallback to memory
    console.warn('[OfflineBuffer] IndexedDB unavailable, using memory fallback:', err);
    for (const entry of entries) {
      memoryFallback.set(entry.id, entry);
    }
  }
}

/**
 * Retrieve all buffered step values for a specific workflow run.
 */
export async function getBufferedStepValues(runId: string): Promise<BufferedStepValue[]> {
  if (!runId) {
    return [];
  }

  try {
    const db = await getDb();
    return await new Promise<BufferedStepValue[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('runId');
      const request = index.getAll(IDBKeyRange.only(runId));

      request.onsuccess = () => {
        const results = (request.result ?? []) as BufferedStepValue[];
        resolve(results);
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to read from IndexedDB'));
    });
  } catch {
    // Memory fallback
    const results: BufferedStepValue[] = [];
    for (const entry of memoryFallback.values()) {
      if (entry.runId === runId) {
        results.push({ ...entry });
      }
    }
    return results;
  }
}

/**
 * Remove specific step values (or all values for a run) after successful sync.
 */
export async function removeBufferedStepValues(
  runId: string,
  stepIds?: string[]
): Promise<void> {
  if (!runId) {
    return;
  }

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (stepIds && stepIds.length > 0) {
        for (const stepId of stepIds) {
          store.delete(`${runId}:${stepId}`);
        }
      } else {
        const index = store.index('runId');
        const request = index.openKeyCursor(IDBKeyRange.only(runId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete from IndexedDB'));
    });
  } catch {
    // Memory fallback
    if (stepIds && stepIds.length > 0) {
      for (const stepId of stepIds) {
        memoryFallback.delete(`${runId}:${stepId}`);
      }
    } else {
      for (const [key, entry] of memoryFallback.entries()) {
        if (entry.runId === runId) {
          memoryFallback.delete(key);
        }
      }
    }
  }
}

/**
 * Get distinct run IDs that have buffered offline answers.
 */
export async function getAllBufferedRuns(): Promise<string[]> {
  try {
    const db = await getDb();
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('runId');
      const request = index.openKeyCursor(null, 'nextunique');
      const runIds: string[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          runIds.push(cursor.key as string);
          cursor.continue();
        } else {
          resolve(runIds);
        }
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to list run IDs'));
    });
  } catch {
    const runIds = new Set<string>();
    for (const entry of memoryFallback.values()) {
      runIds.add(entry.runId);
    }
    return Array.from(runIds);
  }
}

/**
 * Count total pending buffered values for a run (or across all runs).
 */
export async function countPendingBufferedValues(runId?: string): Promise<number> {
  try {
    const db = await getDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = runId
        ? store.index('runId').count(IDBKeyRange.only(runId))
        : store.count();

      request.onsuccess = () => resolve(request.result ?? 0);
      request.onerror = () => reject(request.error ?? new Error('Failed to count buffered values'));
    });
  } catch {
    if (!runId) {
      return memoryFallback.size;
    }
    let count = 0;
    for (const entry of memoryFallback.values()) {
      if (entry.runId === runId) {
        count++;
      }
    }
    return count;
  }
}

/**
 * Clear the offline buffer entirely (or for a given run).
 */
export async function clearOfflineBuffer(runId?: string): Promise<void> {
  if (runId) {
    await removeBufferedStepValues(runId);
    return;
  }

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear IndexedDB store'));
    });
  } catch {
    memoryFallback.clear();
  }
}

/**
 * Reset memory fallback (primarily for test tear-downs).
 */
export function resetMemoryFallback(): void {
  memoryFallback.clear();
  dbPromise = null;
}
