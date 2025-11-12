/**
 * Preview Runner - Full-page preview mode with bearer token auth
 * Launched from builder, uses runToken instead of session auth
 */

import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePreviewStore } from "@/store/preview";
import { apiWithToken } from "@/lib/vault-api";
import type { ApiRun, ApiStepValue, ApiSection, ApiStep } from "@/lib/vault-api";

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

  // Fetch sections
  const { data: sections, isLoading: loadingSections } = useQuery({
    queryKey: ["preview-sections", run?.workflowId],
    queryFn: () =>
      api.get<ApiSection[]>(
        `/api/workflows/${run?.workflowId}/sections`
      ),
    enabled: !!run?.workflowId,
  });

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

  // Submit section mutation
  const submitMutation = useMutation({
    mutationFn: (data: { sectionId: string; values: Array<{ stepId: string; value: any }> }) =>
      api.post<{ success: boolean; errors?: string[] }>(
        `/api/runs/${runId}/sections/${data.sectionId}/submit`,
        { values: data.values }
      ),
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

    // Collect values for current section
    const sectionValues = Object.keys(formValues).map((stepId) => ({
      stepId,
      value: formValues[stepId],
    }));

    try {
      // Submit section with validation
      const result = await submitMutation.mutateAsync({
        sectionId: currentSection.id,
        values: sectionValues,
      });

      if (!result.success && result.errors) {
        setErrors(result.errors);
        toast({
          title: "Validation Error",
          description: result.errors[0],
          variant: "destructive",
        });
        return;
      }

      // If last section, complete the run
      const isLastSection = currentSectionIndex === sections.length - 1;
      if (isLastSection) {
        await completeMutation.mutateAsync();
        toast({ title: "Complete!", description: "Preview completed successfully" });
        return;
      }

      // Otherwise, navigate to next section
      const nextResult = await nextMutation.mutateAsync(currentSection.id);

      if (nextResult.data.nextSectionId) {
        const nextIndex = sections.findIndex((s) => s.id === nextResult.data.nextSectionId);
        if (nextIndex >= 0) {
          setCurrentSectionIndex(nextIndex);
        }
      } else {
        // Default: next in sequence
        setCurrentSectionIndex((prev) => Math.min(prev + 1, sections.length - 1));
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to proceed",
        variant: "destructive",
      });
    }
  };

  const handlePrev = () => {
    setCurrentSectionIndex((prev) => Math.max(prev - 1, 0));
  };

  if (loadingRun || loadingSections) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading preview...</span>
        </div>
      </div>
    );
  }

  if (!run || !sections) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load preview</p>
      </div>
    );
  }

  const currentSection = sections[currentSectionIndex];
  const progress = ((currentSectionIndex + 1) / sections.length) * 100;
  const isLastSection = currentSectionIndex === sections.length - 1;

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
        <Button variant="outline" onClick={navigateToBuilder}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Builder
        </Button>
      </div>

      {/* Runner Content */}
      <div className="flex-1 container max-w-3xl mx-auto p-8">
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

        {/* Section Card */}
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

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={handlePrev} disabled={currentSectionIndex === 0}>
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
    </div>
  );
}

interface SectionStepsProps {
  runId: string;
  runToken: string;
  sectionId: string;
  values: Record<string, any>;
  onChange: (stepId: string, value: any) => void;
}

function SectionSteps({ runId, runToken, sectionId, values, onChange }: SectionStepsProps) {
  const api = apiWithToken(runToken);

  const { data: steps, isLoading } = useQuery({
    queryKey: ["preview-steps", sectionId],
    queryFn: () =>
      api.get<ApiStep[]>(`/api/sections/${sectionId}/steps`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return <p className="text-muted-foreground text-sm">No steps in this section</p>;
  }

  return (
    <>
      {steps.map((step) => {
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

interface StepFieldProps {
  step: ApiStep;
  value: any;
  onChange: (value: any) => void;
}

function StepField({ step, value, onChange }: StepFieldProps) {
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
          <RadioGroup
            value={value?.toString() || ""}
            onValueChange={(v) => onChange(v === "true")}
          >
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
        const inputType =
          dateTimeType === "date" ? "date" : dateTimeType === "time" ? "time" : "datetime-local";
        return <Input type={inputType} value={value || ""} onChange={(e) => onChange(e.target.value)} />;

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
      {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
      {renderInput()}
    </div>
  );
}
