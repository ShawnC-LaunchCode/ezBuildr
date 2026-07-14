import { useState, useEffect, useMemo, useCallback } from "react";
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

  // Initialize form values from run.values (production mode only)
  useEffect(() => {
    if (hydrateFromSavedRun && run?.values) {
      const initial: Record<string, StepValue> = {};
      run.values.forEach((v) => {
        initial[v.stepId] = v.value;
      });
      setFormValues(initial);
    }
  }, [run, hydrateFromSavedRun]);

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
