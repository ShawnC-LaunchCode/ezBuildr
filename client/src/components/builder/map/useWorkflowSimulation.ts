/**
 * Drives the workflow map's simulation panel (MAP-8, GH-153 AC3): which steps
 * to show an answer field for, the hypothetical answers entered so far, and
 * the resulting simulated path.
 *
 * Calls the same four TanStack Query hooks `useWorkflowMapGraph.ts` does
 * (`useSections`/`usePages`/`useWorkflowSteps`/`useLogicRules`) rather than threading
 * their data through as props — they share query keys, so this is a cache
 * hit, not a second network request, and it keeps this hook independently
 * testable the way `useWorkflowMapGraph` is. Per CLAUDE.md convention 8, the
 * answers themselves are ephemeral "what if" input, never written to the
 * zustand builder store or persisted anywhere — they live in this hook's own
 * `useState` and reset when the tab unmounts.
 *
 * **`when: undefined` on a rule means "always fires"** — `conditionEvaluator`
 * treats a missing/null condition exactly like an unconditional one (see
 * `evaluateConditionExpression`'s `if (!expression) return true`). Some of
 * this map's own shared test fixtures (`tests/fixtures/workflowMap.ts`) omit
 * `when` entirely, since `buildWorkflowMap` never reads it — so a workflow
 * built from one of those correctly (not accidentally) simulates that rule as
 * always-on from the very first render, no answer required.
 */
import { useCallback, useMemo, useState } from "react";

import { useLogicRules } from "@/hooks/api/useLogicRules";
import { usePages } from "@/hooks/api/usePages";
import { useSections } from "@/hooks/api/useSections";
import { useWorkflowSteps } from "@/hooks/api/useSteps";
import type { ApiStep } from "@/lib/vault-api";

import { simulateWorkflowPath, type SimulatedPath } from "@shared/workflowSimulation";

import { buildSimulationFields, buildStepAliasResolver, getReferencedSteps, type SimulationField } from "./simulationInputs";

export interface UseWorkflowSimulationResult {
  /** Steps some `visibleIf`/rule `when` actually references, in workflow order (AC1). */
  fields: SimulationField[];
  /** Hypothetical answers entered so far, keyed by step id (AC2). */
  answers: Record<string, unknown>;
  setAnswer: (stepId: string, value: unknown) => void;
  resetAnswers: () => void;
  /** Undefined until Sections/pages/steps/rules have all loaded at least once. */
  simulation: SimulatedPath | undefined;
  isLoading: boolean;
}

export function useWorkflowSimulation(workflowId: string | undefined): UseWorkflowSimulationResult {
  const pagesQuery = usePages(workflowId);
  const sectionsQuery = useSections(workflowId);
  const stepsQuery = useWorkflowSteps(workflowId);
  const rulesQuery = useLogicRules(workflowId);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const pages = pagesQuery.data;
  const sections = sectionsQuery.data;
  const steps = stepsQuery.data;
  const rules = rulesQuery.data;

  const pageTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of pages ?? []) {
      map.set(page.id, page.title);
    }
    return map;
  }, [pages]);

  const referencedSteps = useMemo<ApiStep[]>(() => {
    if (!sections || !pages || !steps || !rules) { return []; }
    return getReferencedSteps(pages, steps, rules, sections);
  }, [sections, pages, steps, rules]);

  const fields = useMemo(
    () => buildSimulationFields(referencedSteps, pageTitleById),
    [referencedSteps, pageTitleById]
  );

  const resolveAlias = useMemo(() => buildStepAliasResolver(steps ?? []), [steps]);

  const simulation = useMemo<SimulatedPath | undefined>(() => {
    if (!sections || !pages || !steps || !rules) { return undefined; }
    return simulateWorkflowPath({ sections, pages, steps, rules, data: answers, resolveAlias });
  }, [sections, pages, steps, rules, answers, resolveAlias]);

  const setAnswer = useCallback((stepId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  const resetAnswers = useCallback(() => { setAnswers({}); }, []);

  return {
    fields,
    answers,
    setAnswer,
    resetAnswers,
    simulation,
    isLoading: !sections || !pages || !steps || !rules,
  };
}
