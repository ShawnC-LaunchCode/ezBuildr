// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePageVisibility } from '../../../client/src/hooks/runner/usePageVisibility';
import type { ApiPage, ApiStep, StepType } from '../../../client/src/lib/vault-api';
import type { LogicRule } from '@shared/schema';

import {
  sectionPageVisibilityCases,
  sectionPageVisibilityFixture,
} from '../../fixtures/sectionVisibilityMatrix';
import { buildTestWhen } from '../../helpers/conditionFixtures';

const createdAt = '2026-07-13T00:00:00.000Z';

function createPage(id: string, order: number): ApiPage {
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

function createStep(id: string, pageId: string, order: number, type: StepType = 'short_text'): ApiStep {
  return {
    id,
    workflowId: 'workflow-1',
    pageId,
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
    targetType: 'page',
    targetPageId: 'details',
    targetStepId: null,
    action: 'show',
    order: 1,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('usePageVisibility', () => {
  it.each(sectionPageVisibilityCases)(
    'matches the shared Section/page matrix for section=$sectionVisible page=$pageVisible',
    ({ data, expectedVisiblePageIds }) => {
      const { result } = renderHook(() => usePageVisibility(
        sectionPageVisibilityFixture.pages,
        sectionPageVisibilityFixture.steps,
        data,
        sectionPageVisibilityFixture.rules,
        sectionPageVisibilityFixture.sections
      ));

      expect(result.current.visiblePages.map((candidate) => candidate.id)).toEqual(expectedVisiblePageIds);
    },
  );

  it('evaluates persisted show rules against preview-style in-memory pages', () => {
    const pages = [createPage('intro', 1), createPage('details', 2)];
    const steps = [createStep('controller', 'intro', 1), createStep('detail-step', 'details', 1)];
    const showDetails = createLogicRule({});

    const { result, rerender } = renderHook(
      ({ values }) => usePageVisibility(pages, steps, values, [showDetails]),
      { initialProps: { values: {} as Record<string, unknown> } }
    );

    expect(result.current.visiblePages.map((page) => page.id)).toEqual(['intro']);

    rerender({ values: { controller: 'yes' } });

    expect(result.current.visiblePages.map((page) => page.id)).toEqual(['intro', 'details']);
  });

  it('only hides steps when a persisted hide rule condition is met', () => {
    const pages = [createPage('intro', 1)];
    const steps = [
      createStep('controller', 'intro', 1),
      createStep('conditional-step', 'intro', 2),
    ];
    const hideConditionalStep = createLogicRule({
      targetType: 'step',
      targetPageId: null,
      targetStepId: 'conditional-step',
      action: 'hide',
    });

    const { result, rerender } = renderHook(
      ({ values }) => usePageVisibility(pages, steps, values, [hideConditionalStep]),
      { initialProps: { values: {} as Record<string, unknown> } }
    );

    expect(result.current.getVisiblePageSteps('intro').map((step) => step.id)).toEqual([
      'controller',
      'conditional-step',
    ]);

    rerender({ values: { controller: 'yes' } });

    expect(result.current.getVisiblePageSteps('intro').map((step) => step.id)).toEqual(['controller']);
  });

  it('excludes a final-block step from getVisiblePageSteps regardless of authoring spelling', () => {
    const pages = [createPage('intro', 1)];
    const steps = [
      createStep('question', 'intro', 1),
      createStep('final-easy-mode', 'intro', 2, 'final'),
      createStep('final-advanced', 'intro', 3, 'final_documents'),
    ];

    const { result } = renderHook(() => usePageVisibility(pages, steps, {}, []));

    expect(result.current.getVisiblePageSteps('intro').map((step) => step.id)).toEqual(['question']);
  });
});
