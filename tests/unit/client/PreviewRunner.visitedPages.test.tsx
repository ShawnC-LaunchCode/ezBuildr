// @vitest-environment jsdom
/**
 * SECT-8B (AC9) — preview's reached set.
 *
 * A preview has no run row, so the preview shell owns an ephemeral in-memory
 * set: insertion-ordered, append-only, deduplicated, reset with the preview,
 * and never marking a visible page that navigation jumped over.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WORKFLOW_ID = '30000000-0000-4000-8000-000000000001';

const workflow = {
  id: WORKFLOW_ID,
  title: 'Dissolution petition',
  pages: [
    { id: 'p-one', title: 'One', order: 0, sectionId: null, steps: [] },
    { id: 'p-two', title: 'Two', order: 1, sectionId: null, steps: [] },
    { id: 'p-three', title: 'Three', order: 2, sectionId: null, steps: [] },
  ],
};

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === 'preview-workflow' ? workflow : null,
    isLoading: false,
  }),
}));

vi.mock('../../../client/src/components/devtools/DevToolsPanel', () => ({
  DevToolsPanel: () => null,
}));

vi.mock('../../../client/src/components/preview/DevToolbar', () => ({
  DevToolbar: ({ onReset }: { onReset: () => void }) => (
    <button type="button" onClick={onReset}>reset preview</button>
  ),
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../../client/src/lib/previewRunner/HotReloadManager', () => ({
  hotReloadManager: { attach: vi.fn(), detach: vi.fn() },
}));

vi.mock('../../../client/src/lib/randomizer/aiRandomFill', () => ({
  generateAIRandomValues: vi.fn(),
  generateAIRandomValuesForSteps: vi.fn(),
}));

// Stands in for the runner: reports page entries the way the real runner's
// current-page effect does, and echoes back the set it was handed.
vi.mock('../../../client/src/pages/WorkflowRunner', () => ({
  WorkflowRunner: ({
    previewVisitedPageIds,
    onPreviewPageEntered,
  }: {
    previewVisitedPageIds?: string[];
    onPreviewPageEntered?: (pageId: string) => void;
  }) => (
    <div>
      <span data-testid="visited">{(previewVisitedPageIds ?? []).join(',')}</span>
      {workflow.pages.map((page) => (
        <button key={page.id} type="button" onClick={() => onPreviewPageEntered?.(page.id)}>
          enter {page.id}
        </button>
      ))}
    </div>
  ),
}));

import { PreviewRunner } from '../../../client/src/components/preview/PreviewRunner';

function visited(): string {
  return screen.getByTestId('visited').textContent ?? '';
}

function enter(pageId: string): void {
  fireEvent.click(screen.getByText(`enter ${pageId}`));
}

afterEach(cleanup);

describe('preview reached set (AC9)', () => {
  it('accumulates entered pages in order without marking a page navigation skipped', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<PreviewRunner workflowId={WORKFLOW_ID} onExit={vi.fn()} />);

    enter('p-one');
    expect(visited()).toBe('p-one');

    // Jump straight to the third page — the second stays unreached.
    enter('p-three');
    expect(visited()).toBe('p-one,p-three');
    expect(visited()).not.toContain('p-two');
  });

  it('never records the same page twice', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<PreviewRunner workflowId={WORKFLOW_ID} onExit={vi.fn()} />);

    enter('p-one');
    enter('p-two');
    enter('p-one');

    expect(visited()).toBe('p-one,p-two');
  });

  it('discards the reached set when the preview is reset', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<PreviewRunner workflowId={WORKFLOW_ID} onExit={vi.fn()} />);

    enter('p-one');
    enter('p-two');
    expect(visited()).toBe('p-one,p-two');

    fireEvent.click(screen.getByText('reset preview'));

    expect(visited()).toBe('');
  });
});
