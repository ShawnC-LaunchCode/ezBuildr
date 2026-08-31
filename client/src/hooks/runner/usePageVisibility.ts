import { useMemo, useCallback } from "react";
import type { ApiStep, ApiPage, ApiSection } from "@/lib/vault-api";
import type { StepValue } from "@/pages/workflow-runner/runner.utils";
import type { LogicRule } from "@shared/schema";
import { evaluateWorkflowVisibility } from "@shared/workflowLogic";
import { adaptLegacyStep } from "@shared/types/stepConfigs";

interface VisibilityTraceRecorder {
  addTraceEntry: (entry: {
    type: 'logic';
    status: 'skipped';
    message: string;
    details: { reason: string };
  }) => unknown;
}

interface UsePageVisibilityReturn {
  visiblePages: ApiPage[];
  getVisiblePageSteps: (pageId: string, traceRecorder?: VisibilityTraceRecorder) => ApiStep[];
  resolveAlias: (variableName: string) => string | undefined;
}

/**
 * Shared runner visibility engine for production and preview.
 *
 * Preview evaluates the same persisted workflow logic rules as production so a
 * previewed run keeps the published show/hide behavior. The preview environment
 * still supplies in-memory pages and steps; unsaved logic-rule edits are not
 * represented until the builder exposes an in-memory rules feed.
 */
export function usePageVisibility(
  pages: ApiPage[] | undefined,
  allSteps: ApiStep[] | undefined,
  effectiveValues: Record<string, StepValue>,
  logicRules: LogicRule[] = [],
  sections: ApiSection[] = []
): UsePageVisibilityReturn {
  // Alias resolver memoized to avoid recreation
  const resolveAlias = useCallback((variableName: string): string | undefined => {
    if (!allSteps) {
      return undefined;
    }
    const step = allSteps.find((s) => s.alias === variableName);
    return step?.id;
  }, [allSteps]);

  const visibility = useMemo(() => evaluateWorkflowVisibility({
    sections,
    // PageSteps also uses this hook as a step-only visibility adapter. In
    // that mode preserve the supplied steps' parent pages as visible roots.
    pages: pages ?? Array.from(new Set((allSteps ?? []).map((step) => step.pageId)))
      .map((id) => ({ id })),
    steps: allSteps ?? [],
    rules: logicRules,
    data: effectiveValues,
    resolveAlias,
  }), [sections, pages, allSteps, logicRules, effectiveValues, resolveAlias]);

  // Compute visible pages
  const visiblePages = useMemo(() => {
    if (!pages) {
      return [];
    }

    return pages.filter((page) => visibility.visiblePages.has(page.id));
  }, [pages, visibility.visiblePages]);

  // Compute visible steps for a specific page
  const getVisiblePageSteps = useCallback((pageId: string, traceRecorder?: VisibilityTraceRecorder) => {
    if (!allSteps) {
      return [];
    }
    
    const pageSteps = allSteps.filter(
      (step) => step.pageId === pageId && !step.isVirtual && adaptLegacyStep({ type: step.type }).type !== 'final_documents'
    );

    return pageSteps.filter((step) => {
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
    visiblePages,
    getVisiblePageSteps,
    resolveAlias
  };
}
