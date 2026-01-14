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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastDataRef = useRef<T>(data);
  const isSavingRef = useRef(false);

  // Function to perform the actual save
  const performSave = useCallback(async () => {
    if (isSavingRef.current) {return;}

    try {
      isSavingRef.current = true;
      setSaveStatus("saving");
      await onSave(data);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      lastDataRef.current = data;

      // Reset to idle after showing "saved" for a moment
      setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Auto-save error:", error);
      setSaveStatus("error");
      // Reset to idle after showing error
      setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
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
    if (!enabled) {return;}

    // Check if data has changed
    const dataChanged = JSON.stringify(data) !== JSON.stringify(lastDataRef.current);

    if (dataChanged) {
      setHasUnsavedChanges(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout for debounced save
      timeoutRef.current = setTimeout(() => {
        performSave();
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, performSave]);

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (hasUnsavedChanges && !isSavingRef.current) {
        // Fire and forget - we're unmounting
        onSave(lastDataRef.current).catch(console.error);
      }
    };
  }, []); // Empty deps intentionally - only on unmount

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
  if (!lastSavedAt) {return "";}

  const now = new Date();
  const diffMs = now.getTime() - lastSavedAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 10) {return "just now";}
  if (diffSeconds < 60) {return `${diffSeconds}s ago`;}
  if (diffMinutes < 60) {return `${diffMinutes}m ago`;}
  if (diffHours < 24) {return `${diffHours}h ago`;}

  return lastSavedAt.toLocaleString();
}
