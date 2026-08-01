import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/hooks/use-toast";
import { fetchAPI, type ApiSection, type ApiStep } from "@/lib/vault-api";
import { useSubmitSection, useNext, useCompleteRun } from "@/lib/vault-hooks";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validatePage } from "@shared/validation/PageValidator";
import type { ValidateRule } from "@shared/types/blocks";
import type { ValidationSchema } from "@shared/validation/ValidationSchema";
import { clearRunToken } from "@/lib/runTokens";
import { usePreviewStore } from "@/store/preview";
import { analytics } from "@/lib/analytics";
import type { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";

type RunnerValues = Record<string, StepValue>;

type SectionValueWrite = {
  stepId: string;
  value: StepValue;
};

type TraceRecorder = Pick<PreviewEnvironment, 'addTraceEntry'>;

type AdvanceValidationIssue = {
  kind: 'validation';
  errors: string[];
  fieldErrors?: Record<string, string[]>;
};

interface AdvanceContext {
  runId: string | null;
  currentSection: ApiSection;
  currentSectionIndex: number;
  visibleSections: ApiSection[];
  visibleSectionSteps: ApiStep[];
  effectiveValues: RunnerValues;
  isLastSection: boolean;
  setCurrentSectionIndex: Dispatch<SetStateAction<number>>;
  setShowReview: Dispatch<SetStateAction<boolean>>;
}

export interface RunNavigationTransport {
  getVisibleSectionSteps: (sectionId: string) => ApiStep[];
  saveBeforeLeavingSection: () => Promise<void>;
  recordValidationPassed: (stepsValidated: number) => void | Promise<void>;
  recordValidationException: (error: unknown) => void | Promise<void>;
  advanceAfterValidation: (context: AdvanceContext) => Promise<AdvanceValidationIssue | undefined>;
}

interface UseRunNavigationTransportProps {
  mode: 'preview' | 'production';
  previewEnvironment: PreviewEnvironment | null | undefined;
  getVisibleSectionSteps: (sectionId: string, traceRecorder?: TraceRecorder) => ApiStep[];
  onPreviewComplete?: () => void;
  saveNow: () => Promise<void>;
}

interface UseRunNavigationProps {
  actualRunId: string | null;
  workflowId?: string;
  runVersionId?: string;
  initialCompleted?: boolean;
  initialSectionId?: string | null;
  visibleSections: ApiSection[];
  effectiveValues: RunnerValues;
  transport: RunNavigationTransport;
}

function hasFinalBlock(section: ApiSection): boolean {
  return Boolean((section.config as { finalBlock?: unknown } | null | undefined)?.finalBlock);
}

function collectSectionValues(steps: ApiStep[], values: RunnerValues): SectionValueWrite[] {
  const currentSectionStepIds = new Set(steps.map((step) => step.id));
  return Object.keys(values)
    .filter((stepId) => currentSectionStepIds.has(stepId))
    .map((stepId) => ({ stepId, value: values[stepId] }));
}

function focusFirstFieldError(fieldErrors: Record<string, string[]>): void {
  const firstErrorId = Object.keys(fieldErrors)[0];
  if (!firstErrorId) {
    return;
  }

  setTimeout(() => {
    const element = document.getElementById(firstErrorId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function focusFirstValidationError(blockErrors: Record<string, string[]>): void {
  const firstErrorId = Object.keys(blockErrors)[0];
  if (!firstErrorId) {
    return;
  }

  setTimeout(() => {
    const blockContainer = document.getElementById(`block-container-${firstErrorId}`);
    const inputElement = document.getElementById(firstErrorId);

    const scrollTarget = blockContainer ?? inputElement;
    if (scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (inputElement && typeof inputElement.focus === 'function') {
      inputElement.focus({ preventScroll: true });
    } else if (blockContainer) {
      const focusable = blockContainer.querySelector('input, select, textarea, button');
      if (focusable instanceof HTMLElement) {
        focusable.focus({ preventScroll: true });
      }
    }
  }, 100);
}

export function useRunNavigationTransport({
  mode,
  previewEnvironment,
  getVisibleSectionSteps,
  onPreviewComplete,
  saveNow,
}: UseRunNavigationTransportProps): RunNavigationTransport {
  const { toast } = useToast();
  const submitMutation = useSubmitSection();
  const nextMutation = useNext();
  const isProductionMode = mode === 'production';

  return useMemo<RunNavigationTransport>(() => {
    if (!isProductionMode && previewEnvironment) {
      return {
        getVisibleSectionSteps: (sectionId) => getVisibleSectionSteps(sectionId, previewEnvironment),
        saveBeforeLeavingSection: async () => undefined,
        recordValidationPassed: (stepsValidated) => {
          void previewEnvironment.addTraceEntry({
            type: 'logic',
            status: 'executed',
            message: 'Page Validation Passed',
            details: { stepsValidated },
          });
        },
        recordValidationException: (error) => {
          void previewEnvironment.addTraceEntry({
            type: 'error',
            status: 'failed',
            message: 'Validation Exception',
            details: { error },
          });
        },
        advanceAfterValidation: async ({
          runId,
          currentSectionIndex,
          visibleSections,
          isLastSection,
          setCurrentSectionIndex,
        }) => {
          if (isLastSection) {
            previewEnvironment.completeRun();
            void previewEnvironment.addTraceEntry({
              type: 'step',
              status: 'executed',
              message: 'Workflow Completed',
            });
            toast({ title: "Preview Complete!", description: "Preview workflow completed successfully" });
            onPreviewComplete?.();
            return undefined;
          }

          const nextIndex = Math.min(currentSectionIndex + 1, visibleSections.length - 1);
          const nextSection = visibleSections[nextIndex];

          if (runId != null && nextSection != null && hasFinalBlock(nextSection)) {
            try {
              const valuesToSave = Object.entries(previewEnvironment.getValues()).map(([stepId, value]) => ({ stepId, value }));
              await fetchAPI(`/api/runs/${runId}/values/bulk`, {
                method: 'POST',
                body: JSON.stringify({ values: valuesToSave }),
              });
            } catch (error) {
              console.error('[WorkflowRunner] Failed to save preview values:', error);
              toast({ title: "Warning", description: "Failed to save form values.", variant: "destructive" });
            }
          }

          setCurrentSectionIndex(nextIndex);
          previewEnvironment.setCurrentSection(nextIndex);
          return undefined;
        },
      };
    }

    return {
      getVisibleSectionSteps: (sectionId) => getVisibleSectionSteps(sectionId),
      saveBeforeLeavingSection: saveNow,
      recordValidationPassed: () => undefined,
      recordValidationException: () => undefined,
      advanceAfterValidation: async ({
        runId,
        currentSection,
        currentSectionIndex,
        visibleSections,
        visibleSectionSteps,
        effectiveValues,
        isLastSection,
        setCurrentSectionIndex,
        setShowReview,
      }) => {
        if (!runId) {
          throw new Error("Run is not ready yet");
        }

        // Flush any pending autosaves immediately so the submitSection request cannot race them.
        await saveNow();

        const result = await submitMutation.mutateAsync({
          runId,
          sectionId: currentSection.id,
          values: collectSectionValues(visibleSectionSteps, effectiveValues),
        });

        if (!result.success) {
          return {
            kind: 'validation',
            errors: result.errors ?? ["Unable to continue"],
            fieldErrors: result.fieldErrors,
          };
        }

        if (isLastSection) {
          setShowReview(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return undefined;
        }

        const nextResult = await nextMutation.mutateAsync({
          runId,
          currentSectionId: currentSection.id,
        });

        if (nextResult.nextSectionId != null) {
          const nextIndex = visibleSections.findIndex((section) => section.id === nextResult.nextSectionId);
          if (nextIndex >= 0) {
            setCurrentSectionIndex(nextIndex);
          } else {
            console.warn('[WorkflowRunner] Server nextSectionId not locally visible, advancing sequentially', nextResult.nextSectionId);
            if (currentSectionIndex + 1 < visibleSections.length) {
              setCurrentSectionIndex(currentSectionIndex + 1);
            } else {
              setShowReview(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        } else {
          const newIndex = Math.min(currentSectionIndex + 1, visibleSections.length - 1);
          setCurrentSectionIndex(newIndex);
        }

        return undefined;
      },
    };
  }, [
    isProductionMode,
    previewEnvironment,
    getVisibleSectionSteps,
    onPreviewComplete,
    saveNow,
    submitMutation,
    nextMutation,
    toast,
  ]);
}

export interface UseRunNavigationReturn {
  currentSectionIndex: number;
  setCurrentSectionIndex: Dispatch<SetStateAction<number>>;
  currentSection: ApiSection | undefined;
  isLastSection: boolean;
  showReview: boolean;
  isCompleted: boolean;
  setShowReview: Dispatch<SetStateAction<boolean>>;
  errors: string[];
  fieldErrors: Record<string, string[]>;
  handleNext: () => Promise<void>;
  handlePrev: () => Promise<void>;
  handleFinalSubmit: () => Promise<void>;
  completeMutationIsPending: boolean;
}

export function useRunNavigation({
  actualRunId,
  workflowId,
  runVersionId,
  initialCompleted = false,
  initialSectionId,
  visibleSections,
  effectiveValues,
  transport,
}: UseRunNavigationProps): UseRunNavigationReturn {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const initializedRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!actualRunId || visibleSections.length === 0 || initializedRunRef.current === actualRunId) {
      return;
    }
    const savedIndex = initialSectionId
      ? visibleSections.findIndex((section) => section.id === initialSectionId)
      : 0;
    setCurrentSectionIndex(savedIndex >= 0 ? savedIndex : 0);
    initializedRunRef.current = actualRunId;
  }, [actualRunId, initialSectionId, visibleSections]);

  useEffect(() => {
    setIsCompleted(initialCompleted);
  }, [actualRunId, initialCompleted]);

  const { toast } = useToast();
  const completeMutation = useCompleteRun();

  const currentSection = visibleSections[currentSectionIndex];
  const isLastSection = currentSectionIndex === visibleSections.length - 1;

  const handlePrev = useCallback(async () => {
    if (showReview) {
      setShowReview(false);
      return;
    }

    await transport.saveBeforeLeavingSection();
    setCurrentSectionIndex((prev) => Math.max(prev - 1, 0));
  }, [showReview, transport]);

  const handleFinalSubmit = useCallback(async () => {
    if (!actualRunId || isCompleted || completeMutation.isPending) {return;}
    try {
      await completeMutation.mutateAsync(actualRunId);
      setIsCompleted(true);
      setShowReview(false);
      if (workflowId && runVersionId) {
        void analytics.runComplete(actualRunId, workflowId, runVersionId);
      }
      toast({ title: "Success", description: "Workflow submitted successfully" });

      clearRunToken(actualRunId);
      usePreviewStore.getState().clearToken(actualRunId);
    } catch {
      toast({ title: "Error", description: "Failed to submit workflow", variant: "destructive" });
    }
  }, [actualRunId, workflowId, runVersionId, isCompleted, completeMutation, toast]);

  const handleNext = useCallback(async () => {
    setErrors([]);
    setFieldErrors({});

    if (currentSection == null) {return;}

    const visibleSectionSteps = transport.getVisibleSectionSteps(currentSection.id);

    try {
      const stepSchemas: Record<string, ValidationSchema> = {};
      visibleSectionSteps.forEach((step: ApiStep) => {
        stepSchemas[step.id] = getValidationSchema({
          id: step.id,
          type: step.type,
          config: step.config,
          required: step.required,
        });
      });

      const validationResult = await validatePage({
        schemas: stepSchemas,
        values: effectiveValues,
        allValues: effectiveValues,
        pageRules: (currentSection.config as { validationRules?: ValidateRule[] })?.validationRules ?? [],
      });

      if (!validationResult.valid) {
        setFieldErrors(validationResult.blockErrors);
        const newErrors: string[] = [];
        Object.values(validationResult.blockErrors).forEach((errs) => newErrors.push(...errs));
        setErrors(newErrors);

        toast({
          title: "Please complete all required fields",
          description: "Some information is still needed before continuing.",
          variant: "destructive",
        });

        focusFirstValidationError(validationResult.blockErrors);
        return;
      }
    } catch (e) {
      console.error("Validation error", e);
      await transport.recordValidationException(e);
      toast({ title: "Unable to continue", description: "Something went wrong. Please try again.", variant: "destructive" });
      return;
    }

    try {
      await transport.recordValidationPassed(visibleSectionSteps.length);
      const result = await transport.advanceAfterValidation({
        runId: actualRunId,
        currentSection,
        currentSectionIndex,
        visibleSections,
        visibleSectionSteps,
        effectiveValues,
        isLastSection,
        setCurrentSectionIndex,
        setShowReview,
      });

      if (result?.kind === 'validation') {
        setErrors(result.errors);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          focusFirstFieldError(result.fieldErrors);
        }
        toast({ title: "Please complete all required fields", description: result.errors[0], variant: "destructive" });
      }
    } catch (error) {
      console.error('[WorkflowRunner] Submit/next error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to proceed";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  }, [
    currentSection,
    transport,
    effectiveValues,
    actualRunId,
    currentSectionIndex,
    visibleSections,
    isLastSection,
    toast,
  ]);

  return {
    currentSectionIndex,
    setCurrentSectionIndex,
    currentSection,
    isLastSection,
    showReview,
    isCompleted,
    setShowReview,
    errors,
    fieldErrors,
    handleNext,
    handlePrev,
    handleFinalSubmit,
    completeMutationIsPending: completeMutation.isPending,
  };
}
