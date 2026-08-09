import { ArrowLeft, CheckCircle2, FileText, ListChecks, PlayCircle, Upload as UploadIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProjects } from "@/lib/vault-hooks";

import { completeOnboarding, OnboardingApiError } from "./onboardingApi";
import { ReviewStep, type GenerationError } from "./ReviewStep";
import { UploadStep } from "./UploadStep";

import type { OnboardingVariable } from "./onboardingTypes";

type WizardPhase = "upload" | "review" | "done";

interface WizardStepMeta {
  id: WizardPhase;
  title: string;
  icon: typeof UploadIcon;
}

const WIZARD_STEPS: WizardStepMeta[] = [
  { id: "upload", title: "Upload document", icon: UploadIcon },
  { id: "review", title: "Review & approve", icon: ListChecks },
  { id: "done", title: "Done", icon: CheckCircle2 },
];

interface PendingApproval {
  projectId: string;
  variables: OnboardingVariable[];
}

/**
 * Document-to-interview onboarding wizard (GH-167).
 *
 * Upload a document -> AI extracts variables -> author reviews & approves
 * question type/alias per variable -> a workflow is generated and created,
 * unpublished, with the document attached and its field mapping pre-written
 * -> hand off to GH-156's mapping workbench (and, optionally, PreviewRunner).
 *
 * Deliberately does NOT publish (Decision, Senior 2026-08-08) and does NOT
 * reimplement the mapping workbench's binding UI (deep-links to it instead).
 */
export default function DocumentOnboardingWizard(): JSX.Element {
  const [, navigate] = useLocation();
  const { data: projects } = useProjects();

  const [phase, setPhase] = useState<WizardPhase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [variables, setVariables] = useState<OnboardingVariable[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<GenerationError | null>(null);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [result, setResult] = useState<{ workflowId: string } | null>(null);

  const activeIndex = WIZARD_STEPS.findIndex((s) => s.id === phase);

  const handleExtracted = useCallback((extracted: OnboardingVariable[], chosenFile: File) => {
    setVariables(extracted);
    setFile(chosenFile);
    setGenerationError(null);
    setPhase("review");
  }, []);

  const runApproval = useCallback(
    async (payload: PendingApproval) => {
      if (file === null) {
        return;
      }
      setPending(payload);
      setIsGenerating(true);
      setGenerationError(null);
      try {
        const outcome = await completeOnboarding({
          projectId: payload.projectId,
          file,
          documentName: file.name,
          variables: payload.variables,
        });
        setResult({ workflowId: outcome.workflowId });
        setPhase("done");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Workflow generation failed";
        const retryable = error instanceof OnboardingApiError ? error.retryable : true;
        setGenerationError({ message, retryable });
      } finally {
        setIsGenerating(false);
      }
    },
    [file]
  );

  const handleApprove = useCallback(
    (payload: PendingApproval) => {
      void runApproval(payload);
    },
    [runApproval]
  );

  const handleRetry = useCallback(() => {
    if (pending) {
      void runApproval(pending);
    }
  }, [pending, runApproval]);

  const handleCancel = useCallback(() => {
    navigate("/workflows");
  }, [navigate]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/workflows/new")}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back
        </Button>
        <h1 className="text-2xl font-semibold">Create a workflow from a document</h1>
        <p className="text-sm text-muted-foreground">
          Upload a document and AI drafts the workflow, questions, and field mapping for you to
          review before anything is created.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-3 space-y-2">
          {WIZARD_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-lg p-3 text-sm transition-colors ${
                index === activeIndex
                  ? "bg-primary font-medium text-primary-foreground"
                  : index < activeIndex
                    ? "text-muted-foreground"
                    : "text-muted-foreground opacity-50"
              }`}
            >
              <step.icon className="h-4 w-4" aria-hidden="true" />
              <span>{step.title}</span>
              {index < activeIndex && <CheckCircle2 className="ml-auto h-4 w-4 opacity-60" aria-hidden="true" />}
            </div>
          ))}
        </div>

        <div className="col-span-9">
          <Card>
            <CardContent className="pt-6">
              {phase === "upload" && <UploadStep onExtracted={handleExtracted} />}

              {phase === "review" && (
                <ReviewStep
                  variables={variables}
                  projects={(projects ?? []).map((p) => ({ id: p.id, title: p.title }))}
                  projectId={projectId}
                  onProjectChange={setProjectId}
                  onApprove={handleApprove}
                  onCancel={handleCancel}
                  isSubmitting={isGenerating}
                  error={generationError}
                  onRetry={handleRetry}
                />
              )}

              {phase === "done" && result !== null && (
                <div className="space-y-6 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
                    <h2 className="text-xl font-semibold">Workflow created</h2>
                    <p className="max-w-md text-sm text-muted-foreground">
                      The workflow and its questions were created and the document was attached with
                      its field mapping already written. It has not been published — review the
                      mapping, then publish when you&apos;re ready.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button onClick={() => navigate(`/workflows/${result.workflowId}/builder?tab=templates`)}>
                      <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                      Open field mapping
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/workflows/${result.workflowId}/preview`)}
                    >
                      <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      Preview workflow
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
