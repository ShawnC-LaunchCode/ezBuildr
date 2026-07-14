import { useMemo, useCallback } from "react";
import type { ApiStep, ApiSection } from "@/lib/vault-api";
import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import type { ConditionExpression } from "@shared/types/conditions";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";
import type { LogicRule } from "@shared/schema";
import { evaluateRules } from "@shared/workflowLogic";

interface VisibilityTraceRecorder {
  addTraceEntry: (entry: {
    type: 'logic';
    status: 'skipped';
    message: string;
    details: { reason: string };
  }) => unknown;
}

interface UseSectionVisibilityReturn {
  visibleSections: ApiSection[];
  getVisibleSectionSteps: (sectionId: string, traceRecorder?: VisibilityTraceRecorder) => ApiStep[];
  resolveAlias: (variableName: string) => string | undefined;
}

/**
 * Shared runner visibility engine for production and preview.
 *
 * Preview evaluates the same persisted workflow logic rules as production so a
 * previewed run keeps the published show/hide behavior. The preview environment
 * still supplies in-memory sections and steps; unsaved logic-rule edits are not
 * represented until the builder exposes an in-memory rules feed.
 */
export function useSectionVisibility(
  sections: ApiSection[] | undefined,
  allSteps: ApiStep[] | undefined,
  effectiveValues: Record<string, StepValue>,
  logicRules: LogicRule[] = []
): UseSectionVisibilityReturn {
  // Alias resolver memoized to avoid recreation
  const resolveAlias = useCallback((variableName: string): string | undefined => {
    if (!allSteps) {
      return undefined;
    }
    const step = allSteps.find((s) => s.alias === variableName);
    return step?.id;
  }, [allSteps]);

  const ruleEvaluation = useMemo(() => {
    return evaluateRules(logicRules, effectiveValues);
  }, [logicRules, effectiveValues]);

  const sectionsWithShowRules = useMemo(() => new Set(logicRules.filter(r => r.targetType === 'section' && r.action === 'show').map(r => r.targetSectionId).filter(Boolean) as string[]), [logicRules]);
  
  const stepsWithShowRules = useMemo(() => new Set(logicRules.filter(r => r.targetType === 'step' && r.action === 'show').map(r => r.targetStepId).filter(Boolean) as string[]), [logicRules]);

  // Compute visible sections
  const visibleSections = useMemo(() => {
    if (!sections) {
      return [];
    }

    return sections.filter((section) => {
      // 1. Step-level visibility (visibleIf)
      let sectionLevelVisible = true;
      if (section.visibleIf) {
        try {
          sectionLevelVisible = evaluateConditionExpression(
            section.visibleIf as ConditionExpression,
            effectiveValues,
            resolveAlias
          );
        } catch (error) {
          console.error('[useSectionVisibility] Error evaluating section visibility', section.id, error);
          sectionLevelVisible = false;
        }
      }

      // 2. Workflow-level logic rules
      const hasShowRules = sectionsWithShowRules.has(section.id);
      const explicitlyShown = ruleEvaluation.visibleSections.has(section.id);
      const explicitlyHidden = ruleEvaluation.hiddenSections.has(section.id);

      let workflowLevelVisible = true;
      if (hasShowRules) {
        workflowLevelVisible = explicitlyShown;
      } else if (explicitlyHidden) {
        workflowLevelVisible = false;
      }

      return sectionLevelVisible && workflowLevelVisible;
    });
  }, [sections, effectiveValues, resolveAlias, sectionsWithShowRules, ruleEvaluation.visibleSections, ruleEvaluation.hiddenSections]);

  // Compute visible steps for a specific section
  const getVisibleSectionSteps = useCallback((sectionId: string, traceRecorder?: VisibilityTraceRecorder) => {
    if (!allSteps) {
      return [];
    }
    
    const sectionSteps = allSteps.filter(
      (step) => step.sectionId === sectionId && !step.isVirtual && step.type !== 'final_documents'
    );

    return sectionSteps.filter((step) => {
      // 1. Step-level visibility (visibleIf)
      let stepLevelVisible = true;
      if (step.visibleIf) {
        try {
          stepLevelVisible = evaluateConditionExpression(
            step.visibleIf as ConditionExpression,
            effectiveValues,
            resolveAlias
          );
        } catch (e) {
          console.error("[useSectionVisibility] Error evaluating step visibility", e);
          stepLevelVisible = false;
        }
      }

      // 2. Workflow-level logic rules
      const hasShowRules = stepsWithShowRules.has(step.id);
      const explicitlyShown = ruleEvaluation.visibleSteps.has(step.id);
      const explicitlyHidden = ruleEvaluation.hiddenSteps.has(step.id);

      let workflowLevelVisible = true;
      if (hasShowRules) {
        workflowLevelVisible = explicitlyShown;
      } else if (explicitlyHidden) {
        workflowLevelVisible = false;
      }

      const isVisible = stepLevelVisible && workflowLevelVisible;
        
      if (!isVisible && traceRecorder) {
        void traceRecorder.addTraceEntry({
          type: 'logic',
          status: 'skipped',
          message: `Skipped Step: ${step.title || step.id}`,
          details: { reason: 'Condition evaluated to false' }
        });
      }
      
      return isVisible;
    });
  }, [allSteps, effectiveValues, resolveAlias, stepsWithShowRules, ruleEvaluation.visibleSteps, ruleEvaluation.hiddenSteps]);

  return {
    visibleSections,
    getVisibleSectionSteps,
    resolveAlias
  };
}
