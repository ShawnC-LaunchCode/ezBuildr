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
 * Hook for auto-saving data with debouncing
 * Tracks save status and provides manual save trigger
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
  const hasUnsavedChangesRef = useRef(false);

  const setHasUnsavedChanges = useCallback((value: boolean) => {
    setHasUnsavedChangesState(value);
    hasUnsavedChangesRef.current = value;
  }, []);

  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<T>(data);
  const currentDataRef = useRef<T>(data);
  const isSavingRef = useRef(false);

  // Keep current data ref up to date
  useEffect(() => {
    currentDataRef.current = data;
  }, [data]);

  // Function to perform the actual save
  const performSave = useCallback(async () => {
    if (isSavingRef.current) {
      return;
    }

    const dataToSave = data;
    lastSavedDataRef.current = dataToSave; // Set immediately to prevent re-triggering during await

    try {
      isSavingRef.current = true;
      setSaveStatus("saving");
      await onSave(dataToSave);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);

      // Reset to idle after showing "saved" for a moment
      setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Auto-save error:", error);
      // Revert since save failed
      lastSavedDataRef.current = currentDataRef.current !== dataToSave ? currentDataRef.current : dataToSave; // actually we just want to ensure it tries again
      setHasUnsavedChanges(true);
      setSaveStatus("error");
    } finally {
      isSavingRef.current = false;
    }
  }, [data, onSave]);

  // Manual save trigger
  const saveNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    await performSave();
  }, [performSave]);

  // Auto-save effect with debouncing
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Check if data has changed
    const dataChanged = JSON.stringify(data) !== JSON.stringify(lastSavedDataRef.current);

    if (dataChanged) {
      setHasUnsavedChanges(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout for debounced save
      timeoutRef.current = setTimeout(() => {
        void performSave();
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, performSave]);

  // Save on unmount or beforeunload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (hasUnsavedChangesRef.current && !isSavingRef.current) {
        // Fire and forget - using keepalive in fetch
        onSave(currentDataRef.current).catch(console.error);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (hasUnsavedChangesRef.current && !isSavingRef.current) {
        // Fire and forget - we're unmounting
        onSave(currentDataRef.current).catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only run on mount/unmount
  }, []);

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
