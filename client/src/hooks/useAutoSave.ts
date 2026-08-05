import { useState, useEffect, useRef, useCallback } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline" | "syncing";

export interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  onOfflineSave?: (data: T) => Promise<void> | void;
  onReconnect?: () => Promise<void> | void;
  delay?: number; // Debounce delay in milliseconds
  enabled?: boolean;
}

export interface UseAutoSaveReturn {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  saveNow: () => Promise<void>;
  hasUnsavedChanges: boolean;
  isOnline: boolean;
}

function getInitialOnlineStatus(): boolean {
  if (typeof window !== "undefined" && typeof window.navigator !== "undefined") {
    return typeof window.navigator.onLine === "boolean" ? window.navigator.onLine : true;
  }
  return true;
}

export function isNetworkOrOfflineError(error: unknown): boolean {
  if (typeof window !== "undefined" && typeof window.navigator !== "undefined" && window.navigator.onLine === false) {
    return true;
  }
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch") || msg.includes("load failed");
  }
  if (error && typeof error === "object") {
    const errObj = error as { name?: string; code?: string; message?: string };
    if (errObj.name === "NetworkError" || errObj.code === "ECONNREFUSED" || errObj.code === "ENOTFOUND") {
      return true;
    }
  }
  return false;
}

async function handleOfflineFallback<T>(
  dataToSave: T,
  onOfflineSave?: (data: T) => Promise<void> | void
): Promise<void> {
  if (onOfflineSave) {
    try {
      await onOfflineSave(dataToSave);
    } catch (offlineErr) {
      console.warn("Offline buffering error:", offlineErr);
    }
  }
}

/**
 * Resilient hook for auto-saving data with debouncing, offline buffering, and reconnect synchronization.
 *
 * Saves are serialized. If data changes while a save is in flight, the active
 * queue drains the newest revision before resolving. Network drops seamlessly
 * transition to offline status and trigger an automatic flush upon reconnection.
 */
export function useAutoSave<T>({
  data,
  onSave,
  onOfflineSave,
  onReconnect,
  delay = 2000,
  enabled = true,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChangesState] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(getInitialOnlineStatus);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const currentDataRef = useRef<T>(data);
  const currentRevisionRef = useRef(0);
  const persistedRevisionRef = useRef(0);
  const lastObservedDataRef = useRef(JSON.stringify(data));
  const hasUnsavedChangesRef = useRef(false);
  const saveQueueRef = useRef<Promise<void> | null>(null);
  const onSaveRef = useRef(onSave);
  const onOfflineSaveRef = useRef(onOfflineSave);
  const onReconnectRef = useRef(onReconnect);
  const mountedRef = useRef(true);

  currentDataRef.current = data;
  onSaveRef.current = onSave;
  onOfflineSaveRef.current = onOfflineSave;
  onReconnectRef.current = onReconnect;

  const serializedData = JSON.stringify(data);
  if (serializedData !== lastObservedDataRef.current) {
    lastObservedDataRef.current = serializedData;
    currentRevisionRef.current += 1;
  }

  const setHasUnsavedChanges = useCallback((value: boolean): void => {
    hasUnsavedChangesRef.current = value;
    if (mountedRef.current) {
      setHasUnsavedChangesState(value);
    }
  }, []);

  const clearIdleTimeout = useCallback((): void => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = undefined;
    }
  }, []);

  const executeSingleSaveStep = useCallback(
    async (revisionToSave: number, dataToSave: T): Promise<'success' | 'offline' | 'error'> => {
      const currentlyOnline = typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : true;

      if (!currentlyOnline) {
        if (mountedRef.current) {
          setSaveStatus("offline");
        }
        await handleOfflineFallback(dataToSave, onOfflineSaveRef.current);
        setHasUnsavedChanges(true);
        return 'offline';
      }

      if (mountedRef.current) {
        setSaveStatus((prev) => (prev === "offline" ? "syncing" : "saving"));
      }

      try {
        await onSaveRef.current(dataToSave);
        persistedRevisionRef.current = revisionToSave;
        if (mountedRef.current) {
          setLastSavedAt(new Date());
        }
        return 'success';
      } catch (error) {
        if (isNetworkOrOfflineError(error)) {
          if (mountedRef.current) {
            setSaveStatus("offline");
          }
          await handleOfflineFallback(dataToSave, onOfflineSaveRef.current);
          setHasUnsavedChanges(true);
          return 'offline';
        }

        console.error("Auto-save error:", error);
        setHasUnsavedChanges(true);
        if (mountedRef.current) {
          setSaveStatus("error");
        }
        return 'error';
      }
    },
    [setHasUnsavedChanges]
  );

  const drainSaveQueue = useCallback(async (): Promise<void> => {
    let completedLatestRevision = false;

    while (persistedRevisionRef.current < currentRevisionRef.current) {
      const revisionToSave = currentRevisionRef.current;
      const dataToSave = currentDataRef.current;

      clearIdleTimeout();

      const result = await executeSingleSaveStep(revisionToSave, dataToSave);
      if (result !== 'success') {
        return;
      }

      completedLatestRevision = revisionToSave === currentRevisionRef.current;
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
  }, [clearIdleTimeout, executeSingleSaveStep, setHasUnsavedChanges]);

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

  const saveNow = useCallback(async (): Promise<void> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    await requestSave();
  }, [requestSave]);

  // Network online/offline event listeners
  useEffect(() => {
    const handleOnline = (): void => {
      if (mountedRef.current) {
        setIsOnline(true);
        setSaveStatus("syncing");
      }
      if (onReconnectRef.current) {
        Promise.resolve(onReconnectRef.current())
          .catch((err) => {
            console.warn("Error during reconnect handler:", err);
          })
          .finally(() => {
            void requestSave();
          });
      } else {
        void requestSave();
      }
    };

    const handleOffline = (): void => {
      if (mountedRef.current) {
        setIsOnline(false);
        setSaveStatus("offline");
      }
      if (onOfflineSaveRef.current) {
        void onOfflineSaveRef.current(currentDataRef.current);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [requestSave]);

  // Auto-save effect with debouncing
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

  // Save on unmount or beforeunload if there are unsaved changes
  useEffect(() => {
    mountedRef.current = true;

    const handleBeforeUnload = (): void => {
      if (hasUnsavedChangesRef.current && !saveQueueRef.current) {
        // Fire and forget keepalive or offline buffer
        if (typeof navigator !== "undefined" && navigator.onLine === false && onOfflineSaveRef.current) {
          void onOfflineSaveRef.current(currentDataRef.current);
        } else {
          onSaveRef.current(currentDataRef.current).catch(console.error);
        }
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
        if (typeof navigator !== "undefined" && navigator.onLine === false && onOfflineSaveRef.current) {
          void onOfflineSaveRef.current(currentDataRef.current);
        } else {
          onSaveRef.current(currentDataRef.current).catch(console.error);
        }
      }
    };
  }, [clearIdleTimeout]);

  return {
    saveStatus,
    lastSavedAt,
    saveNow,
    hasUnsavedChanges,
    isOnline,
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
