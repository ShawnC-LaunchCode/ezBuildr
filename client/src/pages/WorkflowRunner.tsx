/**
 * Workflow Runner - Participant view for completing workflows
 */

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRunWithValues, useSections, useSteps, useSubmitSection, useNext, useCompleteRun } from "@/lib/vault-hooks";
import { useWorkflowVisibility } from "@/hooks/useWorkflowVisibility";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import { FinalDocumentsSection } from "@/components/runner/sections/FinalDocumentsSection";
import type { LogicRule } from "@shared/schema";

interface WorkflowRunnerProps {
  runId: string;
  isPreview?: boolean;
}

// Helper to check if a string is a valid UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper to start a run from a public link slug
async function startRunFromSlug(
  slug: string,
  initialValues?: Record<string, any>
): Promise<{ runId: string; runToken: string; workflowId: string }> {
  const response = await fetch(`/api/workflows/public/${slug}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initialValues }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start workflow');
  }

  const result = await response.json();
  return result.data;
}

export function WorkflowRunner({ runId, isPreview = false }: WorkflowRunnerProps) {
  const [actualRunId, setActualRunId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const { toast } = useToast();

  // On mount, check if runId is a UUID or a slug
  useEffect(() => {
    async function initialize() {
      try {
        // Parse URL parameters to get initial values
        const urlParams = new URLSearchParams(window.location.search);
        const initialValues: Record<string, any> = {};

        // Convert URL params to initialValues object
        for (const [key, value] of urlParams.entries()) {
          // Skip non-step parameters (like 'ref', 'source', etc.)
          if (!['ref', 'source', 'utm_source', 'utm_medium', 'utm_campaign'].includes(key)) {
            // Try to parse as JSON for complex values
            try {
              initialValues[key] = JSON.parse(value);
            } catch {
              // If not JSON, keep as string
              initialValues[key] = value;
            }
          }
        }

        if (isUUID(runId)) {
          // It's already a run ID - use it directly
          setActualRunId(runId);
        } else {
          // It's a slug - need to start a new run with initial values
          const runData = await startRunFromSlug(
            runId,
            Object.keys(initialValues).length > 0 ? initialValues : undefined
          );
          setActualRunId(runData.runId);

          // Store the run token in localStorage for bearer auth
          localStorage.setItem(`run_token_${runData.runId}`, runData.runToken);
          // Also store as active token for other API calls (sections, steps, etc.)
          localStorage.setItem('active_run_token', runData.runToken);
        }
      } catch (error) {
        setInitError(error instanceof Error ? error.message : 'Failed to load workflow');
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : 'Failed to load workflow',
          variant: "destructive",
        });
      } finally {
        setIsInitializing(false);
      }
    }

    initialize();
  }, [runId, toast]);

  // Fetch run data - bearer token is automatically added by fetchAPI from localStorage
  const { data: run } = useRunWithValues(actualRunId || '');
  const { data: sections } = useSections(run?.workflowId);

  // Fetch logic rules for visibility evaluation
  const { data: logicRules } = useQuery<LogicRule[]>({
    queryKey: ["workflow-logic-rules", run?.workflowId],
    queryFn: async () => {
      const response = await fetch(`/api/workflows/${run?.workflowId}/logic-rules`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch logic rules");
      return response.json();
    },
    enabled: !!run?.workflowId,
  });

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const submitMutation = useSubmitSection();
  const nextMutation = useNext();
  const completeMutation = useCompleteRun();

  // Initialize form values from run.values
  useEffect(() => {
    if (run?.values) {
      const initial: Record<string, any> = {};
      run.values.forEach((v) => {
        initial[v.stepId] = v.value;
      });
      setFormValues(initial);
    }
  }, [run]);

  // Show initializing state
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Starting workflow...</p>
      </div>
    );
  }

  // Show error state
  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load workflow</p>
          <p className="text-sm text-muted-foreground">{initError}</p>
        </div>
      </div>
    );
  }

  // Show loading state while fetching run data
  if (!run || !sections) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  // Fetch all steps for alias resolution
  const { data: allSteps } = useQuery({
    queryKey: ["workflow-all-steps", run?.workflowId],
    queryFn: async () => {
      if (!sections) return [];
      const allStepPromises = sections.map(section =>
        fetch(`/api/sections/${section.id}/steps`, {
          credentials: "include",
        }).then(res => res.json())
      );
      const allStepArrays = await Promise.all(allStepPromises);
      return allStepArrays.flat();
    },
    enabled: !!run?.workflowId && !!sections,
  });

  // Memoize visible sections calculation with alias resolution
  const visibleSections = useMemo(() => {
    if (!sections) return [];

    // Create alias resolver for section visibility
    const aliasResolver = (variableName: string): string | undefined => {
      if (!allSteps) return undefined;
      const step = allSteps.find((s: any) => s.alias === variableName);
      return step?.id;
    };

    return sections.filter(section => {
      if (!section.visibleIf) return true;
      try {
        return evaluateConditionExpression(section.visibleIf as any, formValues, aliasResolver);
      } catch (error) {
        console.error('[WorkflowRunner] Error evaluating section visibility', section.id, error);
        return true;
      }
    });
  }, [sections, formValues, allSteps]);

  const currentSection = visibleSections[currentSectionIndex] || sections[currentSectionIndex];
  const progress = ((currentSectionIndex + 1) / visibleSections.length) * 100;
  const isLastSection = currentSectionIndex === visibleSections.length - 1;

  // Check if current section is a Final Documents section
  const isFinalDocumentsSection = (currentSection?.config as any)?.finalBlock === true;

  const handleNext = async () => {
    setErrors([]);

    // Get steps for current section (excluding virtual and system steps)
    const currentSectionSteps = allSteps.filter(
      step => step.sectionId === currentSection.id &&
              !step.isVirtual && // Exclude virtual steps (transform outputs)
              step.type !== 'final_documents' // Exclude system steps
    );
    const currentSectionStepIds = new Set(currentSectionSteps.map(s => s.id));

    // Collect values ONLY for steps in the current section
    const sectionValues = Object.keys(formValues)
      .filter((stepId) => currentSectionStepIds.has(stepId))
      .map((stepId) => ({ stepId, value: formValues[stepId] }));

    console.log('[WorkflowRunner] Submitting section:', {
      runId: actualRunId,
      sectionId: currentSection.id,
      values: sectionValues,
      valuesCount: sectionValues.length
    });

    try {
      // Submit section with validation
      const result = await submitMutation.mutateAsync({
        runId: actualRunId!,
        sectionId: currentSection.id,
        values: sectionValues,
      });

      if (!result.success && result.errors) {
        setErrors(result.errors);
        toast({ title: "Validation Error", description: result.errors[0], variant: "destructive" });
        return;
      }

      // If last section, complete the run
      if (isLastSection) {
        await completeMutation.mutateAsync(actualRunId!);
        toast({ title: "Complete!", description: "Workflow completed successfully" });
        return;
      }

      // Otherwise, navigate to next section
      const nextResult = await nextMutation.mutateAsync({
        runId: actualRunId!,
        currentSectionId: currentSection.id,
      });

      // Find next section index
      if (nextResult.nextSectionId) {
        const nextIndex = sections.findIndex((s) => s.id === nextResult.nextSectionId);
        if (nextIndex >= 0) {
          setCurrentSectionIndex(nextIndex);
        }
      } else {
        // Default: next in sequence
        setCurrentSectionIndex((prev) => Math.min(prev + 1, sections.length - 1));
      }
    } catch (error) {
      console.error('[WorkflowRunner] Submit/next error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to proceed";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  const handlePrev = () => {
    setCurrentSectionIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto p-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Step {currentSectionIndex + 1} of {visibleSections.length}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Section */}
        {isFinalDocumentsSection ? (
          <FinalDocumentsSection
            runId={actualRunId!}
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
                sectionId={currentSection.id}
                values={formValues}
                logicRules={logicRules || []}
                onChange={(stepId, value) =>
                  setFormValues((prev) => ({ ...prev, [stepId]: value }))
                }
              />

              {errors.length > 0 && (
                <div className="p-4 bg-destructive/10 border border-destructive rounded-md space-y-3">
                  {errors.map((error, i) => (
                    <div key={i} className="text-sm text-destructive">
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed overflow-x-auto">
                        {error}
                      </pre>
                    </div>
                  ))}
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
            disabled={currentSectionIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <Button
            onClick={handleNext}
            disabled={submitMutation.isPending || nextMutation.isPending || completeMutation.isPending}
          >
            {isLastSection ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Complete
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionSteps({
  sectionId,
  values,
  logicRules,
  onChange,
}: {
  sectionId: string;
  values: Record<string, any>;
  logicRules: LogicRule[];
  onChange: (stepId: string, value: any) => void;
}) {
  const { data: steps } = useSteps(sectionId);

  // Use visibility hook to evaluate which steps should be shown
  const { isStepVisible } = useWorkflowVisibility(logicRules, steps, values);

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
      {visibleSteps.map((step) => (
        <StepField key={step.id} step={step} value={values[step.id]} onChange={(v) => onChange(step.id, v)} />
      ))}
    </>
  );
}

function StepField({ step, value, onChange }: { step: any; value: any; onChange: (value: any) => void }) {
  const renderInput = () => {
    switch (step.type) {
      case "short_text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your answer..."
          />
        );

      case "long_text":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your answer..."
            rows={4}
          />
        );

      case "radio":
        return (
          <RadioGroup value={value || ""} onValueChange={onChange}>
            {step.options?.options?.map((option: string, i: number) => (
              <div key={i} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${step.id}-${i}`} />
                <Label htmlFor={`${step.id}-${i}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "multiple_choice":
        const currentValues = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {step.options?.options?.map((option: string, i: number) => (
              <div key={i} className="flex items-center space-x-2">
                <Checkbox
                  id={`${step.id}-${i}`}
                  checked={currentValues.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...currentValues, option]);
                    } else {
                      onChange(currentValues.filter((v: string) => v !== option));
                    }
                  }}
                />
                <Label htmlFor={`${step.id}-${i}`}>{option}</Label>
              </div>
            ))}
          </div>
        );

      case "yes_no":
        return (
          <RadioGroup value={value?.toString() || ""} onValueChange={(v) => onChange(v === "true")}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id={`${step.id}-yes`} />
              <Label htmlFor={`${step.id}-yes`}>Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id={`${step.id}-no`} />
              <Label htmlFor={`${step.id}-no`}>No</Label>
            </div>
          </RadioGroup>
        );

      case "date_time":
        const dateTimeType = step.options?.dateTimeType || "datetime";
        const inputType = dateTimeType === "date" ? "date" : dateTimeType === "time" ? "time" : "datetime-local";
        return (
          <Input
            type={inputType}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      default:
        return <Input value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        {step.title}
        {step.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {step.description && (
        <p className="text-sm text-muted-foreground">{step.description}</p>
      )}
      {renderInput()}
    </div>
  );
}
