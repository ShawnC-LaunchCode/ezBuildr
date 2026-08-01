/**
 * Workflow Conditional Logic Engine
 *
 * This module provides conditional logic evaluation for Vault-Logic workflows.
 * It extends the base conditional logic to support both step-level and section-level targeting.
 *
 * NOTE: When using logic rules with step aliases, operands should be resolved to canonical
 * step keys before evaluation using the VariableResolver utility (server/utils/variableResolver.ts).
 * This allows rules to reference steps by either alias or key, with everything normalized to keys.
 */

import { evaluateConditionExpression } from './conditionEvaluator';
import type { ConditionExpression } from './types/conditions';
import { isRunnerRequirableStepType } from './types/runnerStepTypes';
import type { LogicRule } from './schema';

export type EvaluableLogicRule = Pick<
  LogicRule,
  'conditionStepId' | 'operator' | 'conditionValue' | 'targetType' |
  'targetStepId' | 'targetSectionId' | 'action' | 'order'
>;

interface VisibilitySectionDefinition {
  id: string;
  visibleIf?: unknown;
}

interface VisibilityStepDefinition {
  id: string;
  sectionId: string;
  required?: boolean | null;
  visibleIf?: unknown;
  /**
   * Step type, used to exclude runner-unsupported/unknown types from
   * `requiredSteps` (RUN2-3). Optional only because some historical callers
   * may not supply it; a missing type is treated as requirable rather than
   * silently dropped (see `evaluateWorkflowVisibility`).
   */
  type?: string;
}

export interface WorkflowVisibilityResult {
  visibleSections: Set<string>;
  visibleSteps: Set<string>;
  requiredSteps: Set<string>;
  ruleEvaluation: WorkflowEvaluationResult;
}

/**
 * Minimal section/step shape `LogicContext` needs. Both a live DB row
 * (`Section`/`Step` from `./schema`) and a run's pinned-definition snapshot
 * (`RunSection`/`RunStep` in
 * `server/services/workflow-runs/RunDefinitionProvider.ts`, RVP-1) satisfy
 * this -- `LogicContext` must accept either source. RVP-2 made
 * `LogicService` resolve through the run-definition provider (pinned graph
 * when a run has a version, live tables otherwise) instead of always
 * reading the live tables directly, so this can no longer be pinned to the
 * exact DB-inferred `Section`/`Step` types.
 */
export interface LogicContextSection {
  id: string;
  workflowId: string;
  title: string;
  description: string | null;
  order: number;
  visibleIf?: unknown;
  skipIf?: unknown;
  config?: unknown;
}

export interface LogicContextStep {
  id: string;
  workflowId: string;
  sectionId: string;
  type: string;
  title: string;
  description: string | null;
  required: boolean | null;
  alias: string | null;
  visibleIf?: unknown;
  order: number;
  isVirtual: boolean;
  updatedAt: Date | null;
}

/**
 * Context containing pre-loaded workflow definition and current data state
 * Used to avoid N+1 queries during navigation evaluation
 */
export interface LogicContext {
  workflowId: string;
  sections: LogicContextSection[];
  steps: LogicContextStep[];
  rules: LogicRule[];
  data: Record<string, unknown>;

  // Pre-computed indexes for O(1) lookups
  sectionHideRulesMap: Map<string, LogicRule[]>;
  stepHideRulesMap: Map<string, LogicRule[]>;

  // Helper for visibleIf expressions
  aliasResolver: (name: string) => string | undefined;
}

/**
 * Supported operators for conditional logic
 */
export type LogicOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'is_empty'
  | 'is_not_empty';

/**
 * Evaluation result for workflow logic
 */
export interface WorkflowEvaluationResult {
  visibleSections: Set<string>;
  hiddenSections: Set<string>;
  visibleSteps: Set<string>;
  hiddenSteps: Set<string>;
  requiredSteps: Set<string>;
  skipToSectionId?: string; // Section to skip to based on logic
  nextSectionId?: string; // Next section in normal flow
}

/**
 * Evaluates all logic rules for a workflow run
 *
 * @param rules - Array of logic rules to evaluate
 * @param data - Current step values (stepId -> value)
 * @returns Evaluation result with visible sections, steps, and requirements
 */
export function evaluateRules(
  rules: EvaluableLogicRule[],
  data: Record<string, unknown>
): WorkflowEvaluationResult {
  const result: WorkflowEvaluationResult = {
    visibleSections: new Set(),
    hiddenSections: new Set(),
    visibleSteps: new Set(),
    hiddenSteps: new Set(),
    requiredSteps: new Set(),
  };

  // Group rules by target
  const sectionRules = rules.filter(r => r.targetType === 'section');
  const stepRules = rules.filter(r => r.targetType === 'step');

  // Evaluate section-level rules in ascending rule.order so that, when
  // multiple skip_to rules fire, the outcome is deterministic (first firing
  // rule wins) rather than depending on incoming array order.
  const orderedSectionRules = [...sectionRules].sort((a, b) => a.order - b.order);
  orderedSectionRules.forEach(rule => {
    const conditionMet = evaluateCondition(rule, data);

    if (conditionMet) {
      const targetId = rule.targetSectionId;
      if (!targetId) {return;}

      switch (rule.action) {
        case 'show':
          result.hiddenSections.delete(targetId);
          result.visibleSections.add(targetId);
          break;
        case 'hide':
          result.visibleSections.delete(targetId);
          result.hiddenSections.add(targetId);
          break;
        case 'skip_to':
          // First firing skip_to rule (lowest order) wins; later ones are ignored.
          if (result.skipToSectionId === undefined) {
            result.skipToSectionId = targetId;
          }
          break;
      }
    }
  });

  // Evaluate step-level rules
  stepRules.forEach(rule => {
    const conditionMet = evaluateCondition(rule, data);

    if (conditionMet) {
      const targetId = rule.targetStepId;
      if (!targetId) {return;}

      switch (rule.action) {
        case 'show':
          result.hiddenSteps.delete(targetId);
          result.visibleSteps.add(targetId);
          break;
        case 'hide':
          result.visibleSteps.delete(targetId);
          result.hiddenSteps.add(targetId);
          result.requiredSteps.delete(targetId); // Can't require hidden steps
          break;
        case 'require':
          result.requiredSteps.add(targetId);
          break;
        case 'make_optional':
          result.requiredSteps.delete(targetId);
          break;
      }
    }
  });

  return result;
}

/**
 * Canonical visibility/requiredness calculation shared by runner rendering,
 * navigation, and completion validation. Targets controlled by a `show` rule
 * are hidden until at least one matching show rule explicitly reveals them.
 * Invalid visibleIf expressions fail closed.
 */
export function evaluateWorkflowVisibility(options: {
  sections: VisibilitySectionDefinition[];
  steps: VisibilityStepDefinition[];
  rules: EvaluableLogicRule[];
  data: Record<string, unknown>;
  resolveAlias: (name: string) => string | undefined;
}): WorkflowVisibilityResult {
  const { sections, steps, rules, data, resolveAlias } = options;
  const ruleEvaluation = evaluateRules(rules, data);
  const sectionShowTargets = new Set(
    rules.filter((rule) => rule.targetType === 'section' && rule.action === 'show')
      .map((rule) => rule.targetSectionId)
      .filter((id): id is string => Boolean(id))
  );
  const stepShowTargets = new Set(
    rules.filter((rule) => rule.targetType === 'step' && rule.action === 'show')
      .map((rule) => rule.targetStepId)
      .filter((id): id is string => Boolean(id))
  );

  const expressionVisible = (expression: unknown): boolean => {
    if (expression == null) {return true;}
    try {
      return evaluateConditionExpression(expression as ConditionExpression, data, resolveAlias);
    } catch {
      return false;
    }
  };

  const visibleSections = new Set(
    sections
      .filter((section) => expressionVisible(section.visibleIf))
      .filter((section) => sectionShowTargets.has(section.id)
        ? ruleEvaluation.visibleSections.has(section.id)
        : !ruleEvaluation.hiddenSections.has(section.id))
      .map((section) => section.id)
  );

  const visibleSteps = new Set(
    steps
      .filter((step) => visibleSections.has(step.sectionId))
      .filter((step) => expressionVisible(step.visibleIf))
      .filter((step) => stepShowTargets.has(step.id)
        ? ruleEvaluation.visibleSteps.has(step.id)
        : !ruleEvaluation.hiddenSteps.has(step.id))
      .map((step) => step.id)
  );

  const initiallyRequired = new Set(
    steps.filter((step) => step.required === true).map((step) => step.id)
  );
  const effectiveRequired = getEffectiveRequiredSteps(initiallyRequired, rules, data);

  // A step whose type the runner cannot render (unsupported/unknown — e.g.
  // file_upload — see RUN2-3) can never be satisfied
  // by a respondent, whether it is required by its own `required: true` or
  // by a rule's `require` action. Excluding it here — the one place
  // navigation, section-submit, and completion all derive `requiredSteps`
  // from — fixes all three at once. A step with no `type` supplied is
  // treated as requirable rather than silently dropped.
  const stepTypeById = new Map(steps.map((step) => [step.id, step.type]));
  const requiredSteps = new Set(
    Array.from(effectiveRequired).filter((stepId) => {
      if (!visibleSteps.has(stepId)) {
        return false;
      }
      const type = stepTypeById.get(stepId);
      return type === undefined || isRunnerRequirableStepType(type);
    })
  );

  return { visibleSections, visibleSteps, requiredSteps, ruleEvaluation };
}

/**
 * Evaluates a single condition
 */
function evaluateCondition(rule: EvaluableLogicRule, data: Record<string, unknown>): boolean {
  // RUN2-11: a rule whose condition step could not be resolved (empty/missing
  // conditionStepId) must have no effect - fail safe for every operator,
  // including is_empty/is_not_empty, which would otherwise treat the
  // resulting `undefined` lookup as "empty" and fire unconditionally.
  if (!rule.conditionStepId) {
    return false;
  }

  const actualValue = data[rule.conditionStepId];
  const expectedValue = rule.conditionValue;

  // Handle empty checks first
  if (rule.operator === 'is_empty') {
    return isEmpty(actualValue);
  }
  if (rule.operator === 'is_not_empty') {
    return !isEmpty(actualValue);
  }

  // If no value and not checking for empty, condition is false
  if (actualValue === undefined || actualValue === null) {
    return false;
  }

  switch (rule.operator) {
    case 'equals':
      return isEqual(actualValue, expectedValue);

    case 'not_equals':
      return !isEqual(actualValue, expectedValue);

    case 'contains':
      return containsValue(actualValue, expectedValue);

    case 'not_contains':
      return !containsValue(actualValue, expectedValue);

    case 'greater_than':
      return compareNumeric(actualValue, expectedValue) > 0;

    case 'less_than':
      return compareNumeric(actualValue, expectedValue) < 0;

    case 'between':
      return isBetween(actualValue, expectedValue);

    default:
      console.warn('Unknown operator:', rule.operator);
      return false;
  }
}

/**
 * Checks if two values are equal
 */
function isEqual(actual: unknown, expected: unknown): boolean {
  // Handle arrays. Sort copies, never the caller-owned arrays: `actual` is the
  // live value from the run's data map (the same array `formValues` state
  // holds on the client) and `expected` is `rule.conditionValue` (shared
  // across the whole evaluation pass), so sorting in place would silently
  // reorder saved respondent data (RUN2-5).
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const actualArr = actual as unknown[];
    const expectedArr = expected as unknown[];
    return JSON.stringify([...actualArr].sort()) === JSON.stringify([...expectedArr].sort());
  }

  // Handle strings (case-insensitive)
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLowerCase() === expected.toLowerCase();
  }

  // Handle booleans
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    return Boolean(actual) === Boolean(expected);
  }

  // Standard equality
  return actual === expected;
}

/**
 * Checks if actual contains expected value
 */
function containsValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some(item => isEqual(item, expected));
  }

  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }

  return false;
}

/**
 * Compares two numeric values
 */
function compareNumeric(actual: unknown, expected: unknown): number {
  const numActual = parseFloat(String(actual));
  const numExpected = parseFloat(String(expected));

  if (isNaN(numActual) || isNaN(numExpected)) {
    return 0;
  }

  return numActual - numExpected;
}

/**
 * Checks if value is between min and max
 */
function isBetween(actual: unknown, range: unknown): boolean {
  const numActual = parseFloat(String(actual));

  if (isNaN(numActual)) {
    return false;
  }

  // Expect range to be { min: number, max: number }
  if (typeof range === 'object' && range !== null && 'min' in range && 'max' in range) {
    const rangeObj = range as { min: unknown; max: unknown };
    const min = parseFloat(String(rangeObj.min));
    const max = parseFloat(String(rangeObj.max));

    if (isNaN(min) || isNaN(max)) {
      return false;
    }

    return numActual >= min && numActual <= max;
  }

  return false;
}

/**
 * Checks if value is empty
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }

  return false;
}

/**
 * Calculates the next section based on current section, section order, and visibility
 *
 * @param currentSectionId - Current section ID (null if at start)
 * @param sections - Array of sections ordered by their 'order' field
 * @param visibleSections - Set of visible section IDs
 * @returns Next section ID or null if completed
 */
export function calculateNextSection(
  currentSectionId: string | null,
  sections: Array<{ id: string; order: number }>,
  visibleSections: Set<string>
): string | null {
  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  // If no current section, return first visible section
  if (!currentSectionId) {
    const firstVisible = sortedSections.find(s => visibleSections.has(s.id));
    return firstVisible?.id ?? null;
  }

  // Find current section index
  const currentIndex = sortedSections.findIndex(s => s.id === currentSectionId);
  if (currentIndex === -1) {
    return null;
  }

  // Find next visible section after current
  for (let i = currentIndex + 1; i < sortedSections.length; i++) {
    const section = sortedSections[i];
    if (visibleSections.has(section.id)) {
      return section.id;
    }
  }

  // No more visible sections - workflow complete
  return null;
}

/**
 * Resolves the actual next section considering skip logic
 *
 * A skip target that is not strictly after the current section (i.e. its
 * `order` is <= the current section's `order`) is treated as a no-op and
 * navigation falls through to normal flow. Without this guard, a `skip_to`
 * rule whose condition remains true would trap the run in an infinite
 * navigation loop (see RUN2-2).
 *
 * @param currentSectionId - Current section ID (null if at start)
 * @param nextSectionId - Normal next section
 * @param skipToSectionId - Skip target section (takes precedence when forward)
 * @param sections - Array of sections ordered by their 'order' field
 * @param visibleSections - Set of visible section IDs
 * @returns Resolved next section ID or null if completed
 */
export function resolveNextSection(
  currentSectionId: string | null,
  nextSectionId: string | null,
  skipToSectionId: string | undefined,
  sections: Array<{ id: string; order: number }>,
  visibleSections: Set<string>
): string | null {
  // Skip logic takes precedence, but only when it moves the run forward.
  if (skipToSectionId && isForwardSkipTarget(currentSectionId, skipToSectionId, sections)) {
    // If skip target is visible, use it
    if (visibleSections.has(skipToSectionId)) {
      return skipToSectionId;
    }

    // If skip target is not visible, find next visible after it
    return calculateNextSection(skipToSectionId, sections, visibleSections);
  }

  // Use normal next section if no skip, or if the skip target is backwards/same (no-op)
  return nextSectionId;
}

/**
 * Determines whether a skip target's `order` is strictly after the current
 * section's `order`. A skip target whose section can't be resolved against
 * the known sections is left to the existing "not found" handling in
 * `calculateNextSection` rather than being pre-filtered here.
 */
function isForwardSkipTarget(
  currentSectionId: string | null,
  skipToSectionId: string,
  sections: Array<{ id: string; order: number }>
): boolean {
  if (currentSectionId === null) {
    // No current section yet (start of run) - any skip target is forward.
    return true;
  }

  const currentOrder = sections.find(s => s.id === currentSectionId)?.order;
  const skipTargetOrder = sections.find(s => s.id === skipToSectionId)?.order;

  if (currentOrder === undefined || skipTargetOrder === undefined) {
    return true;
  }

  return skipTargetOrder > currentOrder;
}

/**
 * Validates that all required steps have values
 *
 * @param requiredStepIds - Set of required step IDs
 * @param data - Current step values
 * @returns Object with validation result and missing step IDs
 */
export function validateRequiredSteps(
  requiredStepIds: Set<string>,
  data: Record<string, unknown>
): { valid: boolean; missingSteps: string[] } {
  const missingSteps: string[] = [];

  requiredStepIds.forEach(stepId => {
    const value = data[stepId];
    if (isEmpty(value)) {
      missingSteps.push(stepId);
    }
  });

  return {
    valid: missingSteps.length === 0,
    missingSteps,
  };
}

/**
 * Gets the effective requirements for steps based on initial requirements and logic rules
 *
 * @param initialRequiredSteps - Steps marked as required in their definition
 * @param rules - Logic rules that might change requirements
 * @param data - Current step values
 * @returns Set of step IDs that are actually required
 */
export function getEffectiveRequiredSteps(
  initialRequiredSteps: Set<string>,
  rules: EvaluableLogicRule[],
  data: Record<string, unknown>
): Set<string> {
  const result = new Set(initialRequiredSteps);

  // Apply logic rules that modify requirements
  const requirementRules = rules.filter(
    r => r.targetType === 'step' && (r.action === 'require' || r.action === 'make_optional')
  );

  requirementRules.forEach(rule => {
    const conditionMet = evaluateCondition(rule, data);
    const targetId = rule.targetStepId;

    if (conditionMet && targetId) {
      if (rule.action === 'require') {
        result.add(targetId);
      } else if (rule.action === 'make_optional') {
        result.delete(targetId);
      }
    }
  });

  return result;
}
