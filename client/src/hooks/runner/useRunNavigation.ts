import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { ApiSection, ApiStep } from "@/lib/vault-api";
import { useSubmitSection, useNext, useCompleteRun } from "@/lib/vault-hooks";
import { getValidationSchema } from "@shared/validation/BlockValidation";
import { validatePage } from "@shared/validation/PageValidator";
import type { ValidateRule } from "@shared/types/blocks";
import type { ValidationSchema } from "@shared/validation/ValidationSchema";
import { getRunToken, clearRunToken } from "@/lib/runTokens";
import { usePreviewStore } from "@/store/preview";
import { analytics } from "@/lib/analytics";

interface UseRunNavigationProps {
  mode: 'preview' | 'production';
  actualRunId: string | null;
  workflowId?: string;
  runVersionId?: string;
  visibleSections: ApiSection[];
  effectiveValues: Record<string, any>;
  previewEnvironment: any;
  getVisibleSectionSteps: (sectionId: string, previewEnvironment?: any) => ApiStep[];
  onPreviewComplete?: () => void;
  saveNow: () => Promise<void>;
}

export function useRunNavigation({
  mode,
  actualRunId,
  workflowId,
  runVersionId,
  visibleSections,
  effectiveValues,
  previewEnvironment,
  getVisibleSectionSteps,
  onPreviewComplete,
  saveNow,
}: UseRunNavigationProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  
  const { toast } = useToast();
  const submitMutation = useSubmitSection();
  const nextMutation = useNext();
  const completeMutation = useCompleteRun();

  const currentSection = visibleSections[currentSectionIndex];
  const isLastSection = currentSectionIndex === visibleSections.length - 1;

  const handlePrev = useCallback(() => {
    if (showReview) {
      setShowReview(false);
      return;
    }
    setCurrentSectionIndex((prev) => Math.max(prev - 1, 0));
  }, [showReview]);

  const handleFinalSubmit = useCallback(async () => {
    if (!actualRunId) return;
    try {
      await completeMutation.mutateAsync(actualRunId);
      if (workflowId && runVersionId) {
        void analytics.runComplete(actualRunId, workflowId, runVersionId);
      }
      toast({ title: "Success", description: "Workflow submitted successfully" });
      
      clearRunToken(actualRunId);
      usePreviewStore.getState().clearToken(actualRunId);
    } catch (error) {
      toast({ title: "Error", description: "Failed to submit workflow", variant: "destructive" });
    }
  }, [actualRunId, workflowId, runVersionId, completeMutation, toast]);

  const handleNext = useCallback(async () => {
    setErrors([]);
    
    if (!currentSection) return;

    const visibleSectionSteps = getVisibleSectionSteps(currentSection.id, mode === 'preview' ? previewEnvironment : undefined);

    try {
      const stepSchemas: Record<string, ValidationSchema> = {};
      visibleSectionSteps.forEach((step: ApiStep) => {
        stepSchemas[step.id] = getValidationSchema({
          id: step.id,
          type: step.type,
          config: step.config,
          required: step.required
        });
      });

      const validationResult = await validatePage({
        schemas: stepSchemas,
        values: effectiveValues,
        allValues: effectiveValues,
        pageRules: (currentSection.config as { validationRules?: ValidateRule[] })?.validationRules ?? []
      });

      if (!validationResult.valid) {
        setFieldErrors(validationResult.blockErrors);
        const newErrors: string[] = [];
        Object.values(validationResult.blockErrors).forEach(errs => newErrors.push(...errs));
        setErrors(newErrors);
        
        toast({
          title: "Please complete all required fields",
          description: "Some information is still needed before continuing.",
          variant: "destructive"
        });

        const firstErrorId = Object.keys(validationResult.blockErrors)[0];
        if (firstErrorId) {
          setTimeout(() => {
            const element = document.getElementById(firstErrorId);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        }
        return;
      }
    } catch (e) {
      console.error("Validation error", e);
      if (mode === 'preview' && previewEnvironment) {
        void previewEnvironment.addTraceEntry({
          type: 'error',
          status: 'failed',
          message: 'Validation Exception',
          details: { error: e }
        });
      }
      toast({ title: "Unable to continue", description: "Something went wrong. Please try again.", variant: "destructive" });
      return;
    }

    if (mode === 'preview' && previewEnvironment) {
      void previewEnvironment.addTraceEntry({
        type: 'logic',
        status: 'executed',
        message: 'Page Validation Passed',
        details: { stepsValidated: visibleSectionSteps?.length }
      });
      
      if (isLastSection) {
        previewEnvironment.completeRun();
        void previewEnvironment.addTraceEntry({
          type: 'step',
          status: 'executed',
          message: 'Workflow Completed',
        });
        toast({ title: "Preview Complete!", description: "Preview workflow completed successfully" });
        if (onPreviewComplete) onPreviewComplete();
        return;
      }
      
      const nextIndex = Math.min(currentSectionIndex + 1, visibleSections.length - 1);
      const nextSection = visibleSections[nextIndex];
      
      if (actualRunId && nextSection && (nextSection.config as any)?.finalBlock) {
        try {
          const allValues = previewEnvironment.getValues();
          const valuesToSave = Object.entries(allValues).map(([stepId, value]) => ({ stepId, value }));
          const runToken = getRunToken(actualRunId);
          const response = await fetch(`/api/runs/${actualRunId}/values/bulk`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
            },
            credentials: 'include',
            body: JSON.stringify({ values: valuesToSave })
          });
          if (!response.ok) throw new Error('Failed to save preview values');
        } catch (error) {
          console.error('[WorkflowRunner] Failed to save preview values:', error);
          toast({ title: "Warning", description: "Failed to save form values.", variant: "destructive" });
        }
      }
      
      setCurrentSectionIndex(nextIndex);
      previewEnvironment.setCurrentSection(nextIndex);
      return;
    }

    // Flush any pending autosaves immediately so the submitSection doesn't race
    await saveNow();

    const currentSectionStepIds = new Set(visibleSectionSteps.map(s => s.id));
    const sectionValues = Object.keys(effectiveValues)
      .filter((stepId) => currentSectionStepIds.has(stepId))
      .map((stepId) => ({ stepId, value: effectiveValues[stepId] }));

    try {
      const result = await submitMutation.mutateAsync({
        runId: actualRunId!,
        sectionId: currentSection.id,
        values: sectionValues,
      });

      if (!result.success && result.errors) {
        setErrors(result.errors);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          const firstErrorId = Object.keys(result.fieldErrors)[0];
          if (firstErrorId) {
            setTimeout(() => {
              const element = document.getElementById(firstErrorId);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          }
        }
        toast({ title: "Please complete all required fields", description: result.errors[0], variant: "destructive" });
        return;
      }

      if (isLastSection) {
        setShowReview(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const nextResult = await nextMutation.mutateAsync({
        runId: actualRunId!,
        currentSectionId: currentSection.id,
      });

      if (nextResult.nextSectionId != null) {
        const nextIndex = visibleSections.findIndex((s) => s.id === nextResult.nextSectionId);
        if (nextIndex >= 0) {
          setCurrentSectionIndex(nextIndex);
        } else {
          console.warn('[WorkflowRunner] Server nextSectionId not locally visible, advancing sequentially', nextResult.nextSectionId);
          if (currentSectionIndex + 1 < visibleSections.length) {
            setCurrentSectionIndex(currentSectionIndex + 1);
          } else {
            setShowReview(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      } else {
        const newIndex = Math.min(currentSectionIndex + 1, visibleSections.length - 1);
        setCurrentSectionIndex(newIndex);
      }
    } catch (error) {
      console.error('[WorkflowRunner] Submit/next error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to proceed";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  }, [
    currentSection, getVisibleSectionSteps, mode, previewEnvironment, effectiveValues, 
    isLastSection, onPreviewComplete, actualRunId, visibleSections, currentSectionIndex, 
    submitMutation, nextMutation, saveNow, toast
  ]);

  return {
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
    completeMutationIsPending: completeMutation.isPending
  };
}
