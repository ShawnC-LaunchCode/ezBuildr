// @vitest-environment jsdom
/**
 * RUN2-13 (a): display-block {{alias}} interpolation.
 *
 * `DisplayBlockRenderer` interpolates against a context map keyed by step id
 * (`effectiveValues`), but authors write `{{alias}}` per
 * docs/guides/VARIABLES_IN_DOCUMENTS.md. These tests cover all three
 * acceptance criteria at the component level (DisplayBlockRenderer with an
 * explicit aliasMap) and at the wiring level (PageSteps building the
 * alias->stepId map from its own steps and threading it through
 * BlockRenderer).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DisplayBlockRenderer } from '../../../client/src/components/runner/blocks/DisplayBlock';
import { PageSteps } from '../../../client/src/components/runner/PageSteps';

import type { ApiStep } from '../../../client/src/lib/vault-api';
import type { Step } from '../../../client/src/types';

const createdAt = '2026-07-25T00:00:00.000Z';

function createDisplayStep(id: string, markdown: string): Step {
  return {
    id,
    workflowId: 'wf-1',
    pageId: 'page-1',
    type: 'display',
    title: 'Display',
    description: null,
    required: false,
    alias: null,
    order: 1,
    isVirtual: false,
    config: { markdown },
    createdAt,
  };
}

afterEach(() => {
  cleanup();
});

describe('DisplayBlockRenderer alias interpolation (RUN2-13 criteria 1-3)', () => {
  it('resolves {{alias}} against the alias->stepId map (criterion 1)', () => {
    const step = createDisplayStep('display-1', 'Hello {{clientName}}!');

    render(
      <DisplayBlockRenderer
        step={step}
        context={{ 'name-step-id': 'Ada' }}
        aliasMap={{ clientName: 'name-step-id' }}
      />
    );

    expect(screen.getByText('Hello Ada!')).toBeInTheDocument();
  });

  it('still resolves {{<stepId>}} directly when it is not a known alias (criterion 2, back-compat)', () => {
    const step = createDisplayStep('display-1', 'Hello {{name-step-id}}!');

    render(
      <DisplayBlockRenderer
        step={step}
        context={{ 'name-step-id': 'Ada' }}
        aliasMap={{ clientName: 'name-step-id' }}
      />
    );

    expect(screen.getByText('Hello Ada!')).toBeInTheDocument();
  });

  it('renders an unknown {{name}} as an empty string, not an error (criterion 3)', () => {
    const step = createDisplayStep('display-1', 'Hello {{unknownVar}}!');

    expect(() =>
      render(
        <DisplayBlockRenderer
          step={step}
          context={{ 'name-step-id': 'Ada' }}
          aliasMap={{ clientName: 'name-step-id' }}
        />
      )
    ).not.toThrow();

    expect(screen.getByText('Hello !')).toBeInTheDocument();
  });

  it('resolves an alias with no answered value yet as an empty string, not the raw placeholder', () => {
    const step = createDisplayStep('display-1', 'Hello {{clientName}}!');

    render(
      <DisplayBlockRenderer
        step={step}
        context={{}}
        aliasMap={{ clientName: 'name-step-id' }}
      />
    );

    expect(screen.getByText('Hello !')).toBeInTheDocument();
  });
});

describe('PageSteps wires the alias->stepId map into display blocks end-to-end (RUN2-13)', () => {
  function renderPage(
    steps: ApiStep[],
    values: Record<string, unknown>,
    allSteps?: ApiStep[]
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onChange = vi.fn();

    return render(
      <QueryClientProvider client={queryClient}>
        <main>
          <PageSteps
            pageId="page-1"
            steps={steps}
            allSteps={allSteps}
            values={values}
            logicRules={[]}
            onChange={onChange}
          />
        </main>
      </QueryClientProvider>
    );
  }

  it('resolves {{alias}} using the real run values keyed by step id (criterion 1, full pipeline)', () => {
    const nameStep: ApiStep = {
      id: 'name-step-id',
      workflowId: 'wf-1',
      pageId: 'page-1',
      type: 'short_text',
      title: 'Client name',
      description: null,
      required: false,
      alias: 'clientName',
      order: 1,
      isVirtual: false,
      config: null,
      createdAt,
    };
    const displayStep: ApiStep = {
      id: 'display-step-id',
      workflowId: 'wf-1',
      pageId: 'page-1',
      type: 'display',
      title: 'Display',
      description: null,
      required: false,
      alias: null,
      order: 2,
      isVirtual: false,
      config: { markdown: 'Welcome, {{clientName}}!' },
      createdAt,
    };

    renderPage([nameStep, displayStep], { 'name-step-id': 'Ada' });

    expect(screen.getByText('Welcome, Ada!')).toBeInTheDocument();
  });

  it('falls back to empty string for an unknown alias without throwing (criterion 3, full pipeline)', () => {
    const displayStep: ApiStep = {
      id: 'display-step-id',
      workflowId: 'wf-1',
      pageId: 'page-1',
      type: 'display',
      title: 'Display',
      description: null,
      required: false,
      alias: null,
      order: 1,
      isVirtual: false,
      config: { markdown: 'Welcome, {{doesNotExist}}!' },
      createdAt,
    };

    expect(() => renderPage([displayStep], {})).not.toThrow();
    expect(screen.getByText('Welcome, !')).toBeInTheDocument();
  });

  it('resolves an alias whose step lives in a different, earlier page when `allSteps` covers the whole workflow (regression: cross-page aliases)', () => {
    // The most common real usage of a display block: "Hello {{firstName}}"
    // where firstName was answered on an earlier page. `steps` here is only
    // page B's steps (as WorkflowRunner passes `visiblePageSteps`);
    // `allSteps` is the whole-workflow list (as WorkflowRunner passes
    // `effectiveAllSteps`), which is what must supply the alias.
    const nameStepInPageA: ApiStep = {
      id: 'name-step-id',
      workflowId: 'wf-1',
      pageId: 'page-A',
      type: 'short_text',
      title: 'First name',
      description: null,
      required: false,
      alias: 'firstName',
      order: 1,
      isVirtual: false,
      config: null,
      createdAt,
    };
    const displayStepInPageB: ApiStep = {
      id: 'display-step-id',
      workflowId: 'wf-1',
      pageId: 'page-1', // matches the pageId used by renderPage/PageSteps below
      type: 'display',
      title: 'Display',
      description: null,
      required: false,
      alias: null,
      order: 1,
      isVirtual: false,
      config: { markdown: 'Hello {{firstName}}!' },
      createdAt,
    };

    renderPage(
      [displayStepInPageB], // page B's own steps: only the display block
      { 'name-step-id': 'Ada' }, // run values, keyed by step id, cover the whole run
      [nameStepInPageA, displayStepInPageB] // allSteps: the whole workflow
    );

    expect(screen.getByText('Hello Ada!')).toBeInTheDocument();
  });

  it('falls back to page-local resolution (not a crash) for a cross-page alias when the caller has no `allSteps` to offer', () => {
    // Callers that don't have the whole-workflow step list on hand (e.g. the
    // legacy `useSteps(pageId)` fetch path) fall back to resolving only
    // against this page's own steps. A cross-page alias then renders
    // empty instead of resolving -- acceptable degradation, not a crash.
    const displayStepInPageB: ApiStep = {
      id: 'display-step-id',
      workflowId: 'wf-1',
      pageId: 'page-1',
      type: 'display',
      title: 'Display',
      description: null,
      required: false,
      alias: null,
      order: 1,
      isVirtual: false,
      config: { markdown: 'Hello {{firstName}}!' },
      createdAt,
    };

    expect(() =>
      renderPage([displayStepInPageB], { 'name-step-id': 'Ada' })
    ).not.toThrow();

    expect(screen.getByText('Hello !')).toBeInTheDocument();
  });
});
