/**
 * Conditional Logic Utilities
 *
 * This module provides utilities for evaluating conditional logic rules
 * in survey questions to determine question visibility and requirements.
 */

import type {
  ConditionalRule,
  ConditionalEvaluationResult,
  ConditionalLogicConfig,
  ConditionalCondition
} from './schema';

export type {
  ConditionalRule,
  ConditionalEvaluationResult,
  ConditionalLogicConfig,
  ConditionalCondition
};

/**
 * Evaluation context for conditional logic
 */
export interface EvaluationContext {
  answers: Map<string, any>;
  conditions: ConditionalRule[];
}

/**
 * Evaluates a single conditional rule based on user answers
 *
 * @param rule - The conditional rule to evaluate
 * @param answersOrContext - Current user answers as a record or an EvaluationContext
 * @returns boolean indicating if the condition is met
 */
export function evaluateCondition(
  rule: ConditionalRule,
  answersOrContext: Record<string, any> | EvaluationContext
): boolean {
  // Handle both Record and EvaluationContext inputs
  let answers: Record<string, any>;
  if ('answers' in answersOrContext && answersOrContext.answers instanceof Map) {
    // Convert Map to Record
    answers = {};
    answersOrContext.answers.forEach((value, key) => {
      answers[key] = value;
    });
  } else {
    answers = answersOrContext as Record<string, any>;
  }

  const conditionAnswer = answers[rule.conditionQuestionId];
  const conditionValue = rule.conditionValue;

  // If no answer provided for the condition question, evaluate as false
  if (conditionAnswer === undefined || conditionAnswer === null) {
    return rule.operator === 'is_empty';
  }

  switch (rule.operator) {
    case 'equals':
      return isEqual(conditionAnswer, conditionValue);

    case 'not_equals':
      return !isEqual(conditionAnswer, conditionValue);

    case 'contains':
      return containsValue(conditionAnswer, conditionValue);

    case 'not_contains':
      return !containsValue(conditionAnswer, conditionValue);

    case 'greater_than':
      return compareNumeric(conditionAnswer, conditionValue, '>');

    case 'less_than':
      return compareNumeric(conditionAnswer, conditionValue, '<');

    case 'between':
      return isBetween(conditionAnswer, conditionValue);

    case 'is_empty':
      return isEmpty(conditionAnswer);

    case 'is_not_empty':
      return !isEmpty(conditionAnswer);

    default:
      console.warn('Unknown condition operator:', rule.operator);
      return false;
  }
}

/**
 * Checks if two values are equal, handling different data types
 */
function isEqual(answer: any, expectedValue: any): boolean {
  // Handle array comparisons (for multiple choice questions)
  if (Array.isArray(answer) && Array.isArray(expectedValue)) {
    return JSON.stringify(answer.sort()) === JSON.stringify(expectedValue.sort());
  }

  // Handle string/number comparisons
  if (typeof answer === 'string' && typeof expectedValue === 'string') {
    return answer.toLowerCase() === expectedValue.toLowerCase();
  }

  // Handle boolean comparisons
  if (typeof answer === 'boolean' || typeof expectedValue === 'boolean') {
    return Boolean(answer) === Boolean(expectedValue);
  }

  // Standard equality check
  return answer === expectedValue;
}

/**
 * Checks if an answer contains a specific value
 */
function containsValue(answer: any, searchValue: any): boolean {
  if (Array.isArray(answer)) {
    return answer.some(item => isEqual(item, searchValue));
  }

  if (typeof answer === 'string' && typeof searchValue === 'string') {
    return answer.toLowerCase().includes(searchValue.toLowerCase());
  }

  return false;
}

/**
 * Performs numeric comparison
 */
function compareNumeric(answer: any, compareValue: any, operator: '>' | '<'): boolean {
  const numAnswer = parseFloat(answer);
  const numCompareValue = parseFloat(compareValue);

  if (isNaN(numAnswer) || isNaN(numCompareValue)) {
    return false;
  }

  return operator === '>' ? numAnswer > numCompareValue : numAnswer < numCompareValue;
}

/**
 * Checks if a value is between two numeric values
 */
function isBetween(answer: any, rangeValue: any): boolean {
  const numAnswer = parseFloat(answer);

  if (isNaN(numAnswer)) {
    return false;
  }

  // Expect rangeValue to be an object like { min: number, max: number }
  if (typeof rangeValue === 'object' && rangeValue.min !== undefined && rangeValue.max !== undefined) {
    const min = parseFloat(rangeValue.min);
    const max = parseFloat(rangeValue.max);

    if (isNaN(min) || isNaN(max)) {
      return false;
    }

    return numAnswer >= min && numAnswer <= max;
  }

  return false;
}

/**
 * Checks if a value is considered empty
 */
function isEmpty(answer: any): boolean {
  if (answer === null || answer === undefined) {
    return true;
  }

  if (typeof answer === 'string') {
    return answer.trim() === '';
  }

  if (Array.isArray(answer)) {
    return answer.length === 0;
  }

  if (typeof answer === 'object') {
    return Object.keys(answer).length === 0;
  }

  return false;
}

/**
 * Evaluates all conditional rules for questions on a page
 * 
 * @param rules - Array of conditional rules
 * @param answers - Current user answers
 * @returns Array of evaluation results for each question
 */
export function evaluatePageConditionalLogic(
  rules: ConditionalRule[],
  answers: Record<string, any>
): ConditionalEvaluationResult[] {
  const evaluationResults: Record<string, ConditionalEvaluationResult> = {};

  // Group rules by target question
  const rulesByTarget = rules.reduce((acc, rule) => {
    const targetId = rule.targetQuestionId;
    if (!targetId) return acc;

    if (!acc[targetId]) {
      acc[targetId] = [];
    }
    acc[targetId].push(rule);
    return acc;
  }, {} as Record<string, ConditionalRule[]>);

  // Evaluate rules for each target question
  Object.entries(rulesByTarget).forEach(([questionId, questionRules]) => {
    const result = evaluateQuestionConditionalLogic(questionRules, answers);
    evaluationResults[questionId] = {
      questionId,
      visible: result.visible,
      required: result.required,
      reason: result.reason
    };
  });

  return Object.values(evaluationResults);
}

/**
 * Evaluates conditional logic for a single question
 * 
 * @param rules - Rules affecting this question
 * @param answers - Current user answers
 * @returns Evaluation result for the question
 */
function evaluateQuestionConditionalLogic(
  rules: ConditionalRule[],
  answers: Record<string, any>
): { visible: boolean; required: boolean; reason?: string } {
  if (rules.length === 0) {
    return { visible: true, required: false };
  }

  // Group rules by logical operator
  const andRules = rules.filter(r => r.logicalOperator === 'AND' || !r.logicalOperator);
  const orRules = rules.filter(r => r.logicalOperator === 'OR');

  // Determine initial visibility based on rule types
  // If there are OR rules with "show" action, start with false (must meet at least one)
  // Otherwise start with true (visible by default)
  const hasOrShowRules = orRules.some(r => r.action === 'show');
  let visible = !hasOrShowRules;
  let required = false;
  const reasons: string[] = [];

  // Evaluate AND rules - all must be true
  if (andRules.length > 0) {
    const andResults = andRules.map(rule => {
      const conditionMet = evaluateCondition(rule, answers);
      return { rule, conditionMet };
    });

    const allAndConditionsMet = andResults.every(r => r.conditionMet);

    // Apply actions based on AND results
    andRules.forEach((rule, index) => {
      const conditionMet = andResults[index].conditionMet;

      switch (rule.action) {
        case 'show':
          if (allAndConditionsMet && conditionMet) {
            visible = true;
            reasons.push(`Showing due to condition on ${rule.conditionQuestionId}`);
          } else if (!conditionMet) {
            visible = false;
            reasons.push(`Hidden due to unmet condition on ${rule.conditionQuestionId}`);
          }
          break;

        case 'hide':
          if (allAndConditionsMet && conditionMet) {
            visible = false;
            reasons.push(`Hidden due to condition on ${rule.conditionQuestionId}`);
          }
          break;

        case 'require':
          if (allAndConditionsMet && conditionMet) {
            required = true;
            reasons.push(`Required due to condition on ${rule.conditionQuestionId}`);
          }
          break;

        case 'make_optional':
          if (allAndConditionsMet && conditionMet) {
            required = false;
            reasons.push(`Made optional due to condition on ${rule.conditionQuestionId}`);
          }
          break;
      }
    });
  }

  // Evaluate OR rules - any can be true to trigger action
  if (orRules.length > 0) {
    const orResults = orRules.map(rule => {
      const conditionMet = evaluateCondition(rule, answers);
      return { rule, conditionMet };
    });

    orRules.forEach((rule, index) => {
      const conditionMet = orResults[index].conditionMet;

      if (conditionMet) {
        switch (rule.action) {
          case 'show':
            visible = true;
            reasons.push(`Showing due to OR condition on ${rule.conditionQuestionId}`);
            break;

          case 'hide':
            visible = false;
            reasons.push(`Hidden due to OR condition on ${rule.conditionQuestionId}`);
            break;

          case 'require':
            required = true;
            reasons.push(`Required due to OR condition on ${rule.conditionQuestionId}`);
            break;

          case 'make_optional':
            required = false;
            reasons.push(`Made optional due to OR condition on ${rule.conditionQuestionId}`);
            break;
        }
      }
    });
  }

  return {
    visible,
    required,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined
  };
}

/**
 * Detects circular dependencies in conditional rules
 * 
 * @param rules - Array of conditional rules
 * @returns Array of rule IDs that create circular dependencies
 */
export function detectCircularDependencies(rules: ConditionalRule[]): string[] {
  const circularRules: string[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  // Create adjacency list for dependencies
  const dependencies: Record<string, string[]> = {};

  rules.forEach(rule => {
    if (!rule.targetQuestionId) return;

    if (!dependencies[rule.conditionQuestionId]) {
      dependencies[rule.conditionQuestionId] = [];
    }
    dependencies[rule.conditionQuestionId].push(rule.targetQuestionId);
  });

  // DFS to detect cycles
  function hasCycle(questionId: string): boolean {
    if (recursionStack.has(questionId)) {
      return true; // Cycle detected
    }

    if (visited.has(questionId)) {
      return false;
    }

    visited.add(questionId);
    recursionStack.add(questionId);

    const dependentQuestions = dependencies[questionId] || [];

    for (const dependentId of dependentQuestions) {
      if (hasCycle(dependentId)) {
        circularRules.push(questionId);
        return true;
      }
    }

    recursionStack.delete(questionId);
    return false;
  }

  // Check all questions for cycles
  Object.keys(dependencies).forEach(questionId => {
    if (!visited.has(questionId)) {
      hasCycle(questionId);
    }
  });

  return circularRules;
}

/**
 * Validates conditional logic configuration
 * 
 * @param config - Conditional logic configuration
 * @returns Object with validation result and error messages
 */
export function validateConditionalLogic(config: ConditionalLogicConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  if (!config.conditions || config.conditions.length === 0) {
    errors.push('At least one condition is required when conditional logic is enabled');
  }

  config.conditions.forEach((condition, index) => {
    if (!condition.questionId) {
      errors.push(`Condition ${index + 1}: Question ID is required`);
    }

    if (!condition.operator) {
      errors.push(`Condition ${index + 1}: Operator is required`);
    }

    // Validate value based on operator
    if (['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than'].includes(condition.operator)) {
      if (condition.value === undefined || condition.value === null) {
        errors.push(`Condition ${index + 1}: Value is required for ${condition.operator} operator`);
      }
    }

    if (condition.operator === 'between') {
      if (!condition.value || typeof condition.value !== 'object' ||
        condition.value.min === undefined || condition.value.max === undefined) {
        errors.push(`Condition ${index + 1}: Between operator requires min and max values`);
      }
    }
  });

  if (!config.action) {
    errors.push('Action is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Helper function to create a condition evaluation context
 *
 * @param rules - Conditional rules
 * @param answers - Current answers
 * @returns Context object with evaluation utilities
 */
export function createEvaluationContext(rules: ConditionalRule[], answers: Record<string, any>) {
  return {
    rules,
    answers,
    evaluate: (questionId: string) => {
      const questionRules = rules.filter(r => r.targetQuestionId === questionId);
      return evaluateQuestionConditionalLogic(questionRules, answers);
    },
    evaluateAll: () => evaluatePageConditionalLogic(rules, answers),
    detectCircularDeps: () => detectCircularDependencies(rules)
  };
}

/**
 * Evaluates conditional logic for a specific question using EvaluationContext
 * This is the public API used by tests and frontend code
 *
 * @param questionId - The ID of the question to evaluate
 * @param context - The evaluation context with answers and conditions
 * @returns Object with visible and required flags
 */
export function evaluateConditionalLogic(
  questionId: string,
  context: EvaluationContext
): { visible: boolean; required: boolean } {
  // Convert Map to Record for internal evaluation
  const answersRecord: Record<string, any> = {};
  context.answers.forEach((value, key) => {
    answersRecord[key] = value;
  });

  // Get rules that target this question
  const questionRules = context.conditions.filter(r => r.targetQuestionId === questionId);

  // If no rules target this question, it's visible by default
  if (questionRules.length === 0) {
    return { visible: true, required: false };
  }

  // Use internal evaluation function
  const result = evaluateQuestionConditionalLogic(questionRules, answersRecord);

  return {
    visible: result.visible,
    required: result.required
  };
}