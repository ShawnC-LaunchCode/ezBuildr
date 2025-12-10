/**
 * Workflow Runner - Participant view for completing workflows
 *
 * Supports two modes:
 * 1. Production mode: runId is a real database run
 * 2. Preview mode: previewEnvironment is an in-memory PreviewEnvironment instance
 */

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check, Loader2, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
// import { useRunWithValues, useSections, useSteps, useSubmitSection, useNext, useCompleteRun } from "@/lib/vault-hooks";
// Importing individually to avoid lint 'Module not found' if aliases differ, but they seem to use @/lib/vault-hooks
import { useRunWithValues, useSections, useSteps, useSubmitSection, useNext, useCompleteRun } from "@/lib/vault-hooks";
import { useWorkflowVisibility } from "@/hooks/useWorkflowVisibility";
import { BlockRenderer } from "@/components/runner/blocks";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";
import { FinalDocumentsSection } from "@/components/runner/sections/FinalDocumentsSection";
import type { LogicRule } from "@shared/schema";
import { validatePage } from "@shared/validation/PageValidator";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import type { ValidationSchema } from "@shared/validation/ValidationSchema";
import { analytics } from "@/lib/analytics";
import type { ApiStep } from "@/lib/vault-api";

interface WorkflowRunnerProps {
  // Production mode: provide runId
  runId?: string;
  // Preview mode: provide previewEnvironment
  previewEnvironment?: PreviewEnvironment;
  // Legacy prop (for backward compatibility)
  isPreview?: boolean;
  // Callback when preview is completed
  onPreviewComplete?: () => void;
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

// Helper to start a run from a workflow UUID
async function startRunFromWorkflowId(
  workflowId: string,
  initialValues?: Record<string, any>
): Promise<{ runId: string; runToken: string; workflowId: string }> {
  const response = await fetch(`/api/workflows/${workflowId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include session cookies for authenticated users
    body: JSON.stringify({ initialValues }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start workflow');
  }

  const result = await response.json();
  return result.data;
}

export function WorkflowRunner({ runId, previewEnvironment, isPreview = false, onPreviewComplete }: WorkflowRunnerProps) {
  const [actualRunId, setActualRunId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const { toast } = useToast();

  // New Preview Environment Hook
  const previewState = usePreviewEnvironment(previewEnvironment || null);

  // Determine mode
  const mode = previewEnvironment ? 'preview' : 'production';

  // On mount, check if runId is a UUID or a slug (production mode only)
  useEffect(() => {
    // In preview mode, set runId if provided (for document generation)
    if (previewEnvironment) {
      if (runId) {
        console.log('[WorkflowRunner] Preview mode with runId:', runId);
        setActualRunId(runId);
      }
      setIsInitializing(false);
      return;
    }

    // Production mode: handle run initialization
    async function initialize() {
      if (!runId) {
        setInitError('No run ID provided');
        setIsInitializing(false);
        return;
      }

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
          // It's a UUID - could be a workflow ID or run ID
          // First, try to fetch it as a run to see if we have access
          const runToken = localStorage.getItem(`run_token_${runId}`);

          // If we have a run token for this ID, treat it as a run
          if (runToken) {
            setActualRunId(runId);
            localStorage.setItem('active_run_token', runToken);
          } else {
            // No run token - try to create a new run from this UUID as a workflow ID
            try {
              const runData = await startRunFromWorkflowId(
                runId,
                Object.keys(initialValues).length > 0 ? initialValues : undefined
              );
              setActualRunId(runData.runId);

              // Store the run token in localStorage for bearer auth
              localStorage.setItem(`run_token_${runData.runId}`, runData.runToken);
              localStorage.setItem('active_run_token', runData.runToken);
            } catch (createError) {
              // If creating run fails, it might be an existing run ID we don't have access to
              // Try to fetch the run to get its workflow ID, then create a new run
              try {
                const response = await fetch(`/api/runs/${runId}`, {
                  credentials: 'include',
                });

                if (response.ok) {
                  const result = await response.json();
                  const workflowId = result.data?.workflowId;

                  if (workflowId) {
                    // Create a new run from the same workflow
                    const newRunData = await startRunFromWorkflowId(
                      workflowId,
                      Object.keys(initialValues).length > 0 ? initialValues : undefined
                    );
                    setActualRunId(newRunData.runId);
                    localStorage.setItem(`run_token_${newRunData.runId}`, newRunData.runToken);
                    localStorage.setItem('active_run_token', newRunData.runToken);

                    toast({
                      title: "New session started",
                      description: "Created a new run for this workflow",
                    });
                  } else {
                    throw new Error("Could not determine workflow ID");
                  }
                } else {
                  // Can't access the run at all - treat the UUID as a run ID anyway
                  // This will likely fail but will show a proper error
                  setActualRunId(runId);
                }
              } catch (fetchError) {
                // Final fallback - just use the ID as-is
                setActualRunId(runId);
              }
            }
          }
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
  }, [runId, toast, previewEnvironment]);

  // Fetch run data - PRODUCTION MODE ONLY
  // In preview mode, we use previewEnvironment data instead
  const { data: run } = useRunWithValues(actualRunId || '', {
    enabled: mode === 'production' && !!actualRunId && !isInitializing,
  });

  // Get workflow ID from run (production) or preview environment (preview)
  const workflowId = mode === 'preview'
    ? previewState?.workflowId
    : run?.workflowId;

  // Get sections - from preview environment or API
  const { data: fetchedSections } = useSections(workflowId, {
    enabled: mode !== 'preview', // Only fetch if NOT in preview mode
  });
  const sections = mode === 'preview'
    ? previewEnvironment?.getSections()
    : fetchedSections;

  // Fetch logic rules for visibility evaluation
  const { data: logicRules } = useQuery<LogicRule[]>({
    queryKey: ["workflow-logic-rules", workflowId],
    queryFn: async () => {
      const response = await fetch(`/api/workflows/${workflowId}/logic-rules`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch logic rules");
      return response.json();
    },
    enabled: !!workflowId,
  });

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Use preview values in preview mode, form values in production mode
  const effectiveValues = mode === 'preview'
    ? (previewState?.values || {})
    : formValues;

  const submitMutation = useSubmitSection();
  const nextMutation = useNext();
  const completeMutation = useCompleteRun();

  // Fetch all steps for alias resolution - MUST be before early returns
  // In preview mode, get steps from previewEnvironment; in production mode, fetch from API
  const { data: allSteps } = useQuery({
    queryKey: ["workflow-all-steps", workflowId, mode],
    queryFn: async () => {
      // Preview mode: get steps from preview environment
      if (mode === 'preview' && previewEnvironment) {
        return previewEnvironment.getSteps();
      }

      // Production mode: fetch from API
      if (!sections) return [];
      const allStepPromises = sections.map(section =>
        fetch(`/api/sections/${section.id}/steps`, {
          credentials: "include",
        }).then(res => res.json())
      );
      const allStepArrays = await Promise.all(allStepPromises);
      return allStepArrays.flat();
    },
    enabled: (mode === 'preview' ? !!previewEnvironment : !!workflowId) && !!sections,
  });

  // Memoize visible sections calculation with alias resolution - MUST be before early returns
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
        // Use effectiveValues (preview or production values)
        return evaluateConditionExpression(section.visibleIf as any, effectiveValues, aliasResolver);
      } catch (error) {
        console.error('[WorkflowRunner] Error evaluating section visibility', section.id, error);
        return true;
      }
    });
  }, [sections, effectiveValues, allSteps]);

  // Initialize form values from run.values (production mode only)
  useEffect(() => {
    if (mode === 'production' && run?.values) {
      const initial: Record<string, any> = {};
      run.values.forEach((v) => {
        initial[v.stepId] = v.value;
      });
      setFormValues(initial);
    }
  }, [run, mode]);

  // Analytics: Track Run Start (Production)
  useEffect(() => {
    if (mode === 'production' && run && run.id && run.workflowId && run.versionId) {
      analytics.runStart(run.id, run.workflowId, run.versionId);
    }
  }, [run, mode]);

  // Analytics: Track Page Views
  useEffect(() => {
    const currentSection = visibleSections[currentSectionIndex] || sections?.[currentSectionIndex];
    if (currentSection) {
      const rId = mode === 'preview' ? 'preview-session' : actualRunId;
      const wId = workflowId;
      const vId = mode === 'preview' ? 'draft' : run?.versionId;

      if (rId && wId && vId) {
        analytics.pageView(rId, wId, vId, currentSection.id, mode === 'preview');
      }
    }
  }, [currentSectionIndex, mode, actualRunId, workflowId, run?.versionId, sections?.[currentSectionIndex]?.id, visibleSections?.[currentSectionIndex]?.id]);

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
  // In preview mode, we only need sections (no run needed)
  // In production mode, we need both run and sections
  const isLoading = mode === 'preview' ? !sections : (!run || !sections);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  const currentSection = visibleSections[currentSectionIndex] || (sections ? sections[currentSectionIndex] : undefined);
  const progress = ((currentSectionIndex + 1) / visibleSections.length) * 100;
  const isLastSection = currentSectionIndex === visibleSections.length - 1;

  // Check if current section is a Final Documents section
  const isFinalDocumentsSection = (currentSection?.config as any)?.finalBlock === true;

  // Get run token from localStorage for Final Documents section
  const runToken = actualRunId ? localStorage.getItem(`run_token_${actualRunId}`) : null;

  const handleNext = async () => {
    setErrors([]);

    // Defensive check: ensure allSteps is loaded
    if (!allSteps || !Array.isArray(allSteps)) {
      console.error('[WorkflowRunner] allSteps not loaded yet', { allSteps });
      toast({
        title: "Error",
        description: "Workflow data is still loading. Please wait a moment and try again.",
        variant: "destructive"
      });
      return;
    }

    // Prepare validation schemas for the current section
    const currentSectionSteps = allSteps.filter(
      (step: any) => step.sectionId === currentSection.id &&
        !step.isVirtual &&
        step.type !== 'final_documents'
    );

    try {
      const stepSchemas: Record<string, ValidationSchema> = {};

      const visibleSectionSteps = currentSectionSteps.filter((step: any) => {
        if (!step.visibleIf) return true;
        try {
          const aliasResolver = (variableName: string): string | undefined => {
            const s = allSteps.find((as: any) => as.alias === variableName);
            return s?.id;
          };
          return evaluateConditionExpression(step.visibleIf, effectiveValues, aliasResolver);
        } catch (e) {
          console.error("Error evaluating visibility for validation", e);
          return true; // Fail safe to visible (validate it)
        }
      });

      visibleSectionSteps.forEach((step: any) => {
        stepSchemas[step.id] = getValidationSchema({
          id: step.id,
          type: step.type,
          config: step.config,
          required: step.required
        });
      });

      // Run validation
      const validationResult = await validatePage({
        schemas: stepSchemas,
        values: effectiveValues,
        allValues: effectiveValues
      });

      if (!validationResult.valid) {
        setFieldErrors(validationResult.blockErrors);
        const newErrors: string[] = [];
        Object.values(validationResult.blockErrors).forEach(errs => newErrors.push(...errs));
        setErrors(newErrors);
        toast({
          title: "Validation Error",
          description: "Please check the highlighted fields.",
          variant: "destructive"
        });

        const firstErrorId = Object.keys(validationResult.blockErrors)[0];
        if (firstErrorId) {
          const element = document.getElementById(firstErrorId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }
    } catch (e) {
      console.error("Validation error", e);
      toast({ title: "System Error", description: "Validation failed to execute", variant: "destructive" });
      return;
    }

    if (mode === 'preview') {
      // Handle Preview Environment
      if (previewEnvironment) {
        if (isLastSection) {
          previewEnvironment.completeRun();
          toast({ title: "Preview Complete!", description: "Preview workflow completed successfully" });
          if (onPreviewComplete) onPreviewComplete();
          return;
        }

        const nextIndex = Math.min(currentSectionIndex + 1, visibleSections.length - 1);
        const nextSection = visibleSections[nextIndex];

        // CRITICAL FIX: If navigating to a Final Documents section, save all preview values to database first
        // This ensures document generation has access to the actual form values
        if (actualRunId && nextSection && (nextSection.config as any)?.finalBlock === true) {
          try {
            console.log('[WorkflowRunner] Navigating to Final Documents section - saving preview values to database');

            // Get all values from preview environment
            const allValues = previewEnvironment.getValues();

            // Convert to array format expected by bulk API
            const valuesToSave = Object.entries(allValues).map(([stepId, value]) => ({
              stepId,
              value
            }));

            console.log('[WorkflowRunner] Saving preview values:', {
              runId: actualRunId,
              valueCount: valuesToSave.length,
              values: valuesToSave
            });

            // Get run token for authentication
            const runToken = localStorage.getItem(`run_token_${actualRunId}`);

            // Save to database using bulk endpoint
            const response = await fetch(`/api/runs/${actualRunId}/values/bulk`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
              },
              credentials: 'include',
              body: JSON.stringify({ values: valuesToSave })
            });

            if (!response.ok) {
              throw new Error('Failed to save preview values to database');
            }

            console.log('[WorkflowRunner] Preview values saved successfully to database');
          } catch (error) {
            console.error('[WorkflowRunner] Failed to save preview values:', error);
            toast({
              title: "Warning",
              description: "Failed to save form values. Documents may use default values.",
              variant: "destructive"
            });
          }
        }

        setCurrentSectionIndex(nextIndex);
        previewEnvironment.setCurrentSection(nextIndex);
        return;
      }
    }

    // Analytics: Track Completion (Production)
    if (isLastSection) {
      const vId = run?.versionId;
      if (actualRunId && workflowId && vId) {
        analytics.runComplete(actualRunId, workflowId, vId);
      }
    }

    // PRODUCTION MODE: Submit to database and navigate
    const currentSectionStepIds = new Set(currentSectionSteps.map(s => s.id));

    // Collect values ONLY for steps in the current section
    const sectionValues = Object.keys(formValues)
      .filter((stepId) => currentSectionStepIds.has(stepId))
      .map((stepId) => ({ stepId, value: formValues[stepId] }));

    console.log('[WorkflowRunner] Submitting section:', {
      runId: actualRunId,
      sectionId: currentSection.id,
      values: sectionValues,
      valuesCount: sectionValues.length,
      valuesIsArray: Array.isArray(sectionValues),
      allStepsCount: allSteps.length
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

      console.log('[WorkflowRunner] Next result:', {
        nextSectionId: nextResult.nextSectionId,
        currentSectionIndex,
        visibleSectionsCount: visibleSections.length,
        visibleSectionIds: visibleSections.map(s => s.id),
        allSectionsCount: sections?.length || 0,
      });

      // Find next section index in visibleSections (not all sections)
      if (nextResult.nextSectionId) {
        const nextIndex = visibleSections.findIndex((s) => s.id === nextResult.nextSectionId);
        console.log('[WorkflowRunner] Found next section at index:', nextIndex);
        if (nextIndex >= 0) {
          setCurrentSectionIndex(nextIndex);
          console.log('[WorkflowRunner] Set currentSectionIndex to:', nextIndex);
        } else {
          console.warn('[WorkflowRunner] Next section not found in visibleSections!', nextResult.nextSectionId);
        }
      } else {
        // Default: next in sequence
        const newIndex = Math.min(currentSectionIndex + 1, visibleSections.length - 1);
        console.log('[WorkflowRunner] No nextSectionId, advancing to:', newIndex);
        setCurrentSectionIndex(newIndex);
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
          actualRunId ? (
            // Have valid runId - show document generation (works in both preview and production)
            <FinalDocumentsSection
              runId={actualRunId}
              runToken={runToken || undefined}
              sectionConfig={(currentSection.config as any) || {
                screenTitle: "Your Completed Documents",
                markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
                templates: []
              }}
            />
          ) : (
            // RunId not ready yet - show loading
            <Card>
              <CardHeader>
                <CardTitle>Initializing Document Generation...</CardTitle>
                <CardDescription>Please wait while we prepare your documents</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          )
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
                steps={allSteps?.filter((s: ApiStep) => s.sectionId === currentSection.id)}
                values={effectiveValues}
                logicRules={logicRules || []}
                errors={fieldErrors}
                onChange={(stepId, value) => {
                  if (mode === 'preview') {
                    if (previewEnvironment) {
                      previewEnvironment.setValue(stepId, value);
                    }
                  } else {
                    setFormValues((prev) => ({ ...prev, [stepId]: value }));
                  }
                  // Clear error for this field on change
                  if (fieldErrors[stepId]) {
                    const newFieldErrors = { ...fieldErrors };
                    delete newFieldErrors[stepId];
                    setFieldErrors(newFieldErrors);
                  }
                }}
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
  steps: providedSteps,
  values,
  logicRules,
  onChange,
  errors
}: {
  sectionId: string;
  steps?: ApiStep[];
  values: Record<string, any>;
  logicRules: LogicRule[];
  onChange: (stepId: string, value: any) => void;
  errors?: Record<string, string[]>;
}) {
  const { data: rawSteps } = useSteps(sectionId, {
    enabled: !providedSteps
  });

  const sourceSteps = providedSteps || rawSteps;

  const steps = useMemo(() => {
    if (!sourceSteps) return [];
    return sourceSteps.map(step => ({
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
  }, [rawSteps]);

  // Use visibility hook to evaluate which steps should be shown
  const { isStepVisible } = useWorkflowVisibility(logicRules, steps as any, values);

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
        <StepField
          key={step.id}
          step={step}
          value={values[step.id]}
          error={errors?.[step.id]?.[0]} // Pass first error message
          onChange={(v) => onChange(step.id, v)}
        />
      ))}
    </>
  );
}

/**
 * StepField - Thin wrapper around BlockRenderer
 *
 * Now uses the new comprehensive BlockRenderer system that supports
 * all block types with proper validation and nested data handling.
 */
function StepField({ step, value, onChange, error }: { step: any; value: any; onChange: (value: any) => void; error?: string }) {
  return (
    <BlockRenderer
      step={step}
      value={value}
      onChange={onChange}
      required={step.required}
      readOnly={false}
      error={error}
      showValidation={!!error}
    />
  );
}
