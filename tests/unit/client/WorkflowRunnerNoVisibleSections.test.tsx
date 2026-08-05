// @vitest-environment jsdom
/**
 * RUN2-4 — zero visible sections must render a dedicated terminal screen
 * instead of QuestionRunnerScreen with a dead "Next" button.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../client/src/components/runner/sections/FinalDocumentsSection', () => ({
  FinalDocumentsSection: ({ sectionConfig }: { sectionConfig: { screenTitle?: string } }) => (
    <div>{sectionConfig.screenTitle ?? 'Final documents'}</div>
  ),
}));

import {
  LoadedRunnerScreen,
  partitionRunnerSections,
  type LoadedRunnerScreenProps,
} from '../../../client/src/pages/WorkflowRunner';
import type { ApiSection } from '../../../client/src/lib/vault-api';
import { DEFAULT_RESOLVED_BRANDING } from '../../../shared/types/branding';

function buildProps(overrides: Partial<LoadedRunnerScreenProps> = {}): LoadedRunnerScreenProps {
  return {
    actualRunId: 'run-1',
    workflow: undefined,
    branding: DEFAULT_RESOLVED_BRANDING,
    currentSection: undefined,
    currentSectionIndex: 0,
    visibleSections: [],
    effectiveAllSteps: [],
    effectiveValues: {},
    effectiveLogicRules: [],
    visibleSectionSteps: [],
    runToken: null,
    saveStatus: 'idle',
    saveNow: vi.fn().mockResolvedValue(undefined),
    showReview: false,
    isCompleted: false,
    finalSectionConfig: undefined,
    isLastSection: false,
    errors: [],
    fieldErrors: {},
    completeMutationIsPending: false,
    handleNext: vi.fn().mockResolvedValue(undefined),
    handlePrev: vi.fn().mockResolvedValue(undefined),
    handleFinalSubmit: vi.fn().mockResolvedValue(undefined),
    handleUpdateValue: vi.fn(),
    setCurrentSectionIndex: vi.fn(),
    setShowReview: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('LoadedRunnerScreen — zero visible sections (RUN2-4)', () => {
  it('removes final-document sections from pre-submit navigation', () => {
    const questionSection: ApiSection = {
      id: 'section-1',
      workflowId: 'workflow-1',
      title: 'Questions',
      description: null,
      order: 0,
      createdAt: '2026-07-25T00:00:00.000Z',
    };
    const finalSection: ApiSection = {
      ...questionSection,
      id: 'section-final',
      title: 'Final Documents',
      order: 1,
      config: { finalBlock: true, templates: ['template-1'] },
    };

    const result = partitionRunnerSections([questionSection, finalSection]);

    expect(result.respondentSections).toEqual([questionSection]);
    expect(result.finalSection).toEqual(finalSection);
  });

  it('renders a dedicated terminal screen, not the dead-end "No visible sections." question screen', () => {
    render(<LoadedRunnerScreen {...buildProps()} />);

    expect(screen.getByText('Nothing to complete')).toBeInTheDocument();
    expect(screen.queryByText('No visible sections.')).not.toBeInTheDocument();
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

  it('still routes to the normal question screen when sections are visible', () => {
    const section: ApiSection = {
      id: 'section-1',
      workflowId: 'workflow-1',
      title: 'Section One',
      description: null,
      order: 0,
      createdAt: '2026-07-25T00:00:00.000Z',
    };

    render(
      <LoadedRunnerScreen
        {...buildProps({
          currentSection: section,
          visibleSections: [section],
          visibleSectionSteps: [],
        })}
      />
    );

    expect(screen.getByText('Section One')).toBeInTheDocument();
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
          finalSectionConfig: {
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
