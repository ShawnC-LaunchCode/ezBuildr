// @vitest-environment jsdom
/**
 * SECT-8B — what the rail is allowed to show, driven through the runner's real
 * visibility engine rather than a hand-built page list.
 *
 * D-6 is the trap this file exists for: a page logic excluded from the run is
 * absent from the nav entirely, while a visible page the respondent has not
 * reached is present but greyed. The exclusion assertion is paired with the
 * same fixture rendering that page once the exclusion is lifted, so it cannot
 * pass against a fixture that never contained it.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTestWhen } from '../../helpers/conditionFixtures';

import type { ApiPage } from '../../../client/src/lib/vault-api';

const WORKFLOW_ID = '20000000-0000-4000-8000-000000000001';

const sections = [
  { id: 'sec-assets', workflowId: WORKFLOW_ID, title: 'Assets', description: null, createdAt: '2026-08-24T00:00:00.000Z' },
  { id: 'sec-children', workflowId: WORKFLOW_ID, title: 'Children', description: null, createdAt: '2026-08-24T00:00:00.000Z' },
];

function page(id: string, title: string, order: number, sectionId: string | null, visibleIf?: unknown): ApiPage {
  return {
    id,
    workflowId: WORKFLOW_ID,
    title,
    description: null,
    order,
    sectionId,
    visibleIf,
    config: {},
    createdAt: '2026-08-24T00:00:00.000Z',
  };
}

const pages: ApiPage[] = [
  page('p-real-property', 'Real Property', 0, 'sec-assets'),
  page('p-support', 'Spousal Support', 1, 'sec-assets', buildTestWhen('show-support', 'is_true')),
  page('p-interlude', 'Interlude', 2, null),
  page('p-school', 'School', 3, 'sec-children'),
];

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  currentPageIndex: 0,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock('../../../client/src/hooks/api/useSections', () => ({
  useSections: () => ({ data: sections, error: null }),
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
    workflowId: WORKFLOW_ID,
  }),
}));

vi.mock('../../../client/src/hooks/runner/useRunValues', () => ({
  useRunValues: () => ({
    effectiveValues: mocks.values,
    handleUpdateValue: vi.fn(),
    saveStatus: 'idle',
    saveNow: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../client/src/hooks/runner/useRunNavigation', () => ({
  useRunNavigationTransport: () => ({}),
  useRunNavigation: ({ visiblePages }: { visiblePages: ApiPage[] }) => ({
    currentPageIndex: mocks.currentPageIndex,
    setCurrentPageIndex: vi.fn(),
    currentPage: visiblePages[mocks.currentPageIndex],
    isLastPage: mocks.currentPageIndex === visiblePages.length - 1,
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
  useResolvedRunnerBranding: () => ({
    logoUrl: null,
    faviconUrl: null,
    organizationName: null,
    primaryColor: null,
    accentColor: null,
    whiteLabel: false,
  }),
  useBrandingStyle: () => ({}),
  useBrandedFavicon: () => undefined,
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useWorkflow: () => ({
    data: {
      id: WORKFLOW_ID,
      title: 'Dissolution petition',
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
  getPages: () => pages,
  getSteps: () => [],
  addTraceEntry: vi.fn(),
};

function railRowFor(title: string): HTMLElement {
  const nav = screen.getByRole('navigation', { name: 'Interview contents' });
  const label = Array.from(nav.querySelectorAll('li')).find((row) => row.textContent?.startsWith(title));
  if (!label) {
    throw new Error(`No rail row rendered for "${title}"`);
  }
  return label;
}

afterEach(() => {
  cleanup();
  mocks.values = {};
  mocks.currentPageIndex = 0;
});

describe('what the rail may advertise (AC4 / D-6)', () => {
  it('leaves a page excluded by visibleIf out of the rail entirely', () => {
    mocks.values = { 'show-support': false };

    render(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={['p-real-property']}
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Interview contents' });
    expect(nav.textContent).not.toContain('Spousal Support');
    expect(nav.textContent).toContain('Real Property');
  });

  it('renders that same page from the same fixture once the exclusion is lifted', () => {
    // Pairing this with the assertion above is the point: without it, "the
    // title is absent" would pass against a fixture that never had the page.
    mocks.values = { 'show-support': true };

    render(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={['p-real-property']}
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Interview contents' });
    expect(nav.textContent).toContain('Spousal Support');
  });

  it('greys visible-but-unreached pages instead of hiding them, and marks the current one', () => {
    mocks.values = { 'show-support': true };

    render(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={['p-real-property']}
      />
    );

    expect(railRowFor('Real Property').getAttribute('aria-current')).toBe('step');
    expect(railRowFor('Spousal Support').getAttribute('aria-disabled')).toBe('true');
    expect(railRowFor('Interlude').getAttribute('aria-disabled')).toBe('true');
    expect(railRowFor('School').getAttribute('aria-disabled')).toBe('true');
  });

  it('counts only visible pages in a Section indicator', () => {
    mocks.values = { 'show-support': false };

    render(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={['p-real-property']}
      />
    );

    // Assets holds two pages in the definition; logic removed one, so the
    // Section reads 1/1 rather than 1/2.
    expect(screen.getByText('1/1')).toBeTruthy();
  });
});

describe('reporting reached pages in preview (AC9)', () => {
  it('reports the page navigation resolved to, and never one it jumped over', () => {
    mocks.values = { 'show-support': true };
    const onPreviewPageEntered = vi.fn();

    const { rerender } = render(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={[]}
        onPreviewPageEntered={onPreviewPageEntered}
      />
    );

    expect(onPreviewPageEntered).toHaveBeenCalledWith('p-real-property');

    // Jump forward over "Spousal Support" the way a random-fill jump does.
    mocks.currentPageIndex = 2;
    rerender(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={['p-real-property']}
        onPreviewPageEntered={onPreviewPageEntered}
      />
    );

    expect(onPreviewPageEntered).toHaveBeenCalledWith('p-interlude');
    expect(onPreviewPageEntered).not.toHaveBeenCalledWith('p-support');
  });
});
