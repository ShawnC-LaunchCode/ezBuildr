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

import type { LogicRule } from './schema';

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
  visibleSteps: Set<string>;
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
  rules: LogicRule[],
  data: Record<string, any>
): WorkflowEvaluationResult {
  const result: WorkflowEvaluationResult = {
    visibleSections: new Set(),
    visibleSteps: new Set(),
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
          result.visibleSections.add(targetId);
          break;
        case 'hide':
          result.visibleSections.delete(targetId);
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
          result.visibleSteps.add(targetId);
          break;
        case 'hide':
          result.visibleSteps.delete(targetId);
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
 * Evaluates a single condition
 */
function evaluateCondition(rule: LogicRule, data: Record<string, any>): boolean {
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
function isEqual(actual: any, expected: any): boolean {
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
function containsValue(actual: any, expected: any): boolean {
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
function compareNumeric(actual: any, expected: any): number {
  const numActual = parseFloat(actual);
  const numExpected = parseFloat(expected);

  if (isNaN(numActual) || isNaN(numExpected)) {
    return 0;
  }

  return numActual - numExpected;
}

/**
 * Checks if value is between min and max
 */
function isBetween(actual: any, range: any): boolean {
  const numActual = parseFloat(actual);

  if (isNaN(numActual)) {
    return false;
  }

  // Expect range to be { min: number, max: number }
  if (typeof range === 'object' && range.min !== undefined && range.max !== undefined) {
    const min = parseFloat(range.min);
    const max = parseFloat(range.max);

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
function isEmpty(value: any): boolean {
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
  data: Record<string, any>
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
  rules: LogicRule[],
  data: Record<string, any>
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
