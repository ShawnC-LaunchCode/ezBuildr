import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/hooks/use-toast";
import type { ApiAdvanceResult, ApiPage, ApiStep } from "@/lib/vault-api";
import { useAdvance, useCompleteRun } from "@/lib/vault-hooks";
import { getValidationSchema, validateListValue } from "@shared/validation/BlockValidation";
import { validatePage } from "@shared/validation/PageValidator";
import type { ValidateRule } from "@shared/types/blocks";
import type { ListConfig } from "@shared/types/stepConfigs";
import type { ValidationSchema } from "@shared/validation/ValidationSchema";
import { describeListErrorsForSummary, normalizeListValue } from "@/components/runner/list/listRuntime";
import { clearRunToken } from "@/lib/runTokens";
import { usePreviewStore } from "@/store/preview";
import { analytics } from "@/lib/analytics";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";

type RunnerValues = Record<string, StepValue>;

type PageValueWrite = {
  stepId: string;
  value: StepValue;
};

type AdvanceValidationIssue = {
  kind: 'validation';
  errors: string[];
  fieldErrors?: Record<string, string[]>;
};

type AdvanceOutcome = AdvanceValidationIssue | { kind: 'advanced'; result: ApiAdvanceResult };

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
  advanceAfterValidation: (context: AdvanceContext) => Promise<AdvanceOutcome | undefined>;
}

interface UseRunNavigationTransportProps {
  getVisiblePageSteps: (pageId: string) => ApiStep[];
  saveNow: () => Promise<void>;
  onAdvanceResult?: (result: ApiAdvanceResult, submittedValues: RunnerValues) => ApiPage[];
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
  /**
   * The reached set that gates `jumpToPage` (SECT-9): the run row's persisted
   * `visitedPageIds`. Never re-derived here — reachedness is owned by the run.
   */
  visitedPageIds?: string[];
}

const NO_VISITED_PAGE_IDS: string[] = [];

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

function applyAdvanceNavigation(result: ApiAdvanceResult, context: Pick<AdvanceContext,
  'currentPageIndex' | 'visiblePages' | 'isLastPage' | 'setCurrentPageIndex' | 'setShowReview' | 'returnToReviewAfterValidation'
>, authoritative: boolean): void {
  const { currentPageIndex, visiblePages, isLastPage, setCurrentPageIndex, setShowReview, returnToReviewAfterValidation } = context;
  const nextPageId = result.navigation?.nextPageId;
  if (returnToReviewAfterValidation || (authoritative ? nextPageId == null : isLastPage)) {
    setShowReview(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (nextPageId != null) {
    const nextIndex = visiblePages.findIndex((page) => page.id === nextPageId);
    if (nextIndex >= 0) { setCurrentPageIndex(nextIndex); return; }
    if (authoritative) { throw new Error('The next page is unavailable. Restart preview to reload the workflow.'); }
    console.warn('[WorkflowRunner] Server nextPageId not locally visible, advancing sequentially', nextPageId);
    if (currentPageIndex + 1 < visiblePages.length) { setCurrentPageIndex(currentPageIndex + 1); }
    else { setShowReview(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    return;
  }
  setCurrentPageIndex(Math.min(currentPageIndex + 1, visiblePages.length - 1));
}

export function useRunNavigationTransport({
  getVisiblePageSteps,
  saveNow,
  onAdvanceResult,
}: UseRunNavigationTransportProps): RunNavigationTransport {
  const advanceMutation = useAdvance();
  // No response means the server may already have committed: retry that key.
  // Any response completes the attempt, including a validation rejection.
  const pendingSubmissionRef = useRef<{
    runId: string;
    pageId: string;
    key: string;
    inFlight: boolean;
  } | null>(null);
  useEffect(() => () => { pendingSubmissionRef.current = null; }, []);

  return useMemo<RunNavigationTransport>(() => {
    return {
      getVisiblePageSteps: (pageId) => getVisiblePageSteps(pageId),
      saveBeforeLeavingPage: saveNow,
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

        let attempt = pendingSubmissionRef.current;
        if (attempt?.runId !== runId || attempt.pageId !== currentPage.id) {
          attempt = { runId, pageId: currentPage.id, key: crypto.randomUUID(), inFlight: false };
          pendingSubmissionRef.current = attempt;
        }
        // Acquire before the first await, including the autosave flush.
        if (attempt.inFlight) {
          return undefined;
        }
        attempt.inFlight = true;
        let result: ApiAdvanceResult;
        try {
          await saveNow();
          if (pendingSubmissionRef.current !== attempt) {
            return undefined;
          }
          result = await advanceMutation.mutateAsync({
            runId,
            pageId: currentPage.id,
            values: collectPageValues(visiblePageSteps, effectiveValues),
            submissionKey: attempt.key,
          });
        } catch (error) {
          if (pendingSubmissionRef.current !== attempt) {
            return undefined;
          }
          // Leave the identity available for a user retry after a lost response.
          throw error;
        } finally {
          attempt.inFlight = false;
        }

        if (pendingSubmissionRef.current !== attempt) {
          return undefined;
        }
        pendingSubmissionRef.current = null;
        // Defence-in-depth: HTTP pairing currently returns the requested key.
        if (result.submissionKey !== attempt.key) {
          return undefined;
        }

        const submittedValues = Object.fromEntries(collectPageValues(visiblePageSteps, effectiveValues)
          .map(({ stepId, value }) => [stepId, value]));
        const resolvedPages = onAdvanceResult?.(result, submittedValues) ?? visiblePages;

        if (!result.success) {
          // No `fieldErrors` here, deliberately. The submit path never carried
          // them either: `validatePage` produces per-field structure, the
          // coordinator flattens it to strings, and `BlockRunner` has no
          // `fieldErrors` at all — so `focusFirstFieldError` has never fired
          // from this path. Filed as CB-B6 rather than invented here.
          return {
            kind: 'validation',
            errors: result.errors ?? ["Unable to continue"],
          };
        }

        applyAdvanceNavigation(result, { currentPageIndex, visiblePages: resolvedPages, isLastPage,
          setCurrentPageIndex, setShowReview, returnToReviewAfterValidation }, onAdvanceResult !== undefined);
        return { kind: 'advanced', result };
      },
    };
  }, [
    getVisiblePageSteps,
    saveNow,
    advanceMutation,
    onAdvanceResult,
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
  /**
   * Move the view to an already-reached page. Resolves `true` when the view
   * moved (or was already there) and `false` when the target was refused.
   */
  jumpToPage: (pageId: string) => Promise<boolean>;
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
  visitedPageIds = NO_VISITED_PAGE_IDS,
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

  const reachedPageIds = useMemo(() => new Set(visitedPageIds), [visitedPageIds]);

  /**
   * The guarded jump behind the rail and the Review screen's edit buttons
   * (SECT-9). It is deliberately *not* a submit: `handleNext` validates the
   * page, submits it and lets the server resolve `skip_to`, which moves the
   * run. A jump moves only the view, so the server's forward position stays
   * authoritative and a reload still resumes where the run really is.
   *
   * The reached guard lives here rather than only in the rail's `disabled`
   * attribute, because the rail's props can be one render behind the run.
   * The one exception is the Review screen: the respondent submitted the last
   * page to get there, so every visible page is behind them — including one
   * `skip_to` jumped over, whose answers must stay editable from Review.
   */
  const jumpToPage = useCallback(async (pageId: string): Promise<boolean> => {
    const targetIndex = visiblePages.findIndex((page) => page.id === pageId);
    if (targetIndex < 0) {
      return false;
    }

    if (!showReview) {
      if (targetIndex === currentPageIndex) {
        // Clicking the row you are on is "back to the top of this page", not a
        // navigation: nothing to flush, nothing to move.
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      if (!reachedPageIds.has(pageId)) {
        return false;
      }
    }

    // Exactly what `handlePrev` does: a jump that skips the flush drops the
    // current page's un-debounced answers, which reads as data loss.
    await transport.saveBeforeLeavingPage();

    setErrors([]);
    setFieldErrors({});
    setCurrentPageIndex(targetIndex);
    setShowReview(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }, [visiblePages, showReview, currentPageIndex, reachedPageIds, transport]);

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
      toast({ title: "Unable to continue", description: "Something went wrong. Please try again.", variant: "destructive" });
      return;
    }

    try {
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
    jumpToPage,
    handleFinalSubmit,
    completeMutationIsPending: completeMutation.isPending,
  };
}
