import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/hooks/use-toast";
import { fetchAPI, type ApiPage, type ApiStep } from "@/lib/vault-api";
import { useSubmitPage, useNext, useCompleteRun } from "@/lib/vault-hooks";
import { getValidationSchema, validateListValue } from "@shared/validation/BlockValidation";
import { validatePage } from "@shared/validation/PageValidator";
import type { ValidateRule } from "@shared/types/blocks";
import type { ListConfig } from "@shared/types/stepConfigs";
import type { ValidationSchema } from "@shared/validation/ValidationSchema";
import { describeListErrorsForSummary, normalizeListValue } from "@/components/runner/list/listRuntime";
import { clearRunToken } from "@/lib/runTokens";
import { usePreviewStore } from "@/store/preview";
import { analytics } from "@/lib/analytics";
import type { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";

type RunnerValues = Record<string, StepValue>;

type PageValueWrite = {
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
  currentPage: ApiPage;
  currentPageIndex: number;
  visiblePages: ApiPage[];
  visiblePageSteps: ApiStep[];
  effectiveValues: RunnerValues;
  isLastPage: boolean;
  setCurrentPageIndex: Dispatch<SetStateAction<number>>;
  setShowReview: Dispatch<SetStateAction<boolean>>;
  returnToReviewAfterValidation: boolean;
}

export interface RunNavigationTransport {
  getVisiblePageSteps: (pageId: string) => ApiStep[];
  saveBeforeLeavingPage: () => Promise<void>;
  recordValidationPassed: (stepsValidated: number) => void | Promise<void>;
  recordValidationException: (error: unknown) => void | Promise<void>;
  advanceAfterValidation: (context: AdvanceContext) => Promise<AdvanceValidationIssue | undefined>;
}

interface UseRunNavigationTransportProps {
  mode: 'preview' | 'production';
  previewEnvironment: PreviewEnvironment | null | undefined;
  getVisiblePageSteps: (pageId: string, traceRecorder?: TraceRecorder) => ApiStep[];
  onPreviewComplete?: () => void;
  saveNow: () => Promise<void>;
}

interface UseRunNavigationProps {
  actualRunId: string | null;
  workflowId?: string;
  runVersionId?: string;
  initialCompleted?: boolean;
  initialPageId?: string | null;
  visiblePages: ApiPage[];
  effectiveValues: RunnerValues;
  transport: RunNavigationTransport;
  returnToReviewAfterNext?: boolean;
}

function hasFinalBlock(page: ApiPage): boolean {
  return Boolean((page.config as { finalBlock?: unknown } | null | undefined)?.finalBlock);
}

function collectPageValues(steps: ApiStep[], values: RunnerValues): PageValueWrite[] {
  const currentPageStepIds = new Set(steps.map((step) => step.id));
  return Object.keys(values)
    .filter((stepId) => currentPageStepIds.has(stepId))
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
  getVisiblePageSteps,
  onPreviewComplete,
  saveNow,
}: UseRunNavigationTransportProps): RunNavigationTransport {
  const { toast } = useToast();
  const submitMutation = useSubmitPage();
  const nextMutation = useNext();
  const isProductionMode = mode === 'production';

  return useMemo<RunNavigationTransport>(() => {
    if (!isProductionMode && previewEnvironment) {
      return {
        getVisiblePageSteps: (pageId) => getVisiblePageSteps(pageId, previewEnvironment),
        saveBeforeLeavingPage: async () => undefined,
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
          currentPageIndex,
          visiblePages,
          isLastPage,
          setCurrentPageIndex,
          setShowReview,
          returnToReviewAfterValidation,
        }) => {
          if (returnToReviewAfterValidation) {
            setShowReview(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return undefined;
          }

          if (isLastPage) {
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

          const nextIndex = Math.min(currentPageIndex + 1, visiblePages.length - 1);
          const nextPage = visiblePages[nextIndex];

          if (runId != null && nextPage != null && hasFinalBlock(nextPage)) {
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

          setCurrentPageIndex(nextIndex);
          previewEnvironment.setCurrentPage(nextIndex);
          return undefined;
        },
      };
    }

    return {
      getVisiblePageSteps: (pageId) => getVisiblePageSteps(pageId),
      saveBeforeLeavingPage: saveNow,
      recordValidationPassed: () => undefined,
      recordValidationException: () => undefined,
      advanceAfterValidation: async ({
        runId,
        currentPage,
        currentPageIndex,
        visiblePages,
        visiblePageSteps,
        effectiveValues,
        isLastPage,
        setCurrentPageIndex,
        setShowReview,
        returnToReviewAfterValidation,
      }) => {
        if (!runId) {
          throw new Error("Run is not ready yet");
        }

        // Flush any pending autosaves immediately so the submitPage request cannot race them.
        await saveNow();

        const result = await submitMutation.mutateAsync({
          runId,
          pageId: currentPage.id,
          values: collectPageValues(visiblePageSteps, effectiveValues),
        });

        if (!result.success) {
          return {
            kind: 'validation',
            errors: result.errors ?? ["Unable to continue"],
            fieldErrors: result.fieldErrors,
          };
        }

        if (returnToReviewAfterValidation) {
          setShowReview(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return undefined;
        }

        if (isLastPage) {
          setShowReview(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return undefined;
        }

        const nextResult = await nextMutation.mutateAsync({
          runId,
          currentPageId: currentPage.id,
        });

        if (nextResult.nextPageId != null) {
          const nextIndex = visiblePages.findIndex((page) => page.id === nextResult.nextPageId);
          if (nextIndex >= 0) {
            setCurrentPageIndex(nextIndex);
          } else {
            console.warn('[WorkflowRunner] Server nextPageId not locally visible, advancing sequentially', nextResult.nextPageId);
            if (currentPageIndex + 1 < visiblePages.length) {
              setCurrentPageIndex(currentPageIndex + 1);
            } else {
              setShowReview(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        } else {
          const newIndex = Math.min(currentPageIndex + 1, visiblePages.length - 1);
          setCurrentPageIndex(newIndex);
        }

        return undefined;
      },
    };
  }, [
    isProductionMode,
    previewEnvironment,
    getVisiblePageSteps,
    onPreviewComplete,
    saveNow,
    submitMutation,
    nextMutation,
    toast,
  ]);
}

export interface UseRunNavigationReturn {
  currentPageIndex: number;
  setCurrentPageIndex: Dispatch<SetStateAction<number>>;
  currentPage: ApiPage | undefined;
  isLastPage: boolean;
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
  initialPageId,
  visiblePages,
  effectiveValues,
  transport,
  returnToReviewAfterNext = false,
}: UseRunNavigationProps): UseRunNavigationReturn {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const initializedRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!actualRunId || visiblePages.length === 0 || initializedRunRef.current === actualRunId) {
      return;
    }
    const savedIndex = initialPageId
      ? visiblePages.findIndex((page) => page.id === initialPageId)
      : 0;
    setCurrentPageIndex(savedIndex >= 0 ? savedIndex : 0);
    initializedRunRef.current = actualRunId;
  }, [actualRunId, initialPageId, visiblePages]);

  useEffect(() => {
    setIsCompleted(initialCompleted);
  }, [actualRunId, initialCompleted]);

  const { toast } = useToast();
  const completeMutation = useCompleteRun();

  const currentPage = visiblePages[currentPageIndex];
  const isLastPage = currentPageIndex === visiblePages.length - 1;

  const handlePrev = useCallback(async () => {
    if (showReview) {
      setShowReview(false);
      return;
    }

    await transport.saveBeforeLeavingPage();
    setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
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

    if (currentPage == null) {return;}

    const visiblePageSteps = transport.getVisiblePageSteps(currentPage.id);

    try {
      const stepSchemas: Record<string, ValidationSchema> = {};
      // List steps carry recursive, path-keyed errors that the flat
      // ValidationRule[]/blockErrors contract below cannot express — they are
      // validated separately below via validateListValue (LIST-3) and merged
      // additively, so blockErrors/fieldErrors keying for every other step
      // type is untouched (LIST-9 AC1).
      const listSteps: ApiStep[] = [];
      visiblePageSteps.forEach((step: ApiStep) => {
        if (step.type === 'list') {
          listSteps.push(step);
          return;
        }
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
        pageRules: (currentPage.config as { validationRules?: ValidateRule[] })?.validationRules ?? [],
      });

      const listSummaryLines: string[] = [];
      let listsValid = true;
      for (const step of listSteps) {
        const config = step.config as ListConfig;
        const value = normalizeListValue(effectiveValues[step.id]);
        const stepErrors = validateListValue(value, config);
        // validateListValue only enforces config.minItems. A step-level
        // "required" toggle (the builder's generic RequiredToggle, LIST-6)
        // means "at least one item" independent of minItems being set —
        // flagged by LIST-8's verification as an open gap ("a required List
        // with zero items will not yet block Next client-side"), closed here.
        if (step.required && value.items.length === 0 && (config.minItems ?? 0) === 0) {
          (stepErrors["$root"] ??= []).push("At least 1 item is required");
        }
        if (Object.keys(stepErrors).length > 0) {
          listsValid = false;
          describeListErrorsForSummary(value, config, stepErrors, step.title).forEach(
            ({ label, message }) => { listSummaryLines.push(`${label} — ${message}`); }
          );
        }
      }

      if (!validationResult.valid || !listsValid) {
        setFieldErrors(validationResult.blockErrors);
        const newErrors: string[] = [...listSummaryLines];
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
      await transport.recordValidationPassed(visiblePageSteps.length);
      const result = await transport.advanceAfterValidation({
        runId: actualRunId,
        currentPage,
        currentPageIndex,
        visiblePages,
        visiblePageSteps,
        effectiveValues,
        isLastPage,
        setCurrentPageIndex,
        setShowReview,
        returnToReviewAfterValidation: returnToReviewAfterNext,
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
    currentPage,
    transport,
    effectiveValues,
    actualRunId,
    currentPageIndex,
    visiblePages,
    isLastPage,
    returnToReviewAfterNext,
    toast,
  ]);

  return {
    currentPageIndex,
    setCurrentPageIndex,
    currentPage,
    isLastPage,
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
