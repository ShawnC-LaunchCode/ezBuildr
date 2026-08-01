// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSectionVisibility } from '../../../client/src/hooks/runner/useSectionVisibility';
import type { ApiSection, ApiStep } from '../../../client/src/lib/vault-api';

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

describe('useSectionVisibility — ICW2-B10 (step-level visibleIf referencing another step by alias)', () => {
  it('reveals a step whose visibleIf references the controlling step by ALIAS, given an answer keyed by step id', () => {
    const sections = [createSection('sec-1', 1)];
    const yesNoStep: ApiStep = {
      id: 'step-yesno-uuid',
      workflowId: 'workflow-1',
      sectionId: 'sec-1',
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
      sectionId: 'sec-1',
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

    // Answers are keyed by step id (SectionSteps' `values[step.id]`, and the
    // production `effectiveValues` map from useRunValues) — never by alias.
    const { result, rerender } = renderHook(
      ({ values }) => useSectionVisibility(sections, steps, values, []),
      { initialProps: { values: {} as Record<string, unknown> } }
    );

    expect(result.current.getVisibleSectionSteps('sec-1').map((s) => s.id)).toEqual(['step-yesno-uuid']);

    rerender({ values: { 'step-yesno-uuid': true } });

    expect(result.current.getVisibleSectionSteps('sec-1').map((s) => s.id)).toEqual([
      'step-yesno-uuid',
      'step-date-uuid',
    ]);

    rerender({ values: { 'step-yesno-uuid': false } });

    expect(result.current.getVisibleSectionSteps('sec-1').map((s) => s.id)).toEqual(['step-yesno-uuid']);
  });
});
