// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarTree } from '../../../client/src/components/builder/SidebarTree';
import { TooltipProvider } from '../../../client/src/components/ui/tooltip';

const createPageAtEnd = vi.fn();
const createStepAsync = vi.fn();

vi.mock('@/lib/vault-hooks', () => ({
  useWorkflow: () => ({ data: { id: 'workflow-1', modeOverride: 'easy', projectId: null } }),
  usePages: () => ({ data: [] }),
  useBlocks: () => ({ data: [] }),
  useCreatePageAtEnd: () => ({ createPageAtEnd, isPending: false }),
  useCreateStep: () => ({ mutateAsync: createStepAsync }),
}));

// Child surfaces are stubbed so this test isolates the outline's own wiring:
// the regression it guards is an action losing its only entry point.
vi.mock('@/components/builder/ai/AiAssistantDialog', () => ({
  AiAssistantDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="ai-dialog-open" /> : null,
}));

vi.mock('@/components/builder/AddSnipDialog', () => ({
  AddSnipDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="snip-dialog-open" /> : null,
}));

vi.mock('@/components/builder/BlockEditorDialog', () => ({
  BlockEditorDialog: () => null,
}));

vi.mock('@/components/builder/PageSettingsDialog', () => ({
  PageSettingsDialog: () => null,
}));

vi.mock('@/components/builder/sidebar/DocumentStatusPanel', () => ({
  DocumentStatusPanel: () => null,
}));

vi.mock('@/components/builder/sidebar/PageItem', () => ({
  PageItem: () => null,
}));

beforeEach(() => {
  createPageAtEnd.mockReset().mockResolvedValue({ id: 'page-1' });
  createStepAsync.mockReset().mockResolvedValue({ id: 'step-1' });
});

afterEach(() => {
  cleanup();
});

// The outline's compact (icon-only) layout puts its actions in tooltips, and
// App.tsx mounts the provider app-wide; isolated renders have to supply it.
function renderTree() {
  return render(
    <TooltipProvider>
      <SidebarTree workflowId="workflow-1" />
    </TooltipProvider>
  );
}

describe('SidebarTree authoring actions', () => {
  it('surfaces every authoring action in the header', async () => {
    const user = userEvent.setup();
    renderTree();

    expect(screen.getByRole('button', { name: /Edit with AI/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Snip/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add Page/i }));

    expect(screen.getByRole('menuitem', { name: /Regular Page/i })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Final Documents Page/i })
    ).toBeInTheDocument();
  });

  it('opens the AI assistant dialog', async () => {
    const user = userEvent.setup();
    renderTree();

    expect(screen.queryByTestId('ai-dialog-open')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Edit with AI/i }));

    expect(screen.getByTestId('ai-dialog-open')).toBeInTheDocument();
  });

  it('opens the add-snip dialog', async () => {
    const user = userEvent.setup();
    renderTree();

    expect(screen.queryByTestId('snip-dialog-open')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Add Snip/i }));

    expect(screen.getByTestId('snip-dialog-open')).toBeInTheDocument();
  });

  it('creates a plain page', async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(screen.getByRole('button', { name: /Add Page/i }));
    await user.click(screen.getByRole('menuitem', { name: /Regular Page/i }));

    expect(createPageAtEnd).toHaveBeenCalledWith();
    expect(createStepAsync).not.toHaveBeenCalled();
  });

  it('creates a final-documents page with its system step', async () => {
    const user = userEvent.setup();
    renderTree();

    await user.click(screen.getByRole('button', { name: /Add Page/i }));
    await user.click(screen.getByRole('menuitem', { name: /Final Documents Page/i }));

    expect(createPageAtEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Final Documents',
        config: expect.objectContaining({ finalBlock: true }),
      })
    );
    expect(createStepAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        type: 'final_documents',
        alias: 'final_documents',
      })
    );
  });
});
