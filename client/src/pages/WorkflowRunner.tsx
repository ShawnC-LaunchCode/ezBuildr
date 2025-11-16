/**
 * Workflow Runner - Participant view for completing workflows
 */

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { useRunWithValues, useSections, useSteps, useSubmitSection, useNext, useCompleteRun } from "@/lib/vault-hooks";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

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
async function startRunFromSlug(slug: string): Promise<{ runId: string; runToken: string; workflowId: string }> {
  const response = await fetch(`/api/workflows/public/${slug}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
        if (isUUID(runId)) {
          // It's already a run ID - use it directly
          setActualRunId(runId);
        } else {
          // It's a slug - need to start a new run
          const runData = await startRunFromSlug(runId);
          setActualRunId(runData.runId);

          // Store the run token in localStorage for bearer auth
          localStorage.setItem(`run_token_${runData.runId}`, runData.runToken);
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

  const currentSection = sections[currentSectionIndex];
  const progress = ((currentSectionIndex + 1) / sections.length) * 100;
  const isLastSection = currentSectionIndex === sections.length - 1;

  const handleNext = async () => {
    setErrors([]);

    // Collect values for current section
    const sectionValues = Object.keys(formValues)
      .filter((key) => {
        // This is simplified - would need to check if step belongs to section
        return true;
      })
      .map((stepId) => ({ stepId, value: formValues[stepId] }));

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
      toast({ title: "Error", description: "Failed to proceed", variant: "destructive" });
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
              Step {currentSectionIndex + 1} of {sections.length}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Section */}
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
  onChange,
}: {
  sectionId: string;
  values: Record<string, any>;
  onChange: (stepId: string, value: any) => void;
}) {
  const { data: steps } = useSteps(sectionId);

  if (!steps || steps.length === 0) {
    return <p className="text-muted-foreground text-sm">No steps in this section</p>;
  }

  return (
    <>
      {steps.map((step) => (
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
