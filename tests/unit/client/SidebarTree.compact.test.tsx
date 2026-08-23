// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarTree } from '../../../client/src/components/builder/SidebarTree';
import { TooltipProvider } from '../../../client/src/components/ui/tooltip';

vi.mock('@/lib/vault-hooks', () => ({
  useWorkflow: () => ({ data: { id: 'workflow-1', modeOverride: 'easy', projectId: null } }),
  usePages: () => ({ data: [] }),
  useBlocks: () => ({ data: [] }),
  useCreatePageAtEnd: () => ({ createPageAtEnd: vi.fn(), isPending: false }),
  useCreateStep: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/components/builder/ai/AiAssistantDialog', () => ({ AiAssistantDialog: () => null }));
vi.mock('@/components/builder/AddSnipDialog', () => ({ AddSnipDialog: () => null }));
vi.mock('@/components/builder/BlockEditorDialog', () => ({ BlockEditorDialog: () => null }));
vi.mock('@/components/builder/PageSettingsDialog', () => ({ PageSettingsDialog: () => null }));
vi.mock('@/components/builder/sidebar/DocumentStatusPanel', () => ({ DocumentStatusPanel: () => null }));
vi.mock('@/components/builder/sidebar/PageItem', () => ({ PageItem: () => null }));

/**
 * The panel is a percent-sized ResizablePanel, so its width is driven by the
 * ResizeObserver rather than any media query. jsdom reports 0 for every box,
 * so the observed width is injected here.
 *
 * `live` exposes the most recent observer so a test can push a *later* width,
 * which is what distinguishes a working observer from one that reported once
 * on mount and then went dead.
 */
const live: { emit: ((width: number) => void) | null; disconnects: number } = {
  emit: null,
  disconnects: 0,
};

function mockObservedWidth(width: number): void {
  class MockResizeObserver {
    // A disconnected observer delivers nothing. Modelling that is the whole
    // point: a mock whose disconnect() only bookkeeps lets a permanently
    // disconnected observer keep "reporting" and the bug slip through.
    private disconnected = false;
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      const fire = (w: number) => {
        if (this.disconnected) { return; }
        this.callback(
          [{ contentRect: { width: w }, target } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      };
      live.emit = fire;
      fire(width);
    }
    unobserve(): void { /* no-op */ }
    disconnect(): void {
      this.disconnected = true;
      live.disconnects += 1;
    }
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  live.emit = null;
  live.disconnects = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTree() {
  return render(
    <StrictMode>
      <TooltipProvider>
        <SidebarTree workflowId="workflow-1" />
      </TooltipProvider>
    </StrictMode>,
  );
}

describe('SidebarTree compact layout', () => {
  it('keeps visible labels at a comfortable width', () => {
    mockObservedWidth(280);
    renderTree();

    expect(screen.getByRole('heading', { name: 'Document Outline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Page' })).toHaveTextContent('Add Page');
    expect(screen.getByRole('button', { name: 'Edit with AI' })).toHaveTextContent('Edit with AI');
    expect(screen.getByRole('button', { name: 'Add Snip' })).toHaveTextContent('Add Snip');
  });

  it('drops to icons once the panel is too narrow for the labels', () => {
    mockObservedWidth(120);
    renderTree();

    // The heading text is gone, but every action keeps an accessible name.
    expect(screen.queryByRole('heading', { name: 'Document Outline' })).toBeNull();
    for (const name of ['Add Page', 'Edit with AI', 'Add Snip']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('');
    }
  });

  it('keeps responding to width changes after mount', () => {
    // Regression: teardown used to live in an effect cleanup. StrictMode's
    // simulated unmount ran it while the ref callback did not re-fire, so the
    // observer was disconnected for good — the mount-time width still looked
    // right, and only resizing was broken.
    mockObservedWidth(280);
    renderTree();
    expect(screen.getByRole('button', { name: 'Add Page' })).toHaveTextContent('Add Page');

    act(() => { live.emit?.(120); });
    expect(screen.getByRole('button', { name: 'Add Page' })).toHaveTextContent('');

    act(() => { live.emit?.(280); });
    expect(screen.getByRole('button', { name: 'Add Page' })).toHaveTextContent('Add Page');
  });

  it('never renders an empty state that cannot wrap', () => {
    mockObservedWidth(120);
    renderTree();

    const cta = screen.getByRole('button', { name: /add one/i });
    expect(cta.className).toContain('whitespace-normal');
  });
});
