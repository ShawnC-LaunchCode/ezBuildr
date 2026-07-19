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
import type { LogicRule, Section, Step } from './schema';

export type EvaluableLogicRule = Pick<
  LogicRule,
  'conditionStepId' | 'operator' | 'conditionValue' | 'targetType' |
  'targetStepId' | 'targetSectionId' | 'action'
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
}

export interface WorkflowVisibilityResult {
  visibleSections: Set<string>;
  visibleSteps: Set<string>;
  requiredSteps: Set<string>;
  ruleEvaluation: WorkflowEvaluationResult;
}

/**
 * Context containing pre-loaded workflow definition and current data state
 * Used to avoid N+1 queries during navigation evaluation
 */
export interface LogicContext {
  workflowId: string;
  sections: Section[];
  steps: Step[];
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

  // Evaluate section-level rules
  sectionRules.forEach(rule => {
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
          // Set the skip target - this takes precedence over normal flow
          result.skipToSectionId = targetId;
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
  const requiredSteps = new Set(
    Array.from(effectiveRequired).filter((stepId) => visibleSteps.has(stepId))
  );

  return { visibleSections, visibleSteps, requiredSteps, ruleEvaluation };
}

/**
 * Evaluates a single condition
 */
function evaluateCondition(rule: EvaluableLogicRule, data: Record<string, unknown>): boolean {
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
  // Handle arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return JSON.stringify(actual.sort()) === JSON.stringify(expected.sort());
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
 * @param nextSectionId - Normal next section
 * @param skipToSectionId - Skip target section (takes precedence)
 * @param sections - Array of sections ordered by their 'order' field
 * @param visibleSections - Set of visible section IDs
 * @returns Resolved next section ID or null if completed
 */
export function resolveNextSection(
  nextSectionId: string | null,
  skipToSectionId: string | undefined,
  sections: Array<{ id: string; order: number }>,
  visibleSections: Set<string>
): string | null {
  // Skip logic takes precedence
  if (skipToSectionId) {
    // If skip target is visible, use it
    if (visibleSections.has(skipToSectionId)) {
      return skipToSectionId;
    }

    // If skip target is not visible, find next visible after it
    return calculateNextSection(skipToSectionId, sections, visibleSections);
  }

  // Use normal next section if no skip
  return nextSectionId;
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
