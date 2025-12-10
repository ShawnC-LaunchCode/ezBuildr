/**
 * usePreviewSession - React hook for preview session management
 *
 * @deprecated This hook is deprecated in favor of PreviewEnvironment + usePreviewEnvironment.
 * PreviewEnvironment provides better performance, cleaner state management, and avoids
 * infinite loop issues. Use PreviewEnvironment for all new code.
 *
 * Provides React-integrated access to PreviewSession with automatic
 * state synchronization and lifecycle management.
 */

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { PreviewSession, type PreviewSessionOptions } from '@/lib/preview/PreviewSession';

// Stable empty object to prevent infinite loops when session is null
const EMPTY_VALUES = {};

/**
 * Hook to create and manage a preview session
 *
 * @deprecated Use PreviewEnvironment + usePreviewEnvironment instead for better performance
 * and to avoid infinite loop issues.
 */
export function usePreviewSession(options: PreviewSessionOptions | null) {
  const [session, setSession] = useState<PreviewSession | null>(null);

  // Create session on mount or when options change
  useEffect(() => {
    if (!options) {
      setSession(null);
      return;
    }

    const newSession = new PreviewSession(options);
    setSession(newSession);

    // Cleanup on unmount
    return () => {
      newSession.destroy();
    };
  }, [options?.workflowId]); // Only recreate if workflowId changes

  return session;
}

/**
 * Hook to subscribe to preview session values
 * Automatically re-renders when values change
 *
 * @deprecated Use PreviewEnvironment + usePreviewEnvironment instead for better performance
 * and to avoid infinite loop issues.
 */
export function usePreviewSessionValues(session: PreviewSession | null) {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!session) return () => {};
      return session.subscribe(callback);
    },
    [session]
  );

  const getSnapshot = useCallback(() => {
    if (!session) return EMPTY_VALUES;
    return session.getValues();
  }, [session]);

  const values = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return values;
}

/**
 * Hook to get and set a specific value from preview session
 *
 * @deprecated Use PreviewEnvironment + usePreviewEnvironment instead for better performance
 * and to avoid infinite loop issues.
 */
export function usePreviewSessionValue(
  session: PreviewSession | null,
  stepId: string
): [any, (value: any) => void] {
  const values = usePreviewSessionValues(session);
  const value = values[stepId];

  const setValue = useCallback(
    (newValue: any) => {
      if (session) {
        session.setValue(stepId, newValue);
      }
    },
    [session, stepId]
  );

  return [value, setValue];
}

/**
 * Hook to manage current section index
 *
 * @deprecated Use PreviewEnvironment + usePreviewEnvironment instead for better performance
 * and to avoid infinite loop issues.
 */
export function usePreviewSessionSection(session: PreviewSession | null) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  // Subscribe to session changes
  useEffect(() => {
    if (!session) return;

    const unsubscribe = session.subscribe(() => {
      setCurrentSectionIndex(session.getCurrentSectionIndex());
    });

    // Initialize with current value
    setCurrentSectionIndex(session.getCurrentSectionIndex());

    return unsubscribe;
  }, [session]);

  const setSectionIndex = useCallback(
    (index: number) => {
      if (session) {
        session.setCurrentSectionIndex(index);
      }
    },
    [session]
  );

  return [currentSectionIndex, setSectionIndex] as const;
}
