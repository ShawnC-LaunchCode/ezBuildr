// @vitest-environment jsdom
/**
 * SECT-9 (AC3, AC4, AC5) — the jump driven through the whole runner.
 *
 * Nothing between the rail and the autosave transport is mocked here: real
 * `useRunValues`, real `useAutoSave`, real `useRunNavigationTransport`, real
 * `useRunNavigation`, real blocks. Only the network boundary (`fetchAPI`, the
 * run mutations) and the run session are stubbed, so what this file proves is
 * the seam the ticket cares about rather than a hand-wired approximation. The
 * last block re-runs the same interaction against the preview branch, which
 * has its own transport and its own in-memory reached set.
 *
 * AC5's trap: the answer must survive a jump made **without blurring the
 * field**. The autosave debounce is 1.5s and this test never advances a timer,
 * so any value that reaches the server got there because `jumpToPage` flushed
 * it — a test that blurred first would prove nothing.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const WORKFLOW_ID = '20000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
  submitPage: vi.fn(),
  next: vi.fn(),
  currentPageId: 'p-assets' as string | null,
  visitedPageIds: ['p-contact', 'p-assets'] as string[],
  mode: 'production' as 'production' | 'preview',
  previewPageEntered: vi.fn(),
  previewSetCurrentPage: vi.fn(),
}));

function page(id: string, title: string, order: number, sectionId: string | null) {
  return {
    id,
    workflowId: WORKFLOW_ID,
    title,
    description: null,
    order,
    sectionId,
    visibleIf: null,
    config: {},
    createdAt: '2026-08-24T00:00:00.000Z',
  };
}

function step(id: string, pageId: string, title: string, alias: string) {
  return {
    id,
    workflowId: WORKFLOW_ID,
    pageId,
    type: 'short_text',
    title,
    description: null,
    required: false,
    order: 0,
    config: {},
    alias,
    visibleIf: null,
    isVirtual: false,
    createdAt: '2026-08-24T00:00:00.000Z',
  };
}

const PAGES = [
  page('p-contact', 'Contact details', 0, 'sec-intake'),
  page('p-assets', 'Asset schedule', 1, 'sec-intake'),
  page('p-notes', 'Closing notes', 2, null),
];

const STEPS = [
  step('s-name', 'p-contact', 'Full name', 'full_name'),
  step('s-asset', 'p-assets', 'Describe the asset', 'asset_note'),
  step('s-note', 'p-notes', 'Anything else', 'closing_note'),
];

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../client/src/lib/vault-api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../../client/src/lib/vault-api'
  );
  return { ...actual, fetchAPI: mocks.fetchAPI };
});

// Partial: only the run mutations are stubbed, so anything else the runner
// reaches for (e.g. PageSteps' own `useSteps`) keeps its real implementation
// over the stubbed query client rather than vanishing from the module.
vi.mock('../../../client/src/lib/vault-hooks', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../../client/src/lib/vault-hooks'
  );
  return {
    ...actual,
    useWorkflow: () => ({ data: undefined }),
    useSubmitPage: () => ({ mutateAsync: mocks.submitPage }),
    useNext: () => ({ mutateAsync: mocks.next }),
    useCompleteRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

// IndexedDB is not the subject here; the offline buffer is exercised elsewhere.
vi.mock('../../../client/src/lib/runner/offlineBuffer', () => ({
  bufferStepValues: vi.fn().mockResolvedValue(undefined),
  getBufferedStepValues: vi.fn().mockResolvedValue([]),
  removeBufferedStepValues: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../client/src/hooks/api/useSections', () => ({
  useSections: () => ({ data: [], error: null }),
}));

vi.mock('../../../client/src/lib/runTokens', () => ({
  getRunToken: () => null,
  clearRunToken: vi.fn(),
}));

vi.mock('../../../client/src/hooks/runner/useRunSession', () => ({
  useRunSession: () => (mocks.mode === 'preview' ? {
    actualRunId: 'preview-run',
    isInitializing: false,
    initError: null,
    mode: 'preview',
    previewState: { values: {} },
    run: undefined,
    runtime: undefined,
    workflowId: WORKFLOW_ID,
  } : {
    actualRunId: RUN_ID,
    isInitializing: false,
    initError: null,
    mode: 'production',
    previewState: null,
    run: {
      id: RUN_ID,
      workflowId: WORKFLOW_ID,
      workflowVersionId: 'version-1',
      currentPageId: mocks.currentPageId,
      visitedPageIds: mocks.visitedPageIds,
      completed: false,
      values: [{ stepId: 's-name', value: 'Dana Whitfield', updatedAt: '2026-08-24T00:00:00.000Z' }],
    },
    runtime: {
      contractVersion: 1,
      run: {
        id: RUN_ID,
        workflowId: WORKFLOW_ID,
        workflowVersionId: 'version-1',
        currentPageId: mocks.currentPageId,
        visitedPageIds: mocks.visitedPageIds,
        completed: false,
        generationStatus: null,
      },
      workflow: { id: WORKFLOW_ID, title: 'Dissolution petition', description: null, projectId: null, settings: {} },
      sections: [{ id: 'sec-intake', workflowId: WORKFLOW_ID, title: 'Intake', description: null, createdAt: '2026-08-24T00:00:00.000Z' }],
      pages: PAGES,
      steps: STEPS,
      logicRules: [],
      branding: null,
    },
    workflowId: WORKFLOW_ID,
  }),
}));

import { WorkflowRunner } from '../../../client/src/pages/WorkflowRunner';

function railButton(title: string): HTMLButtonElement {
  const nav = screen.getByRole('navigation', { name: 'Interview contents' });
  const match = Array.from(nav.querySelectorAll('button')).find(
    (button) => button.textContent?.startsWith(title)
  );
  if (!match) {
    throw new Error(`No rail control rendered for "${title}"`);
  }
  return match;
}

/**
 * Which page the content column is showing, asserted through the question it
 * renders rather than a heading string — the same page title also appears in
 * the rail, so a text match there would pass on the wrong column.
 */
function questionField(label: RegExp): HTMLElement | null {
  return screen.queryByLabelText(label);
}

const ASSET_FIELD = /Describe the asset/i;
const NAME_FIELD = /Full name/i;

function bulkSaveBodies(): string[] {
  return mocks.fetchAPI.mock.calls
    .filter(([url]) => typeof url === 'string' && url === `/api/runs/${RUN_ID}/values/bulk`)
    .map(([, init]) => String((init as { body?: unknown } | undefined)?.body ?? ''));
}

beforeEach(() => {
  mocks.fetchAPI.mockReset();
  mocks.fetchAPI.mockResolvedValue({ success: true });
  mocks.submitPage.mockReset();
  mocks.submitPage.mockResolvedValue({ success: true });
  mocks.next.mockReset();
  mocks.previewPageEntered.mockReset();
  mocks.previewSetCurrentPage.mockReset();
  mocks.mode = 'production';
  mocks.currentPageId = 'p-assets';
  mocks.visitedPageIds = ['p-contact', 'p-assets'];
  window.scrollTo = vi.fn();
  // jsdom has neither; the runner scrolls the jumped-to page and the edited
  // answer into view.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('jumping from the rail (AC5)', () => {
  it('persists an answer typed but never blurred before the view moves', async () => {
    render(<WorkflowRunner runId={RUN_ID} />);

    // The run resumed on its second page, which holds the field being typed.
    const field = questionField(ASSET_FIELD);
    expect(field).not.toBeNull();
    fireEvent.change(field as HTMLElement, { target: { value: '1957 Bel Air' } });

    // No blur, no timer advance: the 1.5s debounce cannot have fired.
    expect(bulkSaveBodies()).toEqual([]);

    fireEvent.click(railButton('Contact details'));

    await waitFor(() => {
      expect(questionField(NAME_FIELD)).not.toBeNull();
    });
    expect(questionField(ASSET_FIELD)).toBeNull();

    const bodies = bulkSaveBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('1957 Bel Air');
    expect(bodies[0]).toContain('s-asset');
    // A jump is not a submit: neither the page submit nor the run's own
    // forward step may fire, or the server would re-resolve `skip_to`.
    expect(mocks.submitPage).not.toHaveBeenCalled();
    expect(mocks.next).not.toHaveBeenCalled();
  });

  it('offers no rail control for a page the run has not reached', () => {
    render(<WorkflowRunner runId={RUN_ID} />);

    expect(railButton('Closing notes').disabled).toBe(true);
    expect(railButton('Contact details').disabled).toBe(false);
  });
});

describe('the Review screen edit jump on top of jumpToPage (AC3)', () => {
  it('opens the answer for editing and still returns to Review after Next', async () => {
    mocks.currentPageId = 'p-notes';
    mocks.visitedPageIds = ['p-contact', 'p-assets', 'p-notes'];
    render(<WorkflowRunner runId={RUN_ID} />);

    // Walk off the last page to reach Review the way a respondent does.
    fireEvent.click(screen.getByRole('button', { name: /Review/i }));
    await screen.findByText('Review your answers');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Full name' }));

    await waitFor(() => {
      expect(questionField(NAME_FIELD)).not.toBeNull();
    });
    expect(screen.queryByText('Review your answers')).toBeNull();
    // Still only the submit that carried the respondent to Review: the jump
    // itself submitted nothing.
    expect(mocks.submitPage).toHaveBeenCalledTimes(1);
    expect(mocks.next).not.toHaveBeenCalled();

    // `returnToReviewAfterNext`: the forward control now says Review, and
    // taking it lands back on Review rather than on the next page.
    fireEvent.click(screen.getByRole('button', { name: /Review/i }));

    await screen.findByText('Review your answers');
    expect(mocks.submitPage).toHaveBeenCalledTimes(2);
    expect(mocks.next).not.toHaveBeenCalled();
  });
});

describe('the same jump in preview (AC4)', () => {
  const previewEnvironment = {
    getPages: () => PAGES,
    getSteps: () => STEPS,
    getValues: () => ({}),
    setValue: vi.fn(),
    setCurrentPage: mocks.previewSetCurrentPage,
    addTraceEntry: vi.fn(),
    completeRun: vi.fn(),
  };

  function renderPreview() {
    mocks.mode = 'preview';
    return render(
      <WorkflowRunner
        previewEnvironment={previewEnvironment as never}
        previewVisitedPageIds={['p-contact', 'p-assets']}
        onPreviewPageEntered={mocks.previewPageEntered}
      />
    );
  }

  it('jumps on the preview transport, keeping its cursor and reached set in step', async () => {
    renderPreview();

    // A preview starts at the first page; the shell's in-memory set says the
    // second one has been reached, so it is offered and the third is not.
    expect(questionField(NAME_FIELD)).not.toBeNull();
    expect(railButton('Asset schedule').disabled).toBe(false);
    expect(railButton('Closing notes').disabled).toBe(true);

    fireEvent.click(railButton('Asset schedule'));

    await waitFor(() => {
      expect(questionField(ASSET_FIELD)).not.toBeNull();
    });
    // Only the preview transport does this. The dev toolbar's per-page tools
    // read that cursor, so a jump that left it stale would fill the page the
    // respondent just left.
    expect(mocks.previewSetCurrentPage).toHaveBeenCalledWith(1);
    expect(mocks.previewPageEntered).toHaveBeenCalledWith('p-assets');
    expect(mocks.fetchAPI).not.toHaveBeenCalled();
    expect(mocks.submitPage).not.toHaveBeenCalled();
    expect(mocks.next).not.toHaveBeenCalled();
  });

  it('refuses an unreached page in preview exactly as production does', () => {
    renderPreview();

    const unreached = railButton('Closing notes');
    expect(unreached.disabled).toBe(true);
    fireEvent.click(unreached);

    expect(questionField(NAME_FIELD)).not.toBeNull();
    expect(mocks.previewSetCurrentPage).not.toHaveBeenCalled();
  });
});
