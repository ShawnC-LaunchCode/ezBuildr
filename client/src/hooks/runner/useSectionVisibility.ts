import { useMemo, useCallback } from "react";
import type { ApiStep, ApiSection } from "@/lib/vault-api";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";
import type { LogicRule } from "@shared/schema";
import { evaluateWorkflowVisibility } from "@shared/workflowLogic";

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

  const visibility = useMemo(() => evaluateWorkflowVisibility({
    // SectionSteps also uses this hook as a step-only visibility adapter. In
    // that mode preserve the supplied steps' parent sections as visible roots.
    sections: sections ?? Array.from(new Set((allSteps ?? []).map((step) => step.sectionId)))
      .map((id) => ({ id })),
    steps: allSteps ?? [],
    rules: logicRules,
    data: effectiveValues,
    resolveAlias,
  }), [sections, allSteps, logicRules, effectiveValues, resolveAlias]);

  // Compute visible sections
  const visibleSections = useMemo(() => {
    if (!sections) {
      return [];
    }

    return sections.filter((section) => visibility.visibleSections.has(section.id));
  }, [sections, visibility.visibleSections]);

  // Compute visible steps for a specific section
  const getVisibleSectionSteps = useCallback((sectionId: string, traceRecorder?: VisibilityTraceRecorder) => {
    if (!allSteps) {
      return [];
    }
    
    const sectionSteps = allSteps.filter(
      (step) => step.sectionId === sectionId && !step.isVirtual && step.type !== 'final_documents'
    );

    return sectionSteps.filter((step) => {
      const isVisible = visibility.visibleSteps.has(step.id);
        
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
  }, [allSteps, visibility.visibleSteps]);

  return {
    visibleSections,
    getVisibleSectionSteps,
    resolveAlias
  };
}
