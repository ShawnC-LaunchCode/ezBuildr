// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePageVisibility } from '../../../client/src/hooks/runner/usePageVisibility';
import type { ApiPage, ApiStep } from '../../../client/src/lib/vault-api';

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

describe('usePageVisibility — ICW2-B10 (step-level visibleIf referencing another step by alias)', () => {
  it('reveals a step whose visibleIf references the controlling step by ALIAS, given an answer keyed by step id', () => {
    const pages = [createPage('page-1', 1)];
    const yesNoStep: ApiStep = {
      id: 'step-yesno-uuid',
      workflowId: 'workflow-1',
      pageId: 'page-1',
      type: 'yes_no',
      title: 'Do you agree?',
      description: null,
      required: false,
      alias: 'agree',
      order: 1,
      isVirtual: false,
      config: null,
      createdAt,
    } as ApiStep;

    const dateStep: ApiStep = {
      id: 'step-date-uuid',
      workflowId: 'workflow-1',
      pageId: 'page-1',
      type: 'date',
      title: 'Preferred date',
      description: null,
      required: false,
      alias: null,
      order: 2,
      isVirtual: false,
      config: null,
      // The builder persists a reference to the controlling step's alias, not
      // its raw step id (live-verified in tests/e2e/builder-ui-flow.e2e.ts).
      visibleIf: {
        type: 'group',
        operator: 'AND',
        not: false,
        conditions: [
          {
            type: 'condition',
            variable: 'agree',
            operator: 'is_true',
            value: true,
            valueType: 'constant',
          },
        ],
      },
      createdAt,
    } as ApiStep;

    const steps = [yesNoStep, dateStep];

    // Answers are keyed by step id (PageSteps' `values[step.id]`, and the
    // production `effectiveValues` map from useRunValues) — never by alias.
    const { result, rerender } = renderHook(
      ({ values }) => usePageVisibility(pages, steps, values, []),
      { initialProps: { values: {} as Record<string, unknown> } }
    );

    expect(result.current.getVisiblePageSteps('page-1').map((s) => s.id)).toEqual(['step-yesno-uuid']);

    rerender({ values: { 'step-yesno-uuid': true } });

    expect(result.current.getVisiblePageSteps('page-1').map((s) => s.id)).toEqual([
      'step-yesno-uuid',
      'step-date-uuid',
    ]);

    rerender({ values: { 'step-yesno-uuid': false } });

    expect(result.current.getVisiblePageSteps('page-1').map((s) => s.id)).toEqual(['step-yesno-uuid']);
  });
});
