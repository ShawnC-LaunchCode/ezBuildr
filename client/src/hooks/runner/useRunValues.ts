import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchAPI } from "@/lib/vault-api";
import { useAutoSave, type SaveStatus } from "@/hooks/useAutoSave";
import {
  bufferStepValues,
  getBufferedStepValues,
  removeBufferedStepValues,
} from "@/lib/runner/offlineBuffer";

import type { StepValue } from "@/pages/workflow-runner/runner.utils";
import type { PreviewEnvironment, PreviewRunState } from "@/lib/previewRunner/PreviewEnvironment";

interface UseRunValuesProps {
  mode: 'preview' | 'production';
  actualRunId: string | null;
  run: { values?: { stepId: string; value: StepValue; updatedAt?: string | Date }[] } | null | undefined;
  previewState: PreviewRunState | null;
  previewEnvironment: Pick<PreviewEnvironment, 'setValue'> | null | undefined;
}

export interface UseRunValuesReturn {
  formValues: Record<string, StepValue>;
  setFormValues: React.Dispatch<React.SetStateAction<Record<string, StepValue>>>;
  effectiveValues: Record<string, StepValue>;
  handleUpdateValue: (stepId: string, value: StepValue) => void;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
  saveNow: () => Promise<void>;
  isOnline: boolean;
}

interface RunValueAdapter {
  values: Record<string, StepValue>;
  updateValue: (stepId: string, value: StepValue) => void;
  hydrateFromSavedRun: boolean;
  autosaveEnabled: boolean;
}

// A `keepalive: true` fetch is rejected outright once its body exceeds 64 KiB
// (Fetch standard, enforced by Chrome as an inflight quota). Stay under that
// with headroom for headers so large lists still save, just without the
// unload-survival guarantee (LIST2-4).
export const KEEPALIVE_MAX_BYTES = 60 * 1024;

interface BulkSaveResponse {
  success: boolean;
  message?: string;
  savedValues?: Record<string, unknown>;
  conflicts?: Array<{ stepId: string; serverValue: unknown; serverUpdatedAt: string }>;
}

export function useRunValues({
  mode,
  actualRunId,
  run,
  previewState,
  previewEnvironment
}: UseRunValuesProps): UseRunValuesReturn {
  const [formValues, setFormValues] = useState<Record<string, StepValue>>({});
  const isProductionMode = mode === 'production';

  // Granular per-step edit timestamps so modifying one field does not timestamp stale fields
  const stepEditTimestampsRef = useRef<Record<string, number>>({});
  // Monotonically increasing revision counter per step to protect in-flight user edits
  const stepEditRevisionRef = useRef<Record<string, number>>({});
  // Track in-flight save requests per step to prevent conflict responses from discarding newer in-flight edits
  const inFlightSubmissionsRef = useRef<Record<string, { value: StepValue; timestamp: number; revision: number }>>({});

  const updateProductionValue = useCallback((stepId: string, value: StepValue) => {
    stepEditTimestampsRef.current[stepId] = Date.now();
    stepEditRevisionRef.current[stepId] = (stepEditRevisionRef.current[stepId] ?? 0) + 1;
    setFormValues(prev => ({ ...prev, [stepId]: value }));
  }, []);

  const updatePreviewValue = useCallback((stepId: string, value: StepValue) => {
    previewEnvironment?.setValue(stepId, value);
  }, [previewEnvironment]);

  const valueAdapter = useMemo<RunValueAdapter>(() => {
    if (isProductionMode) {
      return {
        values: formValues,
        updateValue: updateProductionValue,
        hydrateFromSavedRun: true,
        autosaveEnabled: Boolean(actualRunId),
      };
    }

    return {
      values: previewState?.values ?? {},
      updateValue: updatePreviewValue,
      hydrateFromSavedRun: false,
      autosaveEnabled: false,
    };
  }, [isProductionMode, formValues, updateProductionValue, actualRunId, previewState?.values, updatePreviewValue]);

  const {
    values: effectiveValues,
    updateValue,
    hydrateFromSavedRun,
    autosaveEnabled,
  } = valueAdapter;

  // Initialize form values from run.values and merge any pending offline buffer (production mode only).
  const hydratedRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrateFromSavedRun || !run?.values || !actualRunId) {
      return;
    }
    if (hydratedRunIdRef.current === actualRunId) {
      return;
    }
    const isDifferentRun = hydratedRunIdRef.current !== null && hydratedRunIdRef.current !== actualRunId;
    hydratedRunIdRef.current = actualRunId;

    const initial: Record<string, StepValue> = {};
    const initialTimestamps: Record<string, number> = {};
    run.values.forEach((v) => {
      initial[v.stepId] = v.value;
      const updatedAtVal = v.updatedAt;
      const serverTime = updatedAtVal != null ? new Date(updatedAtVal).getTime() : 0;
      initialTimestamps[v.stepId] = serverTime;
    });

    if (isDifferentRun) {
      stepEditTimestampsRef.current = initialTimestamps;
      stepEditRevisionRef.current = {};
      setFormValues(initial);
    } else {
      stepEditTimestampsRef.current = { ...initialTimestamps, ...stepEditTimestampsRef.current };
      setFormValues((prev) => ({ ...initial, ...prev }));
    }

    // Check if there are offline buffered values that haven't synced yet.
    // A respondent can edit while IndexedDB is being read, so capture the
    // revision state at the start and only hydrate fields that remained
    // untouched for the entire read. Buffered values should beat the server
    // snapshot, but must never beat a newer in-memory edit.
    const revisionsAtReadStart = { ...stepEditRevisionRef.current };
    let cancelled = false;
    void getBufferedStepValues(actualRunId).then((bufferedEntries) => {
      if (cancelled || bufferedEntries.length === 0) {
        return;
      }

      setFormValues((prev) => {
        if (cancelled) {
          return prev;
        }

        const merged = { ...prev };
        for (const entry of bufferedEntries) {
          const revisionAtReadStart = revisionsAtReadStart[entry.stepId] ?? 0;
          const currentRevision = stepEditRevisionRef.current[entry.stepId] ?? 0;
          const wasEditedBeforeRead = revisionAtReadStart !== 0;
          const wasEditedDuringRead = currentRevision !== revisionAtReadStart;
          if (wasEditedBeforeRead || wasEditedDuringRead) {
            continue;
          }

          merged[entry.stepId] = entry.value;
          if (Number.isFinite(entry.clientTimestamp)) {
            stepEditTimestampsRef.current[entry.stepId] = entry.clientTimestamp;
          }
          if (entry.clientRevision !== undefined) {
            stepEditRevisionRef.current[entry.stepId] = entry.clientRevision;
          }
        }
        return merged;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [run, hydrateFromSavedRun, actualRunId]);

  const handleUpdateValue = useCallback((stepId: string, value: StepValue) => {
    updateValue(stepId, value);
  }, [updateValue]);

  // Safely reconcile server conflicts: verify if the local field was edited after the in-flight submission
  const applyConflictReconciliation = useCallback((conflicts: Array<{ stepId: string; serverValue: unknown; serverUpdatedAt: string }>) => {
    if (conflicts.length === 0) {
      return;
    }

    setFormValues((prev) => {
      const updated = { ...prev };
      for (const conflict of conflicts) {
        const stepId = conflict.stepId;
        const currentRevision = stepEditRevisionRef.current[stepId] ?? 0;
        const submittedSnapshot = inFlightSubmissionsRef.current[stepId];
        const submittedRevision = submittedSnapshot?.revision ?? 0;

        // Check if user has made newer edits to this field AFTER the submitted save snapshot
        const hasNewerLocalEdit = currentRevision > submittedRevision;
        if (hasNewerLocalEdit) {
          // User made newer edits while request was in-flight -> preserve newer local draft!
          continue;
        }

        // Local value was not modified further in-flight -> safely apply server authority value
        if (conflict.serverValue !== undefined) {
          updated[stepId] = conflict.serverValue as StepValue;
          stepEditTimestampsRef.current[stepId] = new Date(conflict.serverUpdatedAt).getTime();
        }
      }
      return updated;
    });
  }, []);

  // Buffer values to IndexedDB when offline
  const performOfflineSave = useCallback(async (dataToSave: Record<string, StepValue>) => {
    if (!actualRunId) {
      return;
    }
    const now = Date.now();
    const valuesToBuffer = Object.entries(dataToSave).map(([stepId, value]) => ({
      stepId,
      value,
      clientTimestamp: stepEditTimestampsRef.current[stepId] ?? now,
      clientRevision: stepEditRevisionRef.current[stepId] ?? 0,
    }));
    if (valuesToBuffer.length === 0) {
      return;
    }
    await bufferStepValues(actualRunId, valuesToBuffer);
  }, [actualRunId]);

  // Resilient autosave logic with per-step timestamp versioning and in-flight conflict protection
  const performSave = useCallback(async (dataToSave: Record<string, StepValue>) => {
    if (!actualRunId) {
      return;
    }

    const now = Date.now();
    const valuesToSave = Object.entries(dataToSave).map(([stepId, value]) => {
      const clientTimestamp = stepEditTimestampsRef.current[stepId] ?? now;
      const revision = stepEditRevisionRef.current[stepId] ?? 0;
      inFlightSubmissionsRef.current[stepId] = { value, timestamp: clientTimestamp, revision };
      return {
        stepId,
        value,
        clientTimestamp,
      };
    });
    if (valuesToSave.length === 0) {
      return;
    }

    const body = JSON.stringify({ values: valuesToSave });
    const keepalive = new Blob([body]).size < KEEPALIVE_MAX_BYTES;

    const response = await fetchAPI<BulkSaveResponse>(`/api/runs/${actualRunId}/values/bulk`, {
      method: 'POST',
      keepalive,
      body,
    });

    const conflictStepIds = new Set(response?.conflicts?.map((c) => c.stepId) ?? []);
    const syncedStepIds = valuesToSave
      .map((v) => v.stepId)
      .filter((stepId) => !conflictStepIds.has(stepId));

    if (syncedStepIds.length > 0) {
      await removeBufferedStepValues(actualRunId, syncedStepIds);
    }

    if (response?.conflicts && response.conflicts.length > 0) {
      applyConflictReconciliation(response.conflicts);
      await removeBufferedStepValues(actualRunId, Array.from(conflictStepIds));
    }
  }, [actualRunId, applyConflictReconciliation]);

  // Reconnect flush: automatically flush buffered answers to server on reconnection
  const handleReconnect = useCallback(async () => {
    if (!actualRunId) {
      return;
    }
    const bufferedEntries = await getBufferedStepValues(actualRunId);
    if (bufferedEntries.length === 0) {
      return;
    }

    for (const entry of bufferedEntries) {
      inFlightSubmissionsRef.current[entry.stepId] = {
        value: entry.value,
        timestamp: entry.clientTimestamp,
        revision: stepEditRevisionRef.current[entry.stepId] ?? 0,
      };
    }

    const valuesToSync = bufferedEntries.map((b) => ({
      stepId: b.stepId,
      value: b.value,
      clientTimestamp: b.clientTimestamp,
    }));

    const body = JSON.stringify({ values: valuesToSync });
    const response = await fetchAPI<BulkSaveResponse>(`/api/runs/${actualRunId}/values/bulk`, {
      method: 'POST',
      body,
    });

    const conflictStepIds = new Set(response?.conflicts?.map((c) => c.stepId) ?? []);
    const syncedStepIds = bufferedEntries
      .map((b) => b.stepId)
      .filter((stepId) => !conflictStepIds.has(stepId));

    if (syncedStepIds.length > 0) {
      await removeBufferedStepValues(actualRunId, syncedStepIds);
    }

    if (response?.conflicts && response.conflicts.length > 0) {
      applyConflictReconciliation(response.conflicts);
      await removeBufferedStepValues(actualRunId, Array.from(conflictStepIds));
    }
  }, [actualRunId, applyConflictReconciliation]);

  const { saveStatus, hasUnsavedChanges, saveNow, isOnline } = useAutoSave({
    data: formValues,
    onSave: performSave,
    onOfflineSave: performOfflineSave,
    onReconnect: handleReconnect,
    delay: 1500, // 1.5s debounce
    enabled: autosaveEnabled,
  });

  return {
    formValues,
    setFormValues,
    effectiveValues,
    handleUpdateValue,
    saveStatus,
    hasUnsavedChanges,
    saveNow,
    isOnline,
  };
}
