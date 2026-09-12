import { ChevronLeft, ChevronRight, Check, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactElement } from "react";
import { FullScreenLoader } from "@/components/ui/loader";

import { BlockErrorBoundary } from "@/components/runner/BlockErrorBoundary";
import { ClientRunnerLayout } from "@/components/runner/ClientRunnerLayout";
import { ListDrillEditor } from "@/components/runner/list/ListDrillEditor";
import { ListDrillProvider, useListDrill } from "@/components/runner/list/ListDrillContext";
import { SaveAndResumeButton } from "@/components/runner/SaveAndResumeButton";
import { FinalDocumentsPage } from "@/components/runner/pages/FinalDocumentsPage";
import { ReviewPage } from "@/components/runner/pages/ReviewPage";
import { PageSteps } from "@/components/runner/PageSteps";
import type { RunnerNavData } from "@/components/runner/RunnerSectionNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRunSession, type RunIdKind } from "@/hooks/runner/useRunSession";
import { useRunValues } from "@/hooks/runner/useRunValues";
import { usePageVisibility } from "@/hooks/runner/usePageVisibility";
import { useRunNavigation, useRunNavigationTransport } from "@/hooks/runner/useRunNavigation";
import { useResolvedRunnerBranding } from "@/hooks/useRunnerBranding";
import type { ApiAdvanceResult, ApiPage, ApiStep, ApiWorkflow } from "@/lib/vault-api";
import { getRunToken } from "@/lib/runTokens";
import type { ResolvedBranding } from "@shared/types/branding";
import type { ListValue } from "@shared/types/stepConfigs";
import type { LogicRule } from "@shared/schema";
import { evaluateWorkflowVisibility } from "@shared/workflowLogic";

export interface PreviewRunnerControls {
  steps: ApiStep[];
  fillPage: (values: Record<string, unknown>) => Promise<void>;
  fillWorkflow: (values: Record<string, unknown>) => Promise<void>;
}

interface ServerPreviewOptions {
  initialValues?: Record<string, unknown>;
  onControls: (controls: PreviewRunnerControls | null) => void;
  onResult: (result: ApiAdvanceResult) => void;
}

export function previewInputValues(steps: ApiStep[], values: Record<string, unknown>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const step of steps) {
    if (step.isVirtual === true || ['js_question', 'computed', 'display', 'final_documents', 'signature_block'].includes(step.type)) { continue; }
    const key = Object.hasOwn(values, step.id) ? step.id : step.alias;
    if (key && Object.hasOwn(values, key)) { inputs[step.id] = values[key]; }
  }
  return inputs;
}

function useSnapshotInputs(steps: ApiStep[] | undefined, preview: ServerPreviewOptions | undefined) {
  const values = preview?.initialValues;
  return useMemo(() => steps && values ? previewInputValues(steps, values) : undefined, [steps, values]);
}

interface WorkflowRunnerProps {
  runId?: string;
  runIdKind?: RunIdKind;
  serverPreview?: ServerPreviewOptions;
  isPreview?: boolean;
}

const NO_VISITED_PAGE_IDS: string[] = [];

type RunnerWorkflow = Pick<ApiWorkflow, 'id' | 'title' | 'description' | 'projectId' | 'settings'>;

type FinalPageConfig = ComponentProps<typeof FinalDocumentsPage>['pageConfig'];
type SaveStatus = ComponentProps<typeof ClientRunnerLayout>['saveStatus'];
type RunnerPageConfig = FinalPageConfig & {
  finalBlock?: unknown;
};

interface WorkflowRunnerScreenProps {
  isInitializing: boolean;
  initError: string | null;
  pages: ApiPage[] | undefined;
  workflowId: string | undefined;
  isProductionMode: boolean;
  actualRunId: string | null;
  workflow: RunnerWorkflow | undefined;
  branding: ResolvedBranding;
  currentPage: ApiPage | undefined;
  currentPageIndex: number;
  visiblePages: ApiPage[];
  effectiveAllSteps: ApiStep[] | undefined;
  effectiveValues: Record<string, unknown>;
  effectiveLogicRules: LogicRule[];
  visiblePageSteps: ApiStep[];
  visibleReviewStepIds: string[];
  runToken: string | null;
  saveStatus: SaveStatus;
  saveNow: () => Promise<void>;
  showReview: boolean;
  isCompleted: boolean;
  finalPageConfig?: RunnerPageConfig;
  isLastPage: boolean;
  errors: string[];
  fieldErrors: Record<string, string[]>;
  completeMutationIsPending: boolean;
  handleNext: () => Promise<void>;
  handlePrev: () => Promise<void>;
  handleFinalSubmit: () => Promise<void>;
  handleUpdateValue: (stepId: string, value: unknown) => void;
  setCurrentPageIndex: (pageIndex: number) => void;
  setShowReview: (showReview: boolean) => void;
  reviewEditStepId: string | null;
  onEditReviewStep: (stepId: string, pageId: string) => void;
  /** Section rail contents; undefined while there is nothing to navigate. */
  nav?: RunnerNavData;
  /** Rail click handler (SECT-9): a guarded jump, never a submit. */
  onNavigateToPage: (pageId: string) => void;
}

// `isProductionMode` stays in the loaded props: it is what tells a signature
// block whether to call the provider or run the local preview simulation, so an
// optional prop would let a caller silently downgrade real signing to a mock.
export type LoadedRunnerScreenProps = Omit<
  WorkflowRunnerScreenProps,
  'isInitializing' | 'initError' | 'pages' | 'workflowId'
>;

function getRunnerPageConfig(page: ApiPage): RunnerPageConfig {
  return (page.config ?? {}) as RunnerPageConfig;
}

function hasFinalBlock(page: ApiPage | undefined): boolean {
  return page != null && Boolean(getRunnerPageConfig(page).finalBlock);
}

function getFinalPageConfig(page: ApiPage | undefined): RunnerPageConfig | undefined {
  return page ? getRunnerPageConfig(page) : undefined;
}

export function partitionRunnerPages(visiblePages: ApiPage[]): {
  respondentPages: ApiPage[];
  finalPage: ApiPage | undefined;
} {
  return {
    respondentPages: visiblePages.filter((page) => !hasFinalBlock(page)),
    finalPage: visiblePages.find((page) => hasFinalBlock(page)),
  };
}

function getProgress(currentPageIndex: number, totalPages: number): number {
  return Math.round((currentPageIndex / Math.max(1, totalPages)) * 100);
}

function getWorkflowTitle(workflow: RunnerWorkflow | undefined): string {
  return workflow?.title ?? "Workflow";
}

function allowsSaveAndResume(workflow: RunnerWorkflow | undefined): boolean {
  const settings: unknown = workflow?.settings;
  return typeof settings !== "object" ||
    settings === null ||
    !("allowSaveAndResume" in settings) ||
    settings.allowSaveAndResume !== false;
}

export function WorkflowRunner({
  runId,
  runIdKind,
  serverPreview,
  isPreview: _isPreview = false,
}: WorkflowRunnerProps) {
  // 1. Session & Initialization
  const { actualRunId, isInitializing, initError, run, runtime, workflowId } = useRunSession(runId, runIdKind);
  const workflow = runtime?.workflow;
  const pages = runtime?.pages;
  const sections = runtime?.sections;
  const runToken = actualRunId != null ? getRunToken(actualRunId) : null;
  const effectiveAllSteps = runtime?.steps;
  const effectiveLogicRules = runtime?.logicRules as LogicRule[] | undefined ?? [];

  // 4. Form Values & Autosave
  const initialPreviewValues = useSnapshotInputs(effectiveAllSteps, serverPreview);
  const { effectiveValues, handleUpdateValue, saveStatus, saveNow, applySubmittedValues } = useRunValues({
    actualRunId,
    run,
    initialValues: initialPreviewValues,
    serverPreview: serverPreview !== undefined,
  });

  // 5. Visibility Engine
  const { visiblePages, getVisiblePageSteps } = usePageVisibility(
    pages,
    effectiveAllSteps,
    effectiveValues,
    effectiveLogicRules,
    sections
  );
  const { respondentPages, finalPage } = useMemo(
    () => partitionRunnerPages(visiblePages),
    [visiblePages]
  );
  const finalPageConfig = getFinalPageConfig(finalPage);

  const resolvePreviewPages = useCallback((values: Record<string, unknown>) => {
    const visibility = evaluateWorkflowVisibility({
      sections: sections ?? [], pages: pages ?? [], steps: effectiveAllSteps ?? [],
      rules: effectiveLogicRules, data: values,
      resolveAlias: (alias) => effectiveAllSteps?.find((step) => step.alias === alias)?.id,
    });
    return partitionRunnerPages((pages ?? []).filter((page) => visibility.visiblePages.has(page.id))).respondentPages;
  }, [sections, pages, effectiveAllSteps, effectiveLogicRules]);
  const applyPreviewResult = useCallback((result: ApiAdvanceResult, submittedValues: Record<string, unknown>) => {
    if (result.success) { applySubmittedValues(result.values, submittedValues); }
    serverPreview?.onResult(result);
    return resolvePreviewPages(result.values);
  }, [applySubmittedValues, serverPreview, resolvePreviewPages]);

  const navigationTransport = useRunNavigationTransport({
    getVisiblePageSteps,
    saveNow,
    onAdvanceResult: serverPreview ? applyPreviewResult : undefined,
  });

  const [reviewEditStepId, setReviewEditStepId] = useState<string | null>(null);

  // Reachedness is server state in production (SECT-8A) — never recomputed
  // here, and never mirrored into a zustand store (convention 8). It gates the
  // rail's affordance and, independently, the jump itself.
  const visitedPageIds = runtime?.run.visitedPageIds ?? NO_VISITED_PAGE_IDS;

  // 6. Navigation & Validation
  const {
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
    completeMutationIsPending
  } = useRunNavigation({
    actualRunId,
    workflowId,
    runVersionId: run?.workflowVersionId ?? undefined,
    initialCompleted: run?.completed ?? false,
    initialPageId: run?.currentPageId,
    visiblePages: respondentPages,
    effectiveValues,
    transport: navigationTransport,
    returnToReviewAfterNext: reviewEditStepId !== null,
    visitedPageIds,
  });

  const visiblePageSteps = currentPage != null ? getVisiblePageSteps(currentPage.id) : [];
  const previewActive = useRef(true);
  useEffect(() => {
    previewActive.current = true;
    return () => { previewActive.current = false; };
  }, []);

  useEffect(() => {
    if (!serverPreview || !currentPage || !effectiveAllSteps || !actualRunId) { return; }
    const fill = async (inputs: Record<string, unknown>, entireWorkflow: boolean) => {
      let data = effectiveValues;
      let pageToFill: ApiPage | undefined = entireWorkflow ? resolvePreviewPages(data)[0] : currentPage;
      const submitted = new Set<string>();
      while (pageToFill && previewActive.current) {
        if (submitted.has(pageToFill.id)) { throw new Error('Auto-fill stopped at a repeated page. Continue manually.'); }
        submitted.add(pageToFill.id);
        const steps = effectiveAllSteps.filter((step) => step.pageId === pageToFill?.id);
        const pageInputs = previewInputValues(steps, inputs);
        data = { ...data, ...pageInputs };
        Object.entries(pageInputs).forEach(([id, value]) => handleUpdateValue(id, value));
        const resolved = resolvePreviewPages(data);
        const outcome = await navigationTransport.advanceAfterValidation({
          runId: actualRunId, currentPage: pageToFill,
          currentPageIndex: resolved.findIndex((page) => page.id === pageToFill?.id),
          visiblePages: resolved, visiblePageSteps: steps.filter((step) => !step.isVirtual),
          effectiveValues: data, isLastPage: resolved.at(-1)?.id === pageToFill.id,
          setCurrentPageIndex, setShowReview, returnToReviewAfterValidation: false,
        });
        if (outcome?.kind === 'validation') { throw new Error(outcome.errors.join(' ')); }
        if (outcome?.kind !== 'advanced' || !entireWorkflow) { return; }
        data = outcome.result.values;
        pageToFill = pages?.find((page) => page.id === outcome.result.navigation?.nextPageId);
        if (pageToFill && hasFinalBlock(pageToFill)) { return; }
      }
    };
    serverPreview.onControls({
      steps: visiblePageSteps,
      fillPage: (values) => fill(values, false),
      fillWorkflow: (values) => fill(values, true),
    });
    return () => { serverPreview.onControls(null); };
  }, [serverPreview, currentPage, effectiveAllSteps, actualRunId, effectiveValues, handleUpdateValue,
    resolvePreviewPages, navigationTransport, setCurrentPageIndex, setShowReview, pages, visiblePageSteps]);
  const visibleReviewStepIds = useMemo(() => respondentPages.flatMap((page) =>
    getVisiblePageSteps(page.id).map((step) => step.id)
  ), [getVisiblePageSteps, respondentPages]);

  // Both jumps run through the same guarded machinery (SECT-9). The Review
  // edit differs only in arming "return to review after Next"; it does so
  // after the jump resolves, so a refused target cannot leave the flag set.
  const onEditReviewStep = useCallback((stepId: string, pageId: string) => {
    void jumpToPage(pageId).then((moved) => {
      if (moved) {
        setReviewEditStepId(stepId);
      }
    });
  }, [jumpToPage]);

  const onNavigateToPage = useCallback((pageId: string) => {
    // Clear the Review edit first: without it, Next from a page reached by the
    // rail would bounce back to Review on behalf of an unrelated question.
    setReviewEditStepId(null);
    void jumpToPage(pageId);
  }, [jumpToPage]);

  useEffect(() => {
    if (showReview || reviewEditStepId === null) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const container = document.getElementById(`block-container-${reviewEditStepId}`);
      container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusTarget = container?.querySelector('input, select, textarea, button');
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [reviewEditStepId, showReview]);

  useEffect(() => {
    if (showReview) {
      setReviewEditStepId(null);
    }
  }, [showReview]);

  const nav = useMemo<RunnerNavData>(() => ({
    sections: sections ?? [],
    visiblePages: respondentPages,
    visitedPageIds,
    currentPageId: currentPage?.id ?? null,
  }), [sections, respondentPages, visitedPageIds, currentPage?.id]);

  const branding = useResolvedRunnerBranding(
    runtime?.branding,
    workflow?.settings
  );

  return (
    <WorkflowRunnerScreen
      isInitializing={isInitializing}
      initError={initError}
      pages={pages}
      workflowId={workflowId}
      isProductionMode={!serverPreview}
      actualRunId={actualRunId}
      workflow={workflow}
      branding={branding}
      currentPage={currentPage}
      currentPageIndex={currentPageIndex}
      visiblePages={respondentPages}
      effectiveAllSteps={effectiveAllSteps}
      effectiveValues={effectiveValues}
      effectiveLogicRules={effectiveLogicRules}
      visiblePageSteps={visiblePageSteps}
      visibleReviewStepIds={visibleReviewStepIds}
      runToken={runToken}
      saveStatus={saveStatus}
      saveNow={saveNow}
      showReview={showReview}
      isCompleted={isCompleted}
      finalPageConfig={finalPageConfig}
      isLastPage={isLastPage}
      errors={errors}
      fieldErrors={fieldErrors}
      completeMutationIsPending={completeMutationIsPending}
      handleNext={handleNext}
      handlePrev={async () => {
        setReviewEditStepId(null);
        await handlePrev();
      }}
      handleFinalSubmit={handleFinalSubmit}
      handleUpdateValue={handleUpdateValue}
      setCurrentPageIndex={setCurrentPageIndex}
      setShowReview={setShowReview}
      reviewEditStepId={reviewEditStepId}
      onEditReviewStep={onEditReviewStep}
      nav={nav}
      onNavigateToPage={onNavigateToPage}
    />
  );
}

function WorkflowRunnerScreen(props: WorkflowRunnerScreenProps): ReactElement {
  const { isInitializing, initError, pages, workflowId, isProductionMode, actualRunId } = props;

  if (isInitializing) {
    return <FullScreenLoader message="Starting session..." />;
  }

  if (initError != null) {
    return <SessionError message={initError} />;
  }

  if (pages == null || workflowId == null || workflowId === "" || (isProductionMode && actualRunId == null)) {
    return <FullScreenLoader message="Loading workflow..." />;
  }

  return <LoadedRunnerScreen {...props} />;
}

interface CenteredScreenCardProps {
  title: string;
  description: string;
  titleClassName?: string;
  cardClassName?: string;
  children: ReactElement;
}

function CenteredScreenCard({ title, description, titleClassName, cardClassName, children }: CenteredScreenCardProps): ReactElement {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <Card className={`w-full max-w-md shadow-lg ${cardClassName ?? ""}`}>
        <CardHeader>
          <CardTitle className={titleClassName}>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function SessionError({ message }: { message: string }): ReactElement {
  return (
    <CenteredScreenCard
      title="Session Error"
      description="We couldn't start this workflow."
      titleClassName="text-destructive"
      cardClassName="border-destructive/20"
    >
      <>
        <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
        <Button className="mt-4 w-full" onClick={() => { window.location.href = '/'; }}>
          Return Home
        </Button>
      </>
    </CenteredScreenCard>
  );
}

function NoVisiblePagesScreen({ actualRunId, completeMutationIsPending, handleFinalSubmit }: LoadedRunnerScreenProps): ReactElement {
  const canSubmit = actualRunId != null;

  return (
    <CenteredScreenCard
      title="Nothing to complete"
      description="No questions apply to this response."
      cardClassName="border-t-4 border-t-primary dark:bg-zinc-900"
    >
      {canSubmit ? (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Every question was skipped based on your answers. Submit to finish this response.
          </p>
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => { void handleFinalSubmit(); }}
            disabled={completeMutationIsPending}
          >
            {completeMutationIsPending ? "Submitting..." : "Submit"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          There is nothing to complete for this response.
        </p>
      )}
    </CenteredScreenCard>
  );
}

export function LoadedRunnerScreen(props: LoadedRunnerScreenProps): ReactElement {
  if (props.isCompleted) {
    return (
      <CompletedRunnerScreen
        workflow={props.workflow}
        actualRunId={props.actualRunId}
        runToken={props.runToken}
        finalPageConfig={props.finalPageConfig}
        branding={props.branding}
      />
    );
  }

  if (props.showReview) {
    return <ReviewRunnerScreen {...props} />;
  }

  if (props.visiblePages.length === 0) {
    return <NoVisiblePagesScreen {...props} />;
  }

  return <QuestionRunnerScreen {...props} />;
}

interface RunnerSettings {
  completionMessage?: string;
  redirectUrl?: string;
}

function getSafeRedirectUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

interface CompletedRunnerScreenProps {
  workflow: RunnerWorkflow | undefined;
  actualRunId: string | null;
  runToken: string | null;
  finalPageConfig?: RunnerPageConfig;
  branding: ResolvedBranding;
}

function CompletedRunnerScreen({
  workflow,
  actualRunId,
  runToken,
  finalPageConfig,
  branding,
}: CompletedRunnerScreenProps): ReactElement {
  const settings = (workflow?.settings ?? {}) as RunnerSettings;
  const redirectUrl = finalPageConfig ? null : getSafeRedirectUrl(settings.redirectUrl);

  useEffect(() => {
    if (!redirectUrl) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      window.location.assign(redirectUrl);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [redirectUrl]);

  if (actualRunId && finalPageConfig) {
    return (
      <ClientRunnerLayout
        title={getWorkflowTitle(workflow)}
        progress={100}
        currentStep={1}
        totalSteps={1}
        saveStatus="saved"
        branding={branding}
      >
        <FinalDocumentsPage
          runId={actualRunId}
          runToken={runToken ?? undefined}
          pageConfig={finalPageConfig}
        />
      </ClientRunnerLayout>
    );
  }

  return (
    <ClientRunnerLayout
      title={getWorkflowTitle(workflow)}
      progress={100}
      currentStep={1}
      totalSteps={1}
      saveStatus="saved"
      branding={branding}
    >
      <Card className="mt-6 border-t-4 border-t-green-600 shadow-lg dark:bg-zinc-900">
        <CardContent className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Interview complete</h1>
          <p className="mt-3 max-w-xl whitespace-pre-wrap text-muted-foreground">
            {settings.completionMessage ?? "Thank you for completing this workflow!"}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            {redirectUrl ? "You’ll be redirected shortly." : "You can safely close this window."}
          </p>
        </CardContent>
      </Card>
    </ClientRunnerLayout>
  );
}

function ReviewRunnerScreen({
  workflow,
  branding,
  visiblePages,
  effectiveAllSteps,
  effectiveValues,
  visibleReviewStepIds,
  saveStatus,
  completeMutationIsPending,
  handleFinalSubmit,
  onEditReviewStep,
  setShowReview,
  nav,
  onNavigateToPage,
}: LoadedRunnerScreenProps): ReactElement {
  return (
    <ClientRunnerLayout
      title={getWorkflowTitle(workflow)}
      progress={100}
      currentStep={visiblePages.length}
      totalSteps={visiblePages.length}
      saveStatus={saveStatus}
      branding={branding}
      // On the review screen no page is current: the respondent is past them all.
      nav={nav && { ...nav, currentPageId: null }}
      onNavigateToPage={onNavigateToPage}
    >
      <ReviewPage
        pages={visiblePages}
        allSteps={effectiveAllSteps ?? []}
        values={effectiveValues}
        visiblePageIds={visiblePages.map((page) => page.id)}
        visibleStepIds={visibleReviewStepIds}
        onEditStep={onEditReviewStep}
      />
      <div className="mt-8 flex justify-between">
        <Button type="button" variant="outline" onClick={() => { setShowReview(false); }}>
          Back
        </Button>
        <Button type="button" onClick={() => { void handleFinalSubmit(); }} disabled={completeMutationIsPending}>
          {completeMutationIsPending ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </ClientRunnerLayout>
  );
}

function QuestionRunnerScreen(props: LoadedRunnerScreenProps): ReactElement {
  const {
    workflow,
    branding,
    currentPage,
    currentPageIndex,
    visiblePages,
    saveStatus,
    saveNow,
    errors,
    visiblePageSteps,
    effectiveAllSteps,
    effectiveValues,
    handleUpdateValue,
    fieldErrors,
    effectiveLogicRules,
    handlePrev,
    handleNext,
    isLastPage,
    actualRunId,
    runToken,
    reviewEditStepId,
    nav,
    onNavigateToPage,
  } = props;

  const saveAndResumeAction = actualRunId && runToken && allowsSaveAndResume(workflow) ? (
    <SaveAndResumeButton runId={actualRunId} saveNow={saveNow} />
  ) : undefined;

  return (
    <ClientRunnerLayout
      title={getWorkflowTitle(workflow)}
      progress={getProgress(currentPageIndex, visiblePages.length)}
      currentStep={currentPageIndex}
      totalSteps={visiblePages.length}
      saveStatus={saveStatus}
      saveAndResumeAction={saveAndResumeAction}
      branding={branding}
      nav={nav}
      onNavigateToPage={onNavigateToPage}
    >
      <Card className="shadow-lg border-t-4 border-t-primary dark:bg-zinc-900 overflow-visible mt-6 md:mt-0">
        <QuestionPageHeader currentPage={currentPage} />
        {/* Keyed by page so drilling into a List never survives a page change (LIST-8) — resume always reopens at the page, not mid-drill. */}
        <ListDrillProvider key={currentPage?.id}>
          <QuestionCardContent
            currentPage={currentPage}
            visiblePageSteps={visiblePageSteps}
            allSteps={effectiveAllSteps}
            effectiveValues={effectiveValues}
            handleUpdateValue={handleUpdateValue}
            fieldErrors={fieldErrors}
            effectiveLogicRules={effectiveLogicRules}
            errors={errors}
            currentPageIndex={currentPageIndex}
            isLastPage={isLastPage}
            returnToReview={reviewEditStepId !== null}
            handlePrev={handlePrev}
            handleNext={handleNext}
            runId={actualRunId ?? undefined}
            runToken={runToken}
            preview={!props.isProductionMode}
          />
        </ListDrillProvider>
      </Card>
    </ClientRunnerLayout>
  );
}

export interface QuestionCardContentProps extends QuestionPageBodyProps {
  errors: string[];
  currentPageIndex: number;
  isLastPage: boolean;
  returnToReview?: boolean;
  handlePrev: () => Promise<void>;
  handleNext: () => Promise<void>;
}

/**
 * Switches the page body (and Back/Next) for the List drill-in editor
 * while a List step is drilled into (LIST-8) — drilling replaces the whole
 * page body, not just the List step's own row, and hides Back/Next in
 * favor of the editor's own "← parent"/"Done" controls. Exported (alongside
 * `partitionRunnerPages`/`LoadedRunnerScreen`) so tests can render it
 * directly instead of standing up the whole data-fetching page.
 */
export function QuestionCardContent({
  currentPage,
  visiblePageSteps,
  allSteps,
  effectiveValues,
  handleUpdateValue,
  fieldErrors,
  effectiveLogicRules,
  errors,
  currentPageIndex,
  isLastPage,
  returnToReview = false,
  handlePrev,
  handleNext,
  runId,
  runToken,
  preview,
}: QuestionCardContentProps): ReactElement {
  const { drill } = useListDrill();
  const drilledStep = drill
    ? (visiblePageSteps.find((step) => step.id === drill.stepId) ?? allSteps?.find((step) => step.id === drill.stepId))
    : undefined;

  // Alias -> step id map for a drilled field's dynamic options (e.g. a
  // `choice` field bound to another list step), mirroring how
  // PageSteps.tsx builds the same map for the non-drilled path.
  const aliasSourceSteps = allSteps ?? visiblePageSteps;
  const aliasMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const step of aliasSourceSteps) {
      if (step.alias) {
        map[step.alias] = step.id;
      }
    }
    return map;
  }, [aliasSourceSteps]);

  return (
    <>
      <CardContent className="pt-8 overflow-visible p-6 md:p-8">
        <ErrorSummary errors={errors} />
        {drill && drilledStep ? (
          <BlockErrorBoundary stepId={drilledStep.id}>
            <ListDrillEditor
              step={drilledStep}
              value={effectiveValues[drilledStep.id] as ListValue | null | undefined}
              onChange={(value) => { handleUpdateValue(drilledStep.id, value); }}
              drill={drill}
              aliasMap={aliasMap}
              runId={runId}
              runToken={runToken}
            />
          </BlockErrorBoundary>
        ) : (
          <QuestionPageBody
            currentPage={currentPage}
            visiblePageSteps={visiblePageSteps}
            allSteps={allSteps}
            effectiveValues={effectiveValues}
            handleUpdateValue={handleUpdateValue}
            fieldErrors={fieldErrors}
            effectiveLogicRules={effectiveLogicRules}
            runId={runId}
            runToken={runToken}
            preview={preview}
          />
        )}
      </CardContent>
      {!drill && (
        <QuestionNavigation
          currentPageIndex={currentPageIndex}
          isLastPage={isLastPage}
          returnToReview={returnToReview}
          handlePrev={handlePrev}
          handleNext={handleNext}
        />
      )}
    </>
  );
}

function QuestionPageHeader({ currentPage }: { currentPage: ApiPage | undefined }): ReactElement | null {
  if (currentPage == null) {
    return null;
  }

  return (
    <CardHeader className="bg-gray-50/50 dark:bg-zinc-800/50 border-b pb-6">
      <CardTitle className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {currentPage.title}
      </CardTitle>
      {currentPage.description != null && currentPage.description !== "" && (
        <CardDescription className="text-base mt-2 whitespace-pre-wrap dark:text-gray-400">
          {currentPage.description}
        </CardDescription>
      )}
    </CardHeader>
  );
}

function ErrorSummary({ errors }: { errors: string[] }): ReactElement | null {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-md bg-destructive/15 p-4 border border-destructive/20" role="alert" aria-live="assertive">
      <h3 className="text-sm font-medium text-destructive mb-2 flex items-center">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive mr-2"></span>
        Please fix the following errors to continue:
      </h3>
      <ul className="list-disc pl-5 space-y-1">
        {errors.map((error, index) => (
          <li key={index} className="text-sm text-destructive/90">{error}</li>
        ))}
      </ul>
    </div>
  );
}

interface QuestionPageBodyProps {
  currentPage: ApiPage | undefined;
  visiblePageSteps: ApiStep[];
  allSteps: ApiStep[] | undefined;
  effectiveValues: Record<string, unknown>;
  handleUpdateValue: (stepId: string, value: unknown) => void;
  fieldErrors: Record<string, string[]>;
  effectiveLogicRules: LogicRule[];
  runId?: string;
  runToken?: string | null;
  preview?: boolean;
}

function QuestionPageBody({
  currentPage,
  visiblePageSteps,
  allSteps,
  effectiveValues,
  handleUpdateValue,
  fieldErrors,
  effectiveLogicRules,
  runId,
  runToken,
  preview,
}: QuestionPageBodyProps): ReactElement {
  if (currentPage != null && visiblePageSteps.length > 0) {
    return (
      <PageSteps
        pageId={currentPage.id}
        steps={visiblePageSteps}
        allSteps={allSteps}
        values={effectiveValues}
        onChange={handleUpdateValue}
        errors={fieldErrors}
        logicRules={effectiveLogicRules}
        runId={runId}
        runToken={runToken}
        preview={preview}
      />
    );
  }

  return (
    <div className="py-12 text-center text-gray-500 italic border border-dashed rounded-lg bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700">
      {currentPage != null ? "No questions in this page." : "No visible pages."}
    </div>
  );
}

interface QuestionNavigationProps {
  currentPageIndex: number;
  isLastPage: boolean;
  returnToReview: boolean;
  handlePrev: () => Promise<void>;
  handleNext: () => Promise<void>;
}

function QuestionNavigation({
  currentPageIndex,
  isLastPage,
  returnToReview,
  handlePrev,
  handleNext,
}: QuestionNavigationProps): ReactElement {
  return (
    <div className="px-6 py-4 md:px-8 border-t bg-gray-50 dark:bg-zinc-900/50 rounded-b-xl flex justify-between items-center sticky bottom-0 z-10">
      <Button
        type="button"
        variant="outline"
        onClick={() => { void handlePrev(); }}
        disabled={currentPageIndex === 0}
        className="w-28 md:w-32 shadow-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Button type="button" onClick={() => { void handleNext(); }} className="w-28 md:w-32 shadow-sm font-medium relative group">
        {returnToReview ? (
          <>Review <Check className="w-4 h-4 ml-2" /></>
        ) : isLastPage ? (
          <>Review <Check className="w-4 h-4 ml-2" /></>
        ) : (
          <>Next <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>
        )}
      </Button>
    </div>
  );
}
