import { useMemo, useCallback } from "react";
import type { ApiStep, ApiSection } from "@/lib/vault-api";
import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import type { ConditionExpression } from "@shared/types/conditions";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";

export function useSectionVisibility(
  sections: ApiSection[] | undefined,
  allSteps: ApiStep[] | undefined,
  effectiveValues: Record<string, StepValue>
) {
  // Alias resolver memoized to avoid recreation
  const resolveAlias = useCallback((variableName: string): string | undefined => {
    if (!allSteps) return undefined;
    const step = allSteps.find((s) => s.alias === variableName);
    return step?.id;
  }, [allSteps]);

  // Compute visible sections
  const visibleSections = useMemo(() => {
    if (!sections) return [];

    return sections.filter((section) => {
      if (!section.visibleIf) return true;
      try {
        return evaluateConditionExpression(
          section.visibleIf as ConditionExpression,
          effectiveValues,
          resolveAlias
        );
      } catch (error) {
        console.error('[useSectionVisibility] Error evaluating section visibility', section.id, error);
        return true; // fail open
      }
    });
  }, [sections, effectiveValues, resolveAlias]);

  // Compute visible steps for a specific section
  const getVisibleSectionSteps = useCallback((sectionId: string, previewEnvironment?: any) => {
    if (!allSteps) return [];
    
    const sectionSteps = allSteps.filter(
      (step) => step.sectionId === sectionId && !step.isVirtual && step.type !== 'final_documents'
    );

    return sectionSteps.filter((step) => {
      if (!step.visibleIf) return true;
      try {
        const isVisible = evaluateConditionExpression(
          step.visibleIf as ConditionExpression,
          effectiveValues,
          resolveAlias
        );
        
        if (!isVisible && previewEnvironment) {
          void previewEnvironment.addTraceEntry({
            type: 'logic',
            status: 'skipped',
            message: `Skipped Step: ${step.title || step.id}`,
            details: { reason: 'Condition evaluated to false', condition: step.visibleIf }
          });
        }
        
        return isVisible;
      } catch (e) {
        console.error("[useSectionVisibility] Error evaluating step visibility", e);
        return true; // Fail safe to visible
      }
    });
  }, [allSteps, effectiveValues, resolveAlias]);

  return {
    visibleSections,
    getVisibleSectionSteps,
    resolveAlias
  };
}
