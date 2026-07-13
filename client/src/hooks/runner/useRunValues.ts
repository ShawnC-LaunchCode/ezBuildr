import { useState, useEffect, useMemo, useCallback } from "react";
import type { ApiStep } from "@/lib/vault-api";
import { useAutoSave } from "@/hooks/useAutoSave";
import { getRunToken } from "@/lib/runTokens";
import type { StepValue, DefaultValueConfig } from "@/pages/workflow-runner/runner.utils";

interface UseRunValuesProps {
  mode: 'preview' | 'production';
  actualRunId: string | null;
  run: any; // Using any to avoid importing the huge ApiRun type if not strictly necessary here, but usually it's ApiRun & { values }
  previewState: any;
  previewEnvironment: any;
  allSteps: ApiStep[] | undefined;
  intakeData: any;
}

export function useRunValues({
  mode,
  actualRunId,
  run,
  previewState,
  previewEnvironment,
  allSteps,
  intakeData
}: UseRunValuesProps) {
  const [formValues, setFormValues] = useState<Record<string, StepValue>>({});

  // Initialize form values from run.values (production mode only)
  useEffect(() => {
    if (mode === 'production' && run?.values) {
      const initial: Record<string, StepValue> = {};
      run.values.forEach((v: any) => {
        initial[v.stepId] = v.value;
      });
      setFormValues(initial);
    }
  }, [run, mode]);

  // Intake Data Hydration (Production Mode)
  useEffect(() => {
    if (mode === 'production' && allSteps && intakeData?.values !== null && intakeData?.values !== undefined && !intakeData?.isLoading) {
      setFormValues((prev) => {
        const next = { ...prev };
        let changed = false;
        allSteps.forEach((step: ApiStep) => {
          if (next[step.id] === undefined || next[step.id] === null || next[step.id] === "") {
            const defVal = step.defaultValue as DefaultValueConfig | undefined;
            if (defVal?.source === 'intake' && defVal.variable) {
              const val = intakeData.values[defVal.variable];
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
  }, [mode, allSteps, intakeData?.values, intakeData?.isLoading]);

  // Effective values (preview or production)
  const effectiveValues = useMemo(() => {
    return mode === 'preview'
      ? (previewState?.values ?? {})
      : formValues;
  }, [mode, previewState?.values, formValues]);

  const handleUpdateValue = useCallback((stepId: string, value: StepValue) => {
    if (mode === 'preview' && previewEnvironment) {
      previewEnvironment.setValue(stepId, value);
    } else {
      setFormValues(prev => ({ ...prev, [stepId]: value }));
    }
  }, [mode, previewEnvironment]);

  // Autosave logic (DOC-101)
  const performSave = useCallback(async (dataToSave: Record<string, StepValue>) => {
    if (mode !== 'production' || !actualRunId) return;
    
    // We only want to bulk save what actually exists in formValues
    // The endpoint expects an array of {stepId, value}
    const valuesToSave = Object.entries(dataToSave).map(([stepId, value]) => ({ stepId, value }));
    if (valuesToSave.length === 0) return;

    const runToken = getRunToken(actualRunId);
    
    const response = await fetch(`/api/runs/${actualRunId}/values/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
      },
      credentials: 'include',
      body: JSON.stringify({ values: valuesToSave })
    });

    if (!response.ok) {
      // Autosave failures are non-blocking, but could log
      console.warn('[useRunValues] Autosave failed', response.status);
    }
  }, [mode, actualRunId]);

  const { saveStatus, hasUnsavedChanges, saveNow } = useAutoSave({
    data: formValues,
    onSave: performSave,
    delay: 1500, // 1.5s debounce
    enabled: mode === 'production' && !!actualRunId
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
