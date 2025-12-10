/**
 * Preview Runner - Full-page preview mode with bearer token auth
 * Launched from builder, uses runToken instead of session auth
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Eye, Loader2, Sparkles } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PreviewSidebar } from "@/components/runner/PreviewSidebar";
import { FillPageWithRandomDataButton } from "@/components/runner/FillPageWithRandomDataButton";
import { FinalDocumentsSection } from "@/components/runner/sections/FinalDocumentsSection";
import { BlockRenderer } from "@/components/runner/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { usePreviewStore } from "@/store/preview";
import { useWorkflowVisibility } from "@/hooks/useWorkflowVisibility";
import { apiWithToken } from "@/lib/vault-api";
import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import type { ApiRun, ApiStepValue, ApiSection, ApiStep } from "@/lib/vault-api";
import type { LogicRule } from "@shared/schema";

export default function PreviewRunner() {
  const { id: runId = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = usePreviewStore((s) => s.getToken(runId));

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Preview Token Missing</CardTitle>
            <CardDescription>
              This preview session has expired or was not properly initialized.
              Please return to the builder and launch preview again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/workflows')} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Workflows
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PreviewContent runId={runId} runToken={token} />;
}

interface PreviewContentProps {
  runId: string;
  runToken: string;
}

function PreviewContent({ runId, runToken }: PreviewContentProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const api = apiWithToken(runToken);

  // State
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Fetch run with values
  const { data: runData, isLoading: loadingRun } = useQuery({
    queryKey: ["preview-run", runId],
    queryFn: () =>
      api.get<{ success: boolean; data: ApiRun & { values: ApiStepValue[] } }>(
        `/api/runs/${runId}/values`
      ),
  });

  const run = runData?.data;

  // Function to navigate back to builder
  const navigateToBuilder = () => {
    if (run?.workflowId) {
      navigate(`/workflows/${run.workflowId}/builder`);
    } else {
      navigate('/workflows');
    }
  };

  // Fetch workflow with ALL details (sections + steps + logic rules) in ONE call
  // This replaces the previous separate queries for sections and logic rules
  const { data: workflowData, isLoading: loadingWorkflow } = useQuery({
    queryKey: ["preview-workflow-details", run?.workflowId],
    queryFn: async () => {
      return await api.get<{
        id: string;
        title: string;
        sections: (ApiSection & { steps: ApiStep[] })[];
        logicRules: LogicRule[];
      }>(
        `/api/workflows/${run?.workflowId}`
      );
    },
    enabled: !!run?.workflowId,
  });

  // Extract sections and logic rules from workflow data
  const sections = workflowData?.sections;
  const logicRules = workflowData?.logicRules;

  // Flatten all steps from all sections for alias resolution
  const rawWorkflowSteps = sections?.flatMap(section => section.steps) || [];

  // Map API steps to internal Step type (convert dates, handle nulls)
  const allWorkflowSteps = useMemo(() => {
    return rawWorkflowSteps.map(step => ({
      ...step,
      createdAt: step.createdAt ? new Date(step.createdAt) : null,
      updatedAt: step.updatedAt ? new Date(step.updatedAt) : null,
      alias: step.alias,
      description: step.description,
      visibleIf: step.visibleIf || null,
      defaultValue: step.defaultValue ?? null,
      isVirtual: step.isVirtual || false,
      repeaterConfig: step.repeaterConfig || null,
    }));
  }, [rawWorkflowSteps]);

  // Initialize form values from run values
  useEffect(() => {
    if (run?.values) {
      const initial: Record<string, any> = {};
      run.values.forEach((v) => {
        initial[v.stepId] = v.value;
      });
      setFormValues(initial);
    }
  }, [run]);

  // Helper function to calculate visible sections
  // Takes formValues as a parameter to avoid closure issues
  const calculateVisibleSections = (currentFormValues: Record<string, any>) => {
    if (!sections) return [];

    // Create alias resolver for section visibility
    const aliasResolver = (variableName: string): string | undefined => {
      const step = allWorkflowSteps.find(s => s.alias === variableName);
      return step?.id;
    };

    return sections.filter(section => {
      // If section has no visibleIf, it's visible by default
      if (!section.visibleIf) {
        return true;
      }

      try {
        return evaluateConditionExpression(section.visibleIf as any, currentFormValues, aliasResolver);
      } catch (error) {
        console.error('Error evaluating section visibility:', error);
        // On error, default to visible
        return true;
      }
    });
  };

  // Submit section mutation
  const submitMutation = useMutation({
    mutationFn: (data: { sectionId: string; values: Array<{ stepId: string; value: any }> }) => {
      console.log('[PreviewRunner] Submitting section:', {
        runId,
        sectionId: data.sectionId,
        values: data.values,
        valuesCount: data.values.length
      });
      return api.post<{ success: boolean; errors?: string[] }>(
        `/api/runs/${runId}/sections/${data.sectionId}/submit`,
        { values: data.values }
      );
    },
    onError: (error) => {
      console.error('[PreviewRunner] Submit section error:', error);
      toast({
        title: "Submission Error",
        description: error instanceof Error ? error.message : "Failed to submit section",
        variant: "destructive",
      });
    },
  });

  // Next section mutation
  const nextMutation = useMutation({
    mutationFn: (currentSectionId: string) =>
      api.post<{ success: boolean; data: { nextSectionId?: string } }>(
        `/api/runs/${runId}/next`,
        { currentSectionId }
      ),
  });

  // Complete run mutation
  const completeMutation = useMutation({
    mutationFn: () => api.put<{ success: boolean; data: ApiRun }>(`/api/runs/${runId}/complete`),
  });

  const handleNext = async () => {
    if (!sections || !run) return;

    setErrors([]);

    const currentSection = sections[currentSectionIndex];

    // Ensure allWorkflowSteps is available
    if (!allWorkflowSteps || allWorkflowSteps.length === 0) {
      toast({
        title: "Error",
        description: "Workflow data not loaded properly. Please refresh.",
        variant: "destructive",
      });
      return;
    }

    // Get steps for current section (excluding virtual and system steps)
    const currentSectionSteps = allWorkflowSteps.filter(
      step => step.sectionId === currentSection.id &&
        !step.isVirtual && // Exclude virtual steps (transform outputs)
        step.type !== 'final_documents' // Exclude system steps
    );
    const currentSectionStepIds = new Set(currentSectionSteps.map(s => s.id));

    // Collect values ONLY for steps in the current section
    const sectionValues = Object.keys(formValues)
      .filter(stepId => currentSectionStepIds.has(stepId))
      .map((stepId) => ({
        stepId,
        value: formValues[stepId],
      }));

    try {
      // For preview mode, we can do optimistic navigation:
      // 1. Calculate visibility immediately based on current formValues
      // 2. Navigate to next section
      // 3. Submit to server in background

      // IMPORTANT: Calculate visible sections BEFORE submission for instant navigation
      const visibleSectionsAfterSubmit = calculateVisibleSections(formValues);

      if (!visibleSectionsAfterSubmit.length) {
        toast({
          title: "Error",
          description: "No visible sections found",
          variant: "destructive",
        });
        return;
      }

      // Find current section's position in visible sections
      const currentVisibleIndex = visibleSectionsAfterSubmit.findIndex(s => s.id === currentSection.id);

      // Check if current section is still visible and if it's the last one
      const isLastVisibleSection = currentVisibleIndex >= 0 && currentVisibleIndex === visibleSectionsAfterSubmit.length - 1;

      if (isLastVisibleSection) {
        // IMPORTANT: Must await section submission before completing the run
        const submitResult = await submitMutation.mutateAsync({
          sectionId: currentSection.id,
          values: sectionValues,
        });

        // Check if submission had validation errors
        if (!submitResult.success && submitResult.errors) {
          setErrors(submitResult.errors || []);
          toast({
            title: "Validation Error",
            description: submitResult.errors?.[0] || "Please check the form and try again",
            variant: "destructive"
          });
          return;
        }

        // Now safe to complete the run
        await completeMutation.mutateAsync();
        toast({ title: "Complete!", description: "Preview completed successfully" });

        // Navigate back to builder after a short delay
        setTimeout(() => {
          if (run?.workflowId) {
            navigate(`/workflows/${run.workflowId}/builder`);
          }
        }, 1500);
        return;
      }

      // Determine the next visible section
      let nextSectionToNavigate: typeof currentSection | undefined;

      if (currentVisibleIndex >= 0) {
        // Current section is still visible, get next visible section
        nextSectionToNavigate = visibleSectionsAfterSubmit[currentVisibleIndex + 1];
      } else {
        // Current section is now hidden, navigate to first visible section
        nextSectionToNavigate = visibleSectionsAfterSubmit[0];
      }

      if (nextSectionToNavigate) {
        const nextIndex = sections.findIndex(s => s.id === nextSectionToNavigate.id);
        if (nextIndex >= 0) {
          // OPTIMISTIC NAVIGATION: Navigate immediately
          setCurrentSectionIndex(nextIndex);

          // Submit to server in background (non-blocking)
          submitMutation.mutate(
            {
              sectionId: currentSection.id,
              values: sectionValues,
            },
            {
              onError: (error) => {
                console.error('[PreviewRunner] Background submit error:', error);
                toast({
                  title: "Warning",
                  description: error instanceof Error ? error.message : "Failed to save section data. Please try again.",
                  variant: "destructive",
                });
              },
            }
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to proceed";

      // Handle "already completed" errors specially
      if (errorMessage.includes("already completed")) {
        toast({
          title: "Preview Complete",
          description: "This preview has already been completed. Returning to builder...",
        });
        setTimeout(() => {
          if (run?.workflowId) {
            navigate(`/workflows/${run.workflowId}/builder`);
          }
        }, 1500);
        return;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handlePrev = () => {
    if (!sections) return;

    const currentSection = sections[currentSectionIndex];

    // Find current section in visible sections
    const currentVisibleIndex = visibleSections.findIndex(s => s.id === currentSection?.id);

    // If we're not at the first visible section, go to previous visible section
    if (currentVisibleIndex > 0) {
      const prevVisibleSection = visibleSections[currentVisibleIndex - 1];
      const prevIndex = sections.findIndex(s => s.id === prevVisibleSection.id);
      if (prevIndex >= 0) {
        setCurrentSectionIndex(prevIndex);
      }
    }
  };

  // Memoize visible sections calculation to avoid recalculating on every render
  // Recalculates only when sections, formValues, or allWorkflowSteps change
  const visibleSections = useMemo(() => {
    if (!sections) return [];
    return calculateVisibleSections(formValues);
  }, [sections, formValues, allWorkflowSteps]);

  // Get current section from the original sections array
  const currentSection = sections ? sections[currentSectionIndex] : null;

  // Check if current section is a Final Documents section
  const isFinalDocumentsSection = (currentSection?.config as any)?.finalBlock === true;

  // Auto-navigate if current section is hidden
  useEffect(() => {
    if (!sections || !currentSection || visibleSections.length === 0) return;

    const currentSectionVisible = visibleSections.find(s => s.id === currentSection.id);

    if (!currentSectionVisible) {
      // Find next visible section after the current one
      const nextVisible = visibleSections.find(s => s.order > currentSection.order);
      if (nextVisible) {
        const nextIndex = sections.findIndex(s => s.id === nextVisible.id);
        if (nextIndex >= 0 && nextIndex !== currentSectionIndex) {
          setCurrentSectionIndex(nextIndex);
        }
      } else {
        // No next visible section - go to first visible section
        const firstVisible = visibleSections[0];
        if (firstVisible) {
          const firstIndex = sections.findIndex(s => s.id === firstVisible.id);
          if (firstIndex >= 0 && firstIndex !== currentSectionIndex) {
            setCurrentSectionIndex(firstIndex);
          }
        }
      }
    }
  }, [currentSection?.id, visibleSections, sections, currentSectionIndex]);

  if (loadingRun || loadingWorkflow) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading preview...</span>
        </div>
      </div>
    );
  }

  if (!run || !sections || !currentSection) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load preview</p>
      </div>
    );
  }

  // Calculate progress based on position within visible sections
  const currentVisibleIndex = visibleSections.findIndex(s => s.id === currentSection.id);
  const displayIndex = currentVisibleIndex >= 0 ? currentVisibleIndex : 0;
  const progress = visibleSections.length > 0 ? ((displayIndex + 1) / visibleSections.length) * 100 : 0;
  const isLastSection = displayIndex === visibleSections.length - 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Preview Header */}
      <div className="sticky top-0 z-10 border-b bg-primary/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-primary">Preview Mode</p>
            <p className="text-xs text-muted-foreground">
              Changes in builder will not reflect here
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FillPageWithRandomDataButton
            runId={runId}
            currentSectionSteps={allWorkflowSteps?.filter(
              (step: any) => step.sectionId === currentSection.id &&
                !step.isVirtual &&
                step.type !== 'final_documents'
            ) || []}
            onValuesFilled={(values) => {
              setFormValues((prev) => ({ ...prev, ...values }));
              toast({
                title: "Page Filled",
                description: "AI has generated realistic test data for this section",
              });
            }}
          />
          <Button variant="outline" onClick={navigateToBuilder}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Builder
          </Button>
        </div>
      </div>

      {/* Runner Content */}
      <div className={`flex-1 container mx-auto p-8 transition-all duration-300 ${isSidebarCollapsed ? 'pr-12' : 'pr-[400px]'
        } max-w-3xl lg:max-w-6xl`}>
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Step {displayIndex + 1} of {visibleSections.length}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Section Card */}
        {isFinalDocumentsSection ? (
          <FinalDocumentsSection
            runId={runId}
            runToken={runToken}
            sectionConfig={(currentSection.config as any) || {
              screenTitle: "Your Completed Documents",
              markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
              templates: []
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{currentSection.title}</CardTitle>
              {currentSection.description && (
                <CardDescription>{currentSection.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <SectionSteps
                runId={runId}
                runToken={runToken}
                sectionId={currentSection.id}
                values={formValues}
                logicRules={logicRules || []}
                allWorkflowSteps={allWorkflowSteps}
                onChange={(stepId, value) =>
                  setFormValues((prev) => ({ ...prev, [stepId]: value }))
                }
              />

              {errors.length > 0 && (
                <div className="p-4 bg-destructive/10 border border-destructive rounded-md">
                  <ul className="text-sm text-destructive list-disc list-inside">
                    {errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={displayIndex === 0 || submitMutation.isPending || nextMutation.isPending}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <Button
            onClick={handleNext}
            disabled={
              submitMutation.isPending || nextMutation.isPending || completeMutation.isPending
            }
          >
            {isLastSection ? "Complete" : "Next"}
          </Button>
        </div>
      </div>

      {/* Preview Sidebar */}
      <PreviewSidebar
        workflowId={run.workflowId}
        runId={runId}
        runToken={runToken}
        formValues={formValues}
        allWorkflowSteps={rawWorkflowSteps || []}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={setIsSidebarCollapsed}
      />
    </div>
  );
}

interface SectionStepsProps {
  runId: string;
  runToken: string;
  sectionId: string;
  values: Record<string, any>;
  logicRules: LogicRule[];
  allWorkflowSteps: any[];
  onChange: (stepId: string, value: any) => void;
}

function SectionSteps({ runId, runToken, sectionId, values, logicRules, allWorkflowSteps, onChange }: SectionStepsProps) {
  // Filter steps for current section only
  const steps = allWorkflowSteps.filter(step => step.sectionId === sectionId);

  // Use visibility hook to evaluate which steps should be shown
  // Pass allWorkflowSteps for cross-section alias resolution
  const { isStepVisible } = useWorkflowVisibility(logicRules, allWorkflowSteps, values);

  if (!steps || steps.length === 0) {
    return <p className="text-muted-foreground text-sm">No steps in this section</p>;
  }

  // Filter steps to only show visible ones
  const visibleSteps = steps.filter((step) => {
    // Virtual steps are never shown
    if (step.isVirtual) return false;

    // Check visibility from logic rules
    return isStepVisible(step.id);
  });

  if (visibleSteps.length === 0) {
    return <p className="text-muted-foreground text-sm">No visible steps in this section</p>;
  }

  return (
    <>
      {visibleSteps.map((step) => {
        // Handle JS questions - check display config
        if (step.type === "js_question") {
          const config = step.options || {};
          if (config.display === "hidden") {
            // Hidden JS blocks don't render
            return null;
          }
          // Visible JS blocks render with help text
          return (
            <div key={step.id} className="space-y-2">
              <Label>{step.title}</Label>
              {config.helpText && (
                <p className="text-sm text-muted-foreground">{config.helpText}</p>
              )}
              <p className="text-xs text-muted-foreground italic">
                This value will be computed automatically
              </p>
            </div>
          );
        }

        return (
          <StepField
            key={step.id}
            step={step}
            value={values[step.id]}
            onChange={(v) => onChange(step.id, v)}
          />
        );
      })}
    </>
  );
}

/**
 * StepField - Thin wrapper around BlockRenderer
 *
 * Now uses the new comprehensive BlockRenderer system that supports
 * all block types with proper validation and nested data handling.
 */
interface StepFieldProps {
  step: ApiStep;
  value: any;
  onChange: (value: any) => void;
}

function StepField({ step, value, onChange }: StepFieldProps) {
  return (
    <BlockRenderer
      step={step}
      value={value}
      onChange={onChange}
      required={step.required}
      readOnly={false}
    />
  );
}
