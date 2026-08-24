// @vitest-environment jsdom
/**
 * RUN2-4 — zero visible pages must render a dedicated terminal screen
 * instead of QuestionRunnerScreen with a dead "Next" button.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../client/src/components/runner/pages/FinalDocumentsPage', () => ({
  FinalDocumentsPage: ({ pageConfig }: { pageConfig: { screenTitle?: string } }) => (
    <div>{pageConfig.screenTitle ?? 'Final documents'}</div>
  ),
}));

import {
  LoadedRunnerScreen,
  partitionRunnerPages,
  type LoadedRunnerScreenProps,
} from '../../../client/src/pages/WorkflowRunner';
import type { ApiPage } from '../../../client/src/lib/vault-api';
import { DEFAULT_RESOLVED_BRANDING } from '../../../shared/types/branding';

function buildProps(overrides: Partial<LoadedRunnerScreenProps> = {}): LoadedRunnerScreenProps {
  return {
    actualRunId: 'run-1',
    isProductionMode: true,
    workflow: undefined,
    branding: DEFAULT_RESOLVED_BRANDING,
    currentPage: undefined,
    currentPageIndex: 0,
    visiblePages: [],
    effectiveAllSteps: [],
    effectiveValues: {},
    effectiveLogicRules: [],
    visiblePageSteps: [],
    visibleReviewStepIds: [],
    runToken: null,
    saveStatus: 'idle',
    saveNow: vi.fn().mockResolvedValue(undefined),
    showReview: false,
    isCompleted: false,
    finalPageConfig: undefined,
    isLastPage: false,
    errors: [],
    fieldErrors: {},
    completeMutationIsPending: false,
    handleNext: vi.fn().mockResolvedValue(undefined),
    handlePrev: vi.fn().mockResolvedValue(undefined),
    handleFinalSubmit: vi.fn().mockResolvedValue(undefined),
    handleUpdateValue: vi.fn(),
    setCurrentPageIndex: vi.fn(),
    setShowReview: vi.fn(),
    reviewEditStepId: null,
    onEditReviewStep: vi.fn(),
    onNavigateToPage: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('LoadedRunnerScreen — zero visible pages (RUN2-4)', () => {
  it('removes final-document pages from pre-submit navigation', () => {
    const questionPage: ApiPage = {
      id: 'page-1',
      workflowId: 'workflow-1',
      title: 'Questions',
      description: null,
      order: 0,
      createdAt: '2026-07-25T00:00:00.000Z',
    };
    const finalPage: ApiPage = {
      ...questionPage,
      id: 'page-final',
      title: 'Final Documents',
      order: 1,
      config: { finalBlock: true, templates: ['template-1'] },
    };

    const result = partitionRunnerPages([questionPage, finalPage]);

    expect(result.respondentPages).toEqual([questionPage]);
    expect(result.finalPage).toEqual(finalPage);
  });

  it('renders a dedicated terminal screen, not the dead-end "No visible pages." question screen', () => {
    render(<LoadedRunnerScreen {...buildProps()} />);

    expect(screen.getByText('Nothing to complete')).toBeInTheDocument();
    expect(screen.queryByText('No visible pages.')).not.toBeInTheDocument();
    // The old dead-end screen rendered a "Next" button that did nothing.
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review/i })).not.toBeInTheDocument();
  });

  it('offers a working submit path when the run is completable', async () => {
    const user = userEvent.setup();
    const handleFinalSubmit = vi.fn().mockResolvedValue(undefined);

    render(<LoadedRunnerScreen {...buildProps({ actualRunId: 'run-1', handleFinalSubmit })} />);

    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);
    expect(handleFinalSubmit).toHaveBeenCalledTimes(1);
  });

  it('states plainly that there is nothing to complete when the run is not completable', () => {
    render(<LoadedRunnerScreen {...buildProps({ actualRunId: null })} />);

    expect(screen.getByText('There is nothing to complete for this response.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });

  it('still routes to the normal question screen when pages are visible', () => {
    const page: ApiPage = {
      id: 'page-1',
      workflowId: 'workflow-1',
      title: 'Page One',
      description: null,
      order: 0,
      createdAt: '2026-07-25T00:00:00.000Z',
    };

    render(
      <LoadedRunnerScreen
        {...buildProps({
          currentPage: page,
          visiblePages: [page],
          visiblePageSteps: [],
        })}
      />
    );

    expect(screen.getByText('Page One')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.queryByText('Nothing to complete')).not.toBeInTheDocument();
  });

  it('renders a terminal success state after submission and removes submit controls', () => {
    render(
      <LoadedRunnerScreen
        {...buildProps({
          isCompleted: true,
          workflow: {
            id: 'workflow-1',
            title: 'Client intake',
            description: null,
            projectId: null,
            settings: { completionMessage: 'Your response was received.' },
          },
        })}
      />
    );

    expect(screen.getByRole('heading', { name: 'Interview complete' })).toBeInTheDocument();
    expect(screen.getByText('Your response was received.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });

  it('uses final-document configuration only after the run is completed', () => {
    render(
      <LoadedRunnerScreen
        {...buildProps({
          isCompleted: true,
          finalPageConfig: {
            finalBlock: true,
            screenTitle: 'Download your documents',
            templates: ['template-1'],
          },
        })}
      />
    );

    expect(screen.getByText('Download your documents')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });
});
