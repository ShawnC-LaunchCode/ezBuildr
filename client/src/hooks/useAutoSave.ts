import { useState, useEffect, useRef, useCallback } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  delay?: number; // Debounce delay in milliseconds
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  saveNow: () => Promise<void>;
  hasUnsavedChanges: boolean;
}

/**
 * Hook for auto-saving data with debouncing.
 *
 * Saves are serialized. If data changes while a save is in flight, the active
 * queue drains the newest revision before resolving. A failed revision remains
 * dirty and can be retried by the next debounced or manual save.
 */
export function useAutoSave<T>({
  data,
  onSave,
  delay = 2000, // Default: 2 seconds after user stops typing
  enabled = true,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChangesState] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const currentDataRef = useRef<T>(data);
  const currentRevisionRef = useRef(0);
  const persistedRevisionRef = useRef(0);
  const lastObservedDataRef = useRef(JSON.stringify(data));
  const hasUnsavedChangesRef = useRef(false);
  const saveQueueRef = useRef<Promise<void> | null>(null);
  const onSaveRef = useRef(onSave);
  const mountedRef = useRef(true);

  // Update these during render so saveNow always sees the props from the render
  // that exposed it, rather than a previous effect's data.
  currentDataRef.current = data;
  onSaveRef.current = onSave;
  const serializedData = JSON.stringify(data);
  if (serializedData !== lastObservedDataRef.current) {
    lastObservedDataRef.current = serializedData;
    currentRevisionRef.current += 1;
  }

  const setHasUnsavedChanges = useCallback((value: boolean) => {
    hasUnsavedChangesRef.current = value;
    if (mountedRef.current) {
      setHasUnsavedChangesState(value);
    }
  }, []);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = undefined;
    }
  }, []);

  const drainSaveQueue = useCallback(async () => {
    let completedLatestRevision = false;

    while (persistedRevisionRef.current < currentRevisionRef.current) {
      const revisionToSave = currentRevisionRef.current;
      const dataToSave = currentDataRef.current;

      clearIdleTimeout();
      if (mountedRef.current) {
        setSaveStatus("saving");
      }

      try {
        await onSaveRef.current(dataToSave);
      } catch (error) {
        console.error("Auto-save error:", error);
        setHasUnsavedChanges(true);
        if (mountedRef.current) {
          setSaveStatus("error");
        }
        return;
      }

      persistedRevisionRef.current = revisionToSave;
      completedLatestRevision =
        revisionToSave === currentRevisionRef.current;

      if (mountedRef.current) {
        setLastSavedAt(new Date());
      }

      // If another render supplied newer data during await, the loop continues
      // without briefly claiming that all changes have been saved.
      if (!completedLatestRevision) {
        setHasUnsavedChanges(true);
      }
    }

    if (completedLatestRevision) {
      setHasUnsavedChanges(false);
      if (mountedRef.current) {
        setSaveStatus("saved");
        idleTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setSaveStatus("idle");
          }
        }, 2000);
      }
    }
  }, [clearIdleTimeout, setHasUnsavedChanges]);

  const requestSave = useCallback((): Promise<void> => {
    if (persistedRevisionRef.current >= currentRevisionRef.current) {
      return Promise.resolve();
    }

    if (!saveQueueRef.current) {
      const queue = drainSaveQueue();
      const queueWithCleanup: Promise<void> = queue.finally(() => {
        if (saveQueueRef.current === queueWithCleanup) {
          saveQueueRef.current = null;
        }
      });
      saveQueueRef.current = queueWithCleanup;
    }

    return saveQueueRef.current;
  }, [drainSaveQueue]);

  // Manual save trigger. The shared queue promise includes any newer revision
  // discovered while an earlier save is awaiting its network response.
  const saveNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    await requestSave();
  }, [requestSave]);

  // Auto-save effect with debouncing.
  useEffect(() => {
    if (!enabled || persistedRevisionRef.current >= currentRevisionRef.current) {
      return;
    }

    setHasUnsavedChanges(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      void requestSave();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [data, delay, enabled, requestSave, setHasUnsavedChanges]);

  // Save on unmount or beforeunload if there are unsaved changes.
  useEffect(() => {
    mountedRef.current = true;

    const handleBeforeUnload = (): void => {
      if (hasUnsavedChangesRef.current && !saveQueueRef.current) {
        // Fire and forget - callers can use a keepalive request in onSave.
        onSaveRef.current(currentDataRef.current).catch(console.error);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearIdleTimeout();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (hasUnsavedChangesRef.current && !saveQueueRef.current) {
        // Fire and forget - we're unmounting.
        onSaveRef.current(currentDataRef.current).catch(console.error);
      }
    };
  }, [clearIdleTimeout]);

  return {
    saveStatus,
    lastSavedAt,
    saveNow,
    hasUnsavedChanges,
  };
}

/**
 * Utility to format last saved time
 */
export function formatLastSaved(lastSavedAt: Date | null): string {
  if (!lastSavedAt) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - lastSavedAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 10) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return lastSavedAt.toLocaleString();
}
