/**
 * useWorkflowVisibility Hook
 *
 * Manages step visibility based on logic rules and current form values.
 * Provides real-time visibility updates as users answer questions.
 *
 * Supports TWO visibility systems:
 * 1. Workflow-level logic rules (logic_rules table)
 * 2. Step-level visibleIf expressions (steps.visible_if column)
 */

import { useState, useEffect, useMemo } from 'react';

import { evaluateConditionExpression } from '@shared/conditionEvaluator';
import type { LogicRule, Step } from '@shared/schema';
import { evaluateRules, type WorkflowEvaluationResult } from '@shared/workflowLogic';

export interface VisibilityState {
  visibleSteps: Set<string>;
  hiddenSteps: Set<string>;
  requiredSteps: Set<string>;
  isStepVisible: (stepId: string) => boolean;
  isStepRequired: (stepId: string) => boolean;
}

/**
 * Hook to manage step visibility based on logic rules and current answers
 *
 * @param logicRules - Logic rules for the workflow
 * @param allSteps - All steps in the current section/workflow
 * @param formValues - Current form values (stepId -> value)
 * @returns Visibility state with helper functions
 */
export function useWorkflowVisibility(
  logicRules: LogicRule[] | undefined,
  allSteps: Step[] | undefined,
  formValues: Record<string, any>
): VisibilityState {
  const [visibilityResult, setVisibilityResult] = useState<WorkflowEvaluationResult>({
    visibleSections: new Set(),
    visibleSteps: new Set(),
    requiredSteps: new Set(),
  });

  // Evaluate logic rules whenever rules or form values change
  useEffect(() => {
    if (!allSteps) {
      return;
    }

    // Start with all steps visible by default
    const finalVisibleSteps = new Set<string>();

    // Create alias resolver that maps variable names to step IDs
    const aliasResolver = (variableName: string): string | undefined => {
      const step = allSteps.find(s => s.alias === variableName);
      return step?.id;
    };

    // Check each step for visibleIf expression (step-level visibility)
    allSteps.forEach(step => {
      // If step has a visibleIf expression, evaluate it
      if (step.visibleIf) {
        try {
          const isVisible = evaluateConditionExpression(step.visibleIf as any, formValues, aliasResolver);
          if (isVisible) {
            finalVisibleSteps.add(step.id);
          }
        } catch (error) {
          console.error('Error evaluating step visibility:', error);
          // On error, default to visible
          finalVisibleSteps.add(step.id);
        }
      } else {
        // No visibleIf expression, step is visible by default
        finalVisibleSteps.add(step.id);
      }
    });

    // If no logic rules exist, use the step-level visibility results
    if (!logicRules || logicRules.length === 0) {
      setVisibilityResult({
        visibleSections: new Set(),
        visibleSteps: finalVisibleSteps,
        requiredSteps: new Set(),
      });
      return;
    }

    // Evaluate workflow-level rules with current form values
    const result = evaluateRules(logicRules, formValues);

    // Combine workflow-level rules with step-level visibleIf
    // Step-level visibleIf takes precedence over workflow rules
    const allStepIds = new Set(allSteps.map(s => s.id));

    // Steps are visible if:
    // 1. They're visible according to step-level visibleIf (if defined), AND
    // 2. They're visible according to workflow-level rules (if defined)
    const combinedVisibleSteps = new Set<string>();

    allStepIds.forEach(stepId => {
      // Check step-level visibility
      const stepLevelVisible = finalVisibleSteps.has(stepId);

      // Check workflow-level visibility
      const stepsWithHideRules = new Set(
        logicRules
          .filter(r => r.targetType === 'step' && r.action === 'hide')
          .map(r => r.targetStepId)
          .filter(Boolean) as string[]
      );

      const stepsWithShowRules = new Set(
        logicRules
          .filter(r => r.targetType === 'step' && r.action === 'show')
          .map(r => r.targetStepId)
          .filter(Boolean) as string[]
      );

      const hasShowRules = stepsWithShowRules.has(stepId);
      const hasHideRules = stepsWithHideRules.has(stepId);
      const explicitlyShown = result.visibleSteps.has(stepId);
      const explicitlyHidden = hasHideRules && !explicitlyShown;

      let workflowLevelVisible = true;
      if (hasShowRules) {
        workflowLevelVisible = explicitlyShown;
      } else if (explicitlyHidden) {
        workflowLevelVisible = false;
      }

      // Combine: both must be true for step to be visible
      if (stepLevelVisible && workflowLevelVisible) {
        combinedVisibleSteps.add(stepId);
      }
    });

    setVisibilityResult({
      ...result,
      visibleSteps: combinedVisibleSteps,
    });
  }, [logicRules, allSteps, formValues]);

  // Compute hidden steps (inverse of visible)
  const hiddenSteps = useMemo(() => {
    if (!allSteps) {return new Set<string>();}

    const hidden = new Set<string>();
    allSteps.forEach(step => {
      if (!visibilityResult.visibleSteps.has(step.id)) {
        hidden.add(step.id);
      }
    });
    return hidden;
  }, [allSteps, visibilityResult.visibleSteps]);

  // Helper functions
  const isStepVisible = (stepId: string): boolean => {
    return visibilityResult.visibleSteps.has(stepId);
  };

  const isStepRequired = (stepId: string): boolean => {
    // Step is required if:
    // 1. It's marked as required by a logic rule, OR
    // 2. It's marked as required in the step definition AND not made optional by a logic rule
    return visibilityResult.requiredSteps.has(stepId);
  };

  return {
    visibleSteps: visibilityResult.visibleSteps,
    hiddenSteps,
    requiredSteps: visibilityResult.requiredSteps,
    isStepVisible,
    isStepRequired,
  };
}
