// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiPage, ApiSection } from '../../../client/src/lib/vault-api';
import { sectionPageVisibilityFixture } from '../../fixtures/sectionVisibilityMatrix';

const mocks = vi.hoisted(() => ({
  workflowId: '10000000-0000-4000-8000-000000000001',
  branding: {
    logoUrl: null,
    faviconUrl: null,
    organizationName: null,
    primaryColor: null,
    accentColor: null,
    whiteLabel: false,
  },
  sectionsQuery: {
    data: undefined as ApiSection[] | undefined,
    error: null as Error | null,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock('../../../client/src/hooks/api/useSections', () => ({
  useSections: () => mocks.sectionsQuery,
}));

vi.mock('../../../client/src/hooks/runner/useRunSession', () => ({
  useRunSession: () => ({
    actualRunId: 'preview-run',
    isInitializing: false,
    initError: null,
    mode: 'preview',
    previewState: null,
    run: undefined,
    runtime: undefined,
    workflowId: mocks.workflowId,
  }),
}));

vi.mock('../../../client/src/hooks/runner/useRunValues', () => ({
  useRunValues: () => ({
    effectiveValues: { 'show-section': false, 'show-page': true },
    handleUpdateValue: vi.fn(),
    saveStatus: 'idle',
    saveNow: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../client/src/hooks/runner/useRunNavigation', () => ({
  useRunNavigationTransport: () => ({}),
  useRunNavigation: ({ visiblePages }: { visiblePages: ApiPage[] }) => ({
    currentPageIndex: 0,
    setCurrentPageIndex: vi.fn(),
    currentPage: visiblePages[0],
    isLastPage: visiblePages.length === 1,
    showReview: false,
    isCompleted: false,
    setShowReview: vi.fn(),
    errors: [],
    fieldErrors: {},
    handleNext: vi.fn().mockResolvedValue(undefined),
    handlePrev: vi.fn().mockResolvedValue(undefined),
    handleFinalSubmit: vi.fn().mockResolvedValue(undefined),
    completeMutationIsPending: false,
  }),
}));

vi.mock('../../../client/src/hooks/useRunnerBranding', () => ({
  useResolvedRunnerBranding: () => mocks.branding,
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useWorkflow: () => ({
    data: {
      id: mocks.workflowId,
      title: 'Preview workflow',
      description: null,
      projectId: null,
      settings: {},
    },
  }),
}));

vi.mock('../../../client/src/lib/runTokens', () => ({
  getRunToken: () => null,
}));

import { WorkflowRunner } from '../../../client/src/pages/WorkflowRunner';

const previewEnvironment = {
  getPages: () => sectionPageVisibilityFixture.pages,
  getSteps: () => sectionPageVisibilityFixture.steps,
};

afterEach(() => {
  cleanup();
  mocks.sectionsQuery.data = undefined;
  mocks.sectionsQuery.error = null;
});

describe('WorkflowRunner preview Section loading', () => {
  it('keeps conditional member pages out of the rendered runner until Sections settle', () => {
    const { rerender } = render(<WorkflowRunner previewEnvironment={previewEnvironment as never} />);

    expect(screen.getByText('Starting session...')).toBeInTheDocument();
    expect(screen.queryByText('Conditional member')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing to complete')).not.toBeInTheDocument();

    mocks.sectionsQuery.data = sectionPageVisibilityFixture.sections;
    rerender(<WorkflowRunner previewEnvironment={previewEnvironment as never} />);

    expect(screen.queryByText('Starting session...')).not.toBeInTheDocument();
    expect(screen.queryByText('Conditional member')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing to complete')).toBeInTheDocument();
  });

  it('renders an explicit session error instead of treating a failed Sections query as no Sections', () => {
    mocks.sectionsQuery.error = new Error('Section request failed');

    render(<WorkflowRunner previewEnvironment={previewEnvironment as never} />);

    expect(screen.getByText('Session Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load workflow Sections: Section request failed')).toBeInTheDocument();
    expect(screen.queryByText('Conditional member')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing to complete')).not.toBeInTheDocument();
  });
});
