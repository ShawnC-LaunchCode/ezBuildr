import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchAPI, type ApiStep } from "@/lib/vault-api";
import { useAutoSave } from "@/hooks/useAutoSave";

import type { StepValue, DefaultValueConfig } from "@/pages/workflow-runner/runner.utils";
import type { PreviewEnvironment, PreviewRunState } from "@/lib/previewRunner/PreviewEnvironment";

interface UseRunValuesProps {
  mode: 'preview' | 'production';
  actualRunId: string | null;
  run: { values?: { stepId: string; value: StepValue }[] } | null | undefined;
  previewState: PreviewRunState | null;
  previewEnvironment: Pick<PreviewEnvironment, 'setValue'> | null | undefined;
  allSteps: ApiStep[] | undefined;
  intakeData: { values?: Record<string, StepValue> | null; isLoading?: boolean } | null;
}

import { type SaveStatus } from "@/hooks/useAutoSave";

export interface UseRunValuesReturn {
  formValues: Record<string, StepValue>;
  setFormValues: React.Dispatch<React.SetStateAction<Record<string, StepValue>>>;
  effectiveValues: Record<string, StepValue>;
  handleUpdateValue: (stepId: string, value: StepValue) => void;
  saveStatus: SaveStatus;
  hasUnsavedChanges: boolean;
  saveNow: () => Promise<void>;
}

interface RunValueAdapter {
  values: Record<string, StepValue>;
  updateValue: (stepId: string, value: StepValue) => void;
  hydrateFromSavedRun: boolean;
  hydrateFromIntake: boolean;
  autosaveEnabled: boolean;
}

export function useRunValues({
  mode,
  actualRunId,
  run,
  previewState,
  previewEnvironment,
  allSteps,
  intakeData
}: UseRunValuesProps): UseRunValuesReturn {
  const [formValues, setFormValues] = useState<Record<string, StepValue>>({});
  const isProductionMode = mode === 'production';

  const updateProductionValue = useCallback((stepId: string, value: StepValue) => {
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
        hydrateFromIntake: true,
        autosaveEnabled: Boolean(actualRunId),
      };
    }

    return {
      values: previewState?.values ?? {},
      updateValue: updatePreviewValue,
      hydrateFromSavedRun: false,
      hydrateFromIntake: false,
      autosaveEnabled: false,
    };
  }, [isProductionMode, formValues, updateProductionValue, actualRunId, previewState?.values, updatePreviewValue]);

  const {
    values: effectiveValues,
    updateValue,
    hydrateFromSavedRun,
    hydrateFromIntake,
    autosaveEnabled,
  } = valueAdapter;

  // Initialize form values from run.values (production mode only).
  //
  // Guarded to fire once per run (ICW2-B10): `run` used to be rebuilt as a
  // brand-new object on every render (see useRunSession), so this effect
  // re-ran on every render and unconditionally clobbered `formValues` back to
  // the last-persisted server snapshot — silently discarding whatever the
  // user had just answered client-side (and, since `setFormValues` always
  // triggered another render, running away into "Maximum update depth
  // exceeded"). `run` is now memoized, but a real refetch (autosave
  // completing, a background revalidation) still produces a new `run`
  // reference — hydrating again at that point would just as silently wipe an
  // in-progress answer, so hydration is limited to the first time a given
  // `actualRunId`'s saved values become available, and merges under (rather
  // than over) anything already in local state — unless `actualRunId` itself
  // changed (the rare case where a session resolves to a *different* run
  // without remounting, e.g. the "existing run replaced" fallback in
  // useRunSession), in which case `prev` belongs to the old run and must not
  // leak into the new one.
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
    run.values.forEach((v) => {
      initial[v.stepId] = v.value;
    });
    setFormValues((prev) => (isDifferentRun ? initial : { ...initial, ...prev }));
  }, [run, hydrateFromSavedRun, actualRunId]);

  // Intake Data Hydration (Production Mode)
  useEffect(() => {
    const intakeValues = intakeData?.values;
    if (hydrateFromIntake && allSteps && intakeValues !== null && intakeValues !== undefined && !intakeData?.isLoading) {
      setFormValues((prev) => {
        const next = { ...prev };
        let changed = false;
        allSteps.forEach((step: ApiStep) => {
          if (next[step.id] === undefined || next[step.id] === null || next[step.id] === "") {
            const defVal = step.defaultValue as DefaultValueConfig | undefined;
            if (defVal?.source === 'intake' && defVal.variable) {
              const val = intakeValues[defVal.variable];
              if (val !== undefined) {
                next[step.id] = val;
                changed = true;
              }
            }
          }
        });
        return changed ? next : prev;
      });
    }
  }, [hydrateFromIntake, allSteps, intakeData?.values, intakeData?.isLoading]);

  const handleUpdateValue = useCallback((stepId: string, value: StepValue) => {
    updateValue(stepId, value);
  }, [updateValue]);

  // Autosave logic (DOC-101)
  const performSave = useCallback(async (dataToSave: Record<string, StepValue>) => {
    if (!actualRunId) {return;}
    
    // We only want to bulk save what actually exists in formValues
    // The endpoint expects an array of {stepId, value}
    const valuesToSave = Object.entries(dataToSave).map(([stepId, value]) => ({ stepId, value }));
    if (valuesToSave.length === 0) {return;}
    
    await fetchAPI(`/api/runs/${actualRunId}/values/bulk`, {
      method: 'POST',
      keepalive: true, // Allow request to complete if the page is unloading
      body: JSON.stringify({ values: valuesToSave })
    });
  }, [actualRunId]);

  const { saveStatus, hasUnsavedChanges, saveNow } = useAutoSave({
    data: formValues,
    onSave: performSave,
    delay: 1500, // 1.5s debounce
    enabled: autosaveEnabled
  });

  return {
    formValues,
    setFormValues,
    effectiveValues,
    handleUpdateValue,
    saveStatus,
    hasUnsavedChanges,
    saveNow
  };
}
