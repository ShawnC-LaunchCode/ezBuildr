// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSectionVisibility } from '../../../client/src/hooks/runner/useSectionVisibility';
import type { ApiSection, ApiStep, StepType } from '../../../client/src/lib/vault-api';
import type { LogicRule } from '@shared/schema';

import { buildTestWhen } from '../../helpers/conditionFixtures';

const createdAt = '2026-07-13T00:00:00.000Z';

function createSection(id: string, order: number): ApiSection {
  return {
    id,
    workflowId: 'workflow-1',
    title: id,
    description: null,
    order,
    config: {},
    createdAt,
  };
}

function createStep(id: string, sectionId: string, order: number, type: StepType = 'short_text'): ApiStep {
  return {
    id,
    workflowId: 'workflow-1',
    sectionId,
    type,
    title: id,
    description: null,
    required: false,
    alias: null,
    order,
    isVirtual: false,
    config: null,
    createdAt,
  };
}

function createLogicRule(overrides: Partial<LogicRule>): LogicRule {
  return {
    id: 'rule-1',
    workflowId: 'workflow-1',
    conditionStepId: 'controller',
    when: buildTestWhen('controller', 'equals', 'yes'),
    targetType: 'section',
    targetSectionId: 'details',
    targetStepId: null,
    action: 'show',
    order: 1,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('useSectionVisibility', () => {
  it('evaluates persisted show rules against preview-style in-memory sections', () => {
    const sections = [createSection('intro', 1), createSection('details', 2)];
    const steps = [createStep('controller', 'intro', 1), createStep('detail-step', 'details', 1)];
    const showDetails = createLogicRule({});

    const { result, rerender } = renderHook(
      ({ values }) => useSectionVisibility(sections, steps, values, [showDetails]),
      { initialProps: { values: {} as Record<string, unknown> } }
    );

    expect(result.current.visibleSections.map((section) => section.id)).toEqual(['intro']);

    rerender({ values: { controller: 'yes' } });

    expect(result.current.visibleSections.map((section) => section.id)).toEqual(['intro', 'details']);
  });

  it('only hides steps when a persisted hide rule condition is met', () => {
    const sections = [createSection('intro', 1)];
    const steps = [
      createStep('controller', 'intro', 1),
      createStep('conditional-step', 'intro', 2),
    ];
    const hideConditionalStep = createLogicRule({
      targetType: 'step',
      targetSectionId: null,
      targetStepId: 'conditional-step',
      action: 'hide',
    });

    const { result, rerender } = renderHook(
      ({ values }) => useSectionVisibility(sections, steps, values, [hideConditionalStep]),
      { initialProps: { values: {} as Record<string, unknown> } }
    );

    expect(result.current.getVisibleSectionSteps('intro').map((step) => step.id)).toEqual([
      'controller',
      'conditional-step',
    ]);

    rerender({ values: { controller: 'yes' } });

    expect(result.current.getVisibleSectionSteps('intro').map((step) => step.id)).toEqual(['controller']);
  });

  it('excludes a final-block step from getVisibleSectionSteps regardless of authoring spelling', () => {
    const sections = [createSection('intro', 1)];
    const steps = [
      createStep('question', 'intro', 1),
      createStep('final-easy-mode', 'intro', 2, 'final'),
      createStep('final-advanced', 'intro', 3, 'final_documents'),
    ];

    const { result } = renderHook(() => useSectionVisibility(sections, steps, {}, []));

    expect(result.current.getVisibleSectionSteps('intro').map((step) => step.id)).toEqual(['question']);
  });
});
