import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Check, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, type ComponentProps, type ReactElement } from "react";
import { FullScreenLoader } from "@/components/ui/loader";

import { BlockErrorBoundary } from "@/components/runner/BlockErrorBoundary";
import { ClientRunnerLayout } from "@/components/runner/ClientRunnerLayout";
import { ListDrillEditor } from "@/components/runner/list/ListDrillEditor";
import { ListDrillProvider, useListDrill } from "@/components/runner/list/ListDrillContext";
import { SaveAndResumeButton } from "@/components/runner/SaveAndResumeButton";
import { FinalDocumentsSection } from "@/components/runner/sections/FinalDocumentsSection";
import { ReviewSection } from "@/components/runner/sections/ReviewSection";
import { SectionSteps } from "@/components/runner/SectionSteps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRunSession } from "@/hooks/runner/useRunSession";
import { useRunValues } from "@/hooks/runner/useRunValues";
import { useSectionVisibility } from "@/hooks/runner/useSectionVisibility";
import { useRunNavigation, useRunNavigationTransport } from "@/hooks/runner/useRunNavigation";
import { useResolvedRunnerBranding } from "@/hooks/useRunnerBranding";
import type { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { useWorkflow } from "@/lib/vault-hooks";
import { fetchAPI, type ApiSection, type ApiStep, type ApiWorkflow } from "@/lib/vault-api";
import { getRunToken } from "@/lib/runTokens";
import type { ResolvedBranding } from "@shared/types/branding";
import type { ListValue } from "@shared/types/stepConfigs";
import type { LogicRule } from "@shared/schema";

interface WorkflowRunnerProps {
  runId?: string;
  previewEnvironment?: PreviewEnvironment;
  isPreview?: boolean;
  onPreviewComplete?: () => void;
}

type RunnerWorkflow = Pick<ApiWorkflow, 'id' | 'title' | 'description' | 'projectId' | 'settings'>;

type FinalSectionConfig = ComponentProps<typeof FinalDocumentsSection>['sectionConfig'];
type SaveStatus = ComponentProps<typeof ClientRunnerLayout>['saveStatus'];
type RunnerSectionConfig = FinalSectionConfig & {
  finalBlock?: unknown;
};

interface WorkflowRunnerScreenProps {
  isInitializing: boolean;
  initError: string | null;
  sections: ApiSection[] | undefined;
  workflowId: string | undefined;
  isProductionMode: boolean;
  actualRunId: string | null;
  workflow: RunnerWorkflow | undefined;
  branding: ResolvedBranding;
  currentSection: ApiSection | undefined;
  currentSectionIndex: number;
  visibleSections: ApiSection[];
  effectiveAllSteps: ApiStep[] | undefined;
  effectiveValues: Record<string, unknown>;
  effectiveLogicRules: LogicRule[];
  visibleSectionSteps: ApiStep[];
  runToken: string | null;
  saveStatus: SaveStatus;
  saveNow: () => Promise<void>;
  showReview: boolean;
  isCompleted: boolean;
  finalSectionConfig?: RunnerSectionConfig;
  isLastSection: boolean;
  errors: string[];
  fieldErrors: Record<string, string[]>;
  completeMutationIsPending: boolean;
  handleNext: () => Promise<void>;
  handlePrev: () => Promise<void>;
  handleFinalSubmit: () => Promise<void>;
  handleUpdateValue: (stepId: string, value: unknown) => void;
  setCurrentSectionIndex: (sectionIndex: number) => void;
  setShowReview: (showReview: boolean) => void;
}

export type LoadedRunnerScreenProps = Omit<
  WorkflowRunnerScreenProps,
  'isInitializing' | 'initError' | 'sections' | 'workflowId' | 'isProductionMode'
>;

function getRunnerSectionConfig(section: ApiSection): RunnerSectionConfig {
  return (section.config ?? {}) as RunnerSectionConfig;
}

function hasFinalBlock(section: ApiSection | undefined): boolean {
  return section != null && Boolean(getRunnerSectionConfig(section).finalBlock);
}

export function partitionRunnerSections(visibleSections: ApiSection[]): {
  respondentSections: ApiSection[];
  finalSection: ApiSection | undefined;
} {
  return {
    respondentSections: visibleSections.filter((section) => !hasFinalBlock(section)),
    finalSection: visibleSections.find((section) => hasFinalBlock(section)),
  };
}

function getProgress(currentSectionIndex: number, totalSections: number): number {
  return Math.round((currentSectionIndex / Math.max(1, totalSections)) * 100);
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

export function WorkflowRunner({ runId, previewEnvironment, isPreview: _isPreview = false, onPreviewComplete }: WorkflowRunnerProps) {
  // 1. Session & Initialization
  const { actualRunId, isInitializing, initError, mode, previewState, run, runtime, workflowId } = useRunSession(runId, previewEnvironment);
  const isProductionMode = mode === 'production';

  // 2. Fetch Core Data
  const { data: previewWorkflow } = useWorkflow(workflowId ?? "", { enabled: !isProductionMode && workflowId != null });
  const workflow = isProductionMode ? runtime?.workflow : previewWorkflow;

  // 3. Resolve Sections & Steps
  const sections = useMemo(() => {
    return isProductionMode ? runtime?.sections : previewEnvironment?.getSections();
  }, [isProductionMode, previewEnvironment, runtime?.sections]);

  const runToken = actualRunId != null ? getRunToken(actualRunId) : null;
  const effectiveAllSteps = isProductionMode ? runtime?.steps : previewEnvironment?.getSteps();

  const { data: logicRules } = useQuery({
    queryKey: ['/api/workflows', workflowId, 'logic-rules', actualRunId],
    queryFn: () => fetchAPI<LogicRule[]>(`/api/workflows/${workflowId}/logic-rules`),
    enabled: workflowId != null && workflowId !== "" && !isProductionMode,
  });

  const effectiveLogicRules = (isProductionMode ? runtime?.logicRules : logicRules) as LogicRule[] | undefined ?? [];

  // 4. Form Values & Autosave
  const { effectiveValues, handleUpdateValue, saveStatus, saveNow } = useRunValues({
    mode,
    actualRunId,
    run,
    previewState,
    previewEnvironment
  });

  // 5. Visibility Engine
  const { visibleSections, getVisibleSectionSteps } = useSectionVisibility(
    sections,
    effectiveAllSteps,
    effectiveValues,
    effectiveLogicRules
  );
  const { respondentSections, finalSection } = useMemo(
    () => partitionRunnerSections(visibleSections),
    [visibleSections]
  );
  const finalSectionConfig = finalSection ? getRunnerSectionConfig(finalSection) : undefined;

  const navigationTransport = useRunNavigationTransport({
    mode,
    previewEnvironment,
    getVisibleSectionSteps,
    onPreviewComplete,
    saveNow
  });

  // 6. Navigation & Validation
  const {
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
    completeMutationIsPending
  } = useRunNavigation({
    actualRunId,
    workflowId,
    runVersionId: run?.workflowVersionId ?? undefined,
    initialCompleted: run?.completed ?? false,
    initialSectionId: run?.currentSectionId,
    visibleSections: respondentSections,
    effectiveValues,
    transport: navigationTransport
  });

  const visibleSectionSteps = currentSection != null ? getVisibleSectionSteps(currentSection.id) : [];

  // Production branding is resolved server-side onto the runtime payload;
  // preview has no run, so it resolves the workflow's own settings (GH-158).
  const branding = useResolvedRunnerBranding(runtime?.branding, workflow?.settings);

  return (
    <WorkflowRunnerScreen
      isInitializing={isInitializing}
      initError={initError}
      sections={sections}
      workflowId={workflowId}
      isProductionMode={isProductionMode}
      actualRunId={actualRunId}
      workflow={workflow}
      branding={branding}
      currentSection={currentSection}
      currentSectionIndex={currentSectionIndex}
      visibleSections={respondentSections}
      effectiveAllSteps={effectiveAllSteps}
      effectiveValues={effectiveValues}
      effectiveLogicRules={effectiveLogicRules}
      visibleSectionSteps={visibleSectionSteps}
      runToken={runToken}
      saveStatus={saveStatus}
      saveNow={saveNow}
      showReview={showReview}
      isCompleted={isCompleted}
      finalSectionConfig={finalSectionConfig}
      isLastSection={isLastSection}
      errors={errors}
      fieldErrors={fieldErrors}
      completeMutationIsPending={completeMutationIsPending}
      handleNext={handleNext}
      handlePrev={handlePrev}
      handleFinalSubmit={handleFinalSubmit}
      handleUpdateValue={handleUpdateValue}
      setCurrentSectionIndex={setCurrentSectionIndex}
      setShowReview={setShowReview}
    />
  );
}

function WorkflowRunnerScreen(props: WorkflowRunnerScreenProps): ReactElement {
  const { isInitializing, initError, sections, workflowId, isProductionMode, actualRunId } = props;

  if (isInitializing) {
    return <FullScreenLoader message="Starting session..." />;
  }

  if (initError != null) {
    return <SessionError message={initError} />;
  }

  if (sections == null || workflowId == null || workflowId === "" || (isProductionMode && actualRunId == null)) {
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

function NoVisibleSectionsScreen({ actualRunId, completeMutationIsPending, handleFinalSubmit }: LoadedRunnerScreenProps): ReactElement {
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
        finalSectionConfig={props.finalSectionConfig}
        branding={props.branding}
      />
    );
  }

  if (props.showReview) {
    return <ReviewRunnerScreen {...props} />;
  }

  if (props.visibleSections.length === 0) {
    return <NoVisibleSectionsScreen {...props} />;
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
  finalSectionConfig?: RunnerSectionConfig;
  branding: ResolvedBranding;
}

function CompletedRunnerScreen({
  workflow,
  actualRunId,
  runToken,
  finalSectionConfig,
  branding,
}: CompletedRunnerScreenProps): ReactElement {
  const settings = (workflow?.settings ?? {}) as RunnerSettings;
  const redirectUrl = finalSectionConfig ? null : getSafeRedirectUrl(settings.redirectUrl);

  useEffect(() => {
    if (!redirectUrl) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      window.location.assign(redirectUrl);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [redirectUrl]);

  if (actualRunId && finalSectionConfig) {
    return (
      <ClientRunnerLayout
        title={getWorkflowTitle(workflow)}
        progress={100}
        currentStep={1}
        totalSteps={1}
        saveStatus="saved"
        branding={branding}
      >
        <FinalDocumentsSection
          runId={actualRunId}
          runToken={runToken ?? undefined}
          sectionConfig={finalSectionConfig}
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
  visibleSections,
  effectiveAllSteps,
  effectiveValues,
  saveStatus,
  completeMutationIsPending,
  handleFinalSubmit,
  setCurrentSectionIndex,
  setShowReview,
}: LoadedRunnerScreenProps): ReactElement {
  return (
    <ClientRunnerLayout
      title={getWorkflowTitle(workflow)}
      progress={100}
      currentStep={visibleSections.length}
      totalSteps={visibleSections.length}
      saveStatus={saveStatus}
      branding={branding}
    >
      <ReviewSection
        sections={visibleSections}
        allSteps={effectiveAllSteps ?? []}
        values={effectiveValues}
        visibleSectionIds={visibleSections.map((section) => section.id)}
        onEditSection={(sectionIndex) => {
          setCurrentSectionIndex(sectionIndex);
          setShowReview(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
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
    currentSection,
    currentSectionIndex,
    visibleSections,
    saveStatus,
    saveNow,
    errors,
    visibleSectionSteps,
    effectiveAllSteps,
    effectiveValues,
    handleUpdateValue,
    fieldErrors,
    effectiveLogicRules,
    handlePrev,
    handleNext,
    isLastSection,
    actualRunId,
    runToken,
  } = props;

  const saveAndResumeAction = actualRunId && runToken && allowsSaveAndResume(workflow) ? (
    <SaveAndResumeButton runId={actualRunId} runToken={runToken} saveNow={saveNow} />
  ) : undefined;

  return (
    <ClientRunnerLayout
      title={getWorkflowTitle(workflow)}
      progress={getProgress(currentSectionIndex, visibleSections.length)}
      currentStep={currentSectionIndex}
      totalSteps={visibleSections.length}
      saveStatus={saveStatus}
      saveAndResumeAction={saveAndResumeAction}
      branding={branding}
    >
      <Card className="shadow-lg border-t-4 border-t-primary dark:bg-zinc-900 overflow-visible mt-6 md:mt-0">
        <QuestionSectionHeader currentSection={currentSection} />
        {/* Keyed by section so drilling into a List never survives a section change (LIST-8) — resume always reopens at the section, not mid-drill. */}
        <ListDrillProvider key={currentSection?.id}>
          <QuestionCardContent
            currentSection={currentSection}
            visibleSectionSteps={visibleSectionSteps}
            allSteps={effectiveAllSteps}
            effectiveValues={effectiveValues}
            handleUpdateValue={handleUpdateValue}
            fieldErrors={fieldErrors}
            effectiveLogicRules={effectiveLogicRules}
            errors={errors}
            currentSectionIndex={currentSectionIndex}
            isLastSection={isLastSection}
            handlePrev={handlePrev}
            handleNext={handleNext}
          />
        </ListDrillProvider>
      </Card>
    </ClientRunnerLayout>
  );
}

export interface QuestionCardContentProps extends QuestionSectionBodyProps {
  errors: string[];
  currentSectionIndex: number;
  isLastSection: boolean;
  handlePrev: () => Promise<void>;
  handleNext: () => Promise<void>;
}

/**
 * Switches the section body (and Back/Next) for the List drill-in editor
 * while a List step is drilled into (LIST-8) — drilling replaces the whole
 * section body, not just the List step's own row, and hides Back/Next in
 * favor of the editor's own "← parent"/"Done" controls. Exported (alongside
 * `partitionRunnerSections`/`LoadedRunnerScreen`) so tests can render it
 * directly instead of standing up the whole data-fetching page.
 */
export function QuestionCardContent({
  currentSection,
  visibleSectionSteps,
  allSteps,
  effectiveValues,
  handleUpdateValue,
  fieldErrors,
  effectiveLogicRules,
  errors,
  currentSectionIndex,
  isLastSection,
  handlePrev,
  handleNext,
}: QuestionCardContentProps): ReactElement {
  const { drill } = useListDrill();
  const drilledStep = drill
    ? (visibleSectionSteps.find((step) => step.id === drill.stepId) ?? allSteps?.find((step) => step.id === drill.stepId))
    : undefined;

  // Alias -> step id map for a drilled field's dynamic options (e.g. a
  // `choice` field bound to another list step), mirroring how
  // SectionSteps.tsx builds the same map for the non-drilled path.
  const aliasSourceSteps = allSteps ?? visibleSectionSteps;
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
            />
          </BlockErrorBoundary>
        ) : (
          <QuestionSectionBody
            currentSection={currentSection}
            visibleSectionSteps={visibleSectionSteps}
            allSteps={allSteps}
            effectiveValues={effectiveValues}
            handleUpdateValue={handleUpdateValue}
            fieldErrors={fieldErrors}
            effectiveLogicRules={effectiveLogicRules}
          />
        )}
      </CardContent>
      {!drill && (
        <QuestionNavigation
          currentSectionIndex={currentSectionIndex}
          isLastSection={isLastSection}
          handlePrev={handlePrev}
          handleNext={handleNext}
        />
      )}
    </>
  );
}

function QuestionSectionHeader({ currentSection }: { currentSection: ApiSection | undefined }): ReactElement | null {
  if (currentSection == null) {
    return null;
  }

  return (
    <CardHeader className="bg-gray-50/50 dark:bg-zinc-800/50 border-b pb-6">
      <CardTitle className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {currentSection.title}
      </CardTitle>
      {currentSection.description != null && currentSection.description !== "" && (
        <CardDescription className="text-base mt-2 whitespace-pre-wrap dark:text-gray-400">
          {currentSection.description}
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

interface QuestionSectionBodyProps {
  currentSection: ApiSection | undefined;
  visibleSectionSteps: ApiStep[];
  allSteps: ApiStep[] | undefined;
  effectiveValues: Record<string, unknown>;
  handleUpdateValue: (stepId: string, value: unknown) => void;
  fieldErrors: Record<string, string[]>;
  effectiveLogicRules: LogicRule[];
}

function QuestionSectionBody({
  currentSection,
  visibleSectionSteps,
  allSteps,
  effectiveValues,
  handleUpdateValue,
  fieldErrors,
  effectiveLogicRules,
}: QuestionSectionBodyProps): ReactElement {
  if (currentSection != null && visibleSectionSteps.length > 0) {
    return (
      <SectionSteps
        sectionId={currentSection.id}
        steps={visibleSectionSteps}
        allSteps={allSteps}
        values={effectiveValues}
        onChange={handleUpdateValue}
        errors={fieldErrors}
        logicRules={effectiveLogicRules}
      />
    );
  }

  return (
    <div className="py-12 text-center text-gray-500 italic border border-dashed rounded-lg bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700">
      {currentSection != null ? "No questions in this section." : "No visible sections."}
    </div>
  );
}

interface QuestionNavigationProps {
  currentSectionIndex: number;
  isLastSection: boolean;
  handlePrev: () => Promise<void>;
  handleNext: () => Promise<void>;
}

function QuestionNavigation({
  currentSectionIndex,
  isLastSection,
  handlePrev,
  handleNext,
}: QuestionNavigationProps): ReactElement {
  return (
    <div className="px-6 py-4 md:px-8 border-t bg-gray-50 dark:bg-zinc-900/50 rounded-b-xl flex justify-between items-center sticky bottom-0 z-10">
      <Button
        type="button"
        variant="outline"
        onClick={() => { void handlePrev(); }}
        disabled={currentSectionIndex === 0}
        className="w-28 md:w-32 shadow-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Button type="button" onClick={() => { void handleNext(); }} className="w-28 md:w-32 shadow-sm font-medium relative group">
        {isLastSection ? (
          <>Review <Check className="w-4 h-4 ml-2" /></>
        ) : (
          <>Next <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>
        )}
      </Button>
    </div>
  );
}
