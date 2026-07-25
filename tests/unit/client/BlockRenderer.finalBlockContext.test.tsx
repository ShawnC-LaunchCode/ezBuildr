// @vitest-environment jsdom
/**
 * RUN2-13 (b): FinalBlockRenderer is invoked from BlockRenderer's
 * "final_documents" case without the run's context, so
 * `FinalBlockRendererProps.stepValues` always defaults to `{}` and every
 * conditional document is filtered against no data. BlockRenderer must
 * forward `props.context` to FinalBlockRenderer as `stepValues`, matching
 * the display-block case above it.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BlockRenderer } from '../../../client/src/components/runner/blocks/BlockRenderer';

import type { Step } from '../../../client/src/types';

const createdAt = '2026-07-25T00:00:00.000Z';

function createFinalStep(): Step {
  return {
    id: 'final-step-id',
    workflowId: 'wf-1',
    sectionId: 'sec-1',
    type: 'final_documents',
    title: 'Final documents',
    description: null,
    required: false,
    alias: null,
    order: 1,
    isVirtual: false,
    config: {
      markdownHeader: '',
      documents: [
        {
          id: 'doc-approved',
          documentId: 'tpl-approved',
          alias: 'contract',
          conditions: {
            operator: 'AND',
            conditions: [{ key: 'approved-step-id', op: 'equals', value: true }],
          },
        },
        {
          id: 'doc-declined',
          documentId: 'tpl-declined',
          alias: 'decline_letter',
          conditions: {
            operator: 'AND',
            conditions: [{ key: 'approved-step-id', op: 'equals', value: false }],
          },
        },
      ],
    },
    createdAt,
  };
}

afterEach(() => {
  cleanup();
});

describe('BlockRenderer -> FinalBlockRenderer context wiring (RUN2-13 criterion 4)', () => {
  it('shows/hides conditional documents based on the real run values, not an empty object', () => {
    render(
      <BlockRenderer
        step={createFinalStep()}
        value={undefined}
        onChange={() => { /* noop */ }}
        context={{ 'approved-step-id': true }}
      />
    );

    expect(screen.getByText('Contract')).toBeInTheDocument();
    expect(screen.queryByText('Decline Letter')).not.toBeInTheDocument();
  });

  it('flips which document is shown when the underlying answer flips', () => {
    render(
      <BlockRenderer
        step={createFinalStep()}
        value={undefined}
        onChange={() => { /* noop */ }}
        context={{ 'approved-step-id': false }}
      />
    );

    expect(screen.queryByText('Contract')).not.toBeInTheDocument();
    expect(screen.getByText('Decline Letter')).toBeInTheDocument();
  });

  it('shows no documents (not a crash) when the referenced step is unanswered', () => {
    expect(() =>
      render(
        <BlockRenderer
          step={createFinalStep()}
          value={undefined}
          onChange={() => { /* noop */ }}
          context={{}}
        />
      )
    ).not.toThrow();

    expect(screen.getByText(/no documents are available/i)).toBeInTheDocument();
  });
});
