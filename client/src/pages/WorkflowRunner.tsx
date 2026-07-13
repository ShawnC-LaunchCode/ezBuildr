import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useMemo } from "react";
import { FullScreenLoader } from "@/components/ui/loader";

import { ClientRunnerLayout } from "@/components/runner/ClientRunnerLayout";
import { FinalDocumentsSection } from "@/components/runner/sections/FinalDocumentsSection";
import { IntakeAssignmentSection } from "@/components/runner/sections/IntakeAssignmentSection";
import { ReviewSection } from "@/components/runner/sections/ReviewSection";
import { SectionSteps } from "@/components/runner/SectionSteps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIntakeRuntime } from "@/hooks/useIntakeRuntime";
import { useRunSession } from "@/hooks/runner/useRunSession";
import { useRunValues } from "@/hooks/runner/useRunValues";
import { useSectionVisibility } from "@/hooks/runner/useSectionVisibility";
import { useRunNavigation } from "@/hooks/runner/useRunNavigation";
import type { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { useSections, useWorkflow } from "@/lib/vault-hooks";
import { apiWithToken, type ApiSection, type ApiStep } from "@/lib/vault-api";
import { getRunToken } from "@/lib/runTokens";

interface WorkflowRunnerProps {
  runId?: string;
  previewEnvironment?: PreviewEnvironment;
  isPreview?: boolean;
  onPreviewComplete?: () => void;
}

export function WorkflowRunner({ runId, previewEnvironment, isPreview: _isPreview = false, onPreviewComplete }: WorkflowRunnerProps) {
  // 1. Session & Initialization
  const { actualRunId, isInitializing, initError, mode, previewState, run, workflowId } = useRunSession(runId, previewEnvironment);

  // 2. Fetch Core Data
  const intakeData = useIntakeRuntime(workflowId ?? "");
  const { data: workflow } = useWorkflow(workflowId ?? "");
  const { data: fetchedSections } = useSections(workflowId, { enabled: mode !== 'preview' });

  // 3. Resolve Sections & Steps
  const sections = useMemo(() => {
    return mode === 'preview' ? previewEnvironment?.getSections() : fetchedSections;
  }, [mode, previewEnvironment, fetchedSections]);

  const runToken = actualRunId ? getRunToken(actualRunId) : null;
  const { data: allSteps } = useQuery({
    queryKey: ['/api/workflows', workflowId, 'all-steps', actualRunId],
    queryFn: () => {
      if (runToken) {
        const client = apiWithToken(runToken);
        return client.get<ApiStep[]>(`/api/workflows/${workflowId}/steps`);
      } else {
        return fetch(`/api/workflows/${workflowId}/steps`, { credentials: 'include' }).then(res => res.json());
      }
    },
    enabled: !!workflowId && mode !== 'preview',
  });
  
  const effectiveAllSteps = mode === 'preview' ? previewEnvironment?.getSteps() : allSteps;

  const { data: logicRules } = useQuery({
    queryKey: ['/api/workflows', workflowId, 'logic-rules', actualRunId],
    queryFn: () => {
      if (runToken) {
        const client = apiWithToken(runToken);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return client.get<any[]>(`/api/workflows/${workflowId}/logic-rules`);
      } else {
        return fetch(`/api/workflows/${workflowId}/logic-rules`, { credentials: 'include' }).then(res => res.json());
      }
    },
    enabled: !!workflowId && mode !== 'preview',
  });

  const effectiveLogicRules = mode === 'preview' ? [] : (logicRules ?? []);

  // 4. Form Values & Autosave
  const { formValues, setFormValues, effectiveValues, handleUpdateValue, saveStatus, saveNow } = useRunValues({
    mode,
    actualRunId,
    run,
    previewState,
    previewEnvironment,
    allSteps: effectiveAllSteps,
    intakeData
  });

  // 5. Visibility Engine
  const { visibleSections, getVisibleSectionSteps, resolveAlias } = useSectionVisibility(
    sections,
    effectiveAllSteps,
    effectiveValues
  );

  // 6. Navigation & Validation
  const {
    currentSectionIndex,
    setCurrentSectionIndex,
    currentSection,
    isLastSection,
    showReview,
    setShowReview,
    errors,
    fieldErrors,
    handleNext,
    handlePrev,
    handleFinalSubmit,
    completeMutationIsPending
  } = useRunNavigation({
    mode,
    actualRunId,
    workflowId,
    runVersionId: run?.versionId,
    visibleSections,
    effectiveValues,
    previewEnvironment,
    getVisibleSectionSteps,
    onPreviewComplete,
    saveNow
  });

  // Early returns for initialization and errors
  if (isInitializing) {
    return <FullScreenLoader message="Starting session..." />;
  }
  if (initError) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
        <Card className="w-full max-w-md shadow-lg border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Session Error</CardTitle>
            <CardDescription>We couldn't start this workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300">{initError}</p>
            <Button className="mt-4 w-full" onClick={() => window.location.href = '/'}>
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!sections || !workflowId || (mode === 'production' && !actualRunId)) {
    return <FullScreenLoader message="Loading workflow..." />;
  }

  // Handle specific section overrides
  if (currentSection && (currentSection.config as any)?.intakeAssignment) {
    return (
      <ClientRunnerLayout title={workflow?.title ?? "Workflow"} progress={Math.round((currentSectionIndex / Math.max(1, visibleSections.length)) * 100)} currentStep={currentSectionIndex} totalSteps={visibleSections.length} saveStatus={saveStatus}>
        <IntakeAssignmentSection workflow={workflow as any} runValues={effectiveValues} onComplete={handleNext} />
      </ClientRunnerLayout>
    );
  }
  if (currentSection && (currentSection.config as any)?.finalBlock) {
    return (
      <ClientRunnerLayout title={workflow?.title ?? "Workflow"} currentStep={currentSectionIndex} totalSteps={visibleSections.length} saveStatus={saveStatus}>
        <FinalDocumentsSection runId={actualRunId!} runToken={runToken ?? undefined} sectionConfig={currentSection.config as any} />
      </ClientRunnerLayout>
    );
  }
  if (showReview) {
    return (
      <ClientRunnerLayout title={workflow?.title ?? "Workflow"} progress={100} currentStep={visibleSections.length} totalSteps={visibleSections.length} saveStatus={saveStatus}>
        <ReviewSection 
          sections={visibleSections} 
          allSteps={effectiveAllSteps ?? []}
          values={effectiveValues} 
          visibleSectionIds={visibleSections.map(s => s.id)}
          onEditSection={(sectionIndex) => {
            setCurrentSectionIndex(sectionIndex);
            setShowReview(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        <div className="mt-8 flex justify-between">
          <Button type="button" variant="outline" onClick={() => setShowReview(false)}>
            Back
          </Button>
          <Button type="button" onClick={handleFinalSubmit} disabled={completeMutationIsPending}>
            {completeMutationIsPending ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </ClientRunnerLayout>
    );
  }

  const visibleSectionSteps = currentSection ? getVisibleSectionSteps(currentSection.id, mode === 'preview' ? previewState : undefined) : [];

  return (
    <ClientRunnerLayout title={workflow?.title ?? "Workflow"} progress={Math.round((currentSectionIndex / Math.max(1, visibleSections.length)) * 100)} currentStep={currentSectionIndex} totalSteps={visibleSections.length} saveStatus={saveStatus}>
      <Card className="shadow-lg border-t-4 border-t-primary dark:bg-zinc-900 overflow-visible mt-6 md:mt-0">
        {currentSection && (
          <CardHeader className="bg-gray-50/50 dark:bg-zinc-800/50 border-b pb-6">
            <CardTitle className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {currentSection.title}
            </CardTitle>
            {currentSection.description && (
              <CardDescription className="text-base mt-2 whitespace-pre-wrap dark:text-gray-400">
                {currentSection.description}
              </CardDescription>
            )}
          </CardHeader>
        )}
        <CardContent className="pt-8 overflow-visible p-6 md:p-8">
          {errors.length > 0 && (
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
          )}
          {currentSection && visibleSectionSteps.length > 0 ? (
            <SectionSteps 
              sectionId={currentSection.id}
              steps={visibleSectionSteps} 
              values={effectiveValues} 
              onChange={handleUpdateValue} 
              errors={fieldErrors}
              logicRules={effectiveLogicRules}
            />
          ) : (
            <div className="py-12 text-center text-gray-500 italic border border-dashed rounded-lg bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700">
              {currentSection ? "No questions in this section." : "No visible sections."}
            </div>
          )}
        </CardContent>
        <div className="px-6 py-4 md:px-8 border-t bg-gray-50 dark:bg-zinc-900/50 rounded-b-xl flex justify-between items-center sticky bottom-0 z-10">
          <Button type="button" variant="outline" onClick={handlePrev} disabled={currentSectionIndex === 0} className="w-28 md:w-32 shadow-sm font-medium">
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button type="button" onClick={handleNext} className="w-28 md:w-32 shadow-sm font-medium relative group">
            {isLastSection ? (
              <>Review <Check className="w-4 h-4 ml-2" /></>
            ) : (
              <>Next <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>
            )}
          </Button>
        </div>
      </Card>
    </ClientRunnerLayout>
  );
}