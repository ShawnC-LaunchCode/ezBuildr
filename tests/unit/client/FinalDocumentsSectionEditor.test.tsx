// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { describe, beforeEach, expect, it, vi } from 'vitest';

import { FinalDocumentsSectionEditor } from '@/components/builder/final/FinalDocumentsSectionEditor';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ApiSection } from '@/lib/vault-api';

const updateSection = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('@/lib/vault-hooks', () => ({
  useUpdateSection: () => ({ mutate: updateSection, isPending: false }),
  useWorkflowMode: () => ({ data: { mode: 'easy' } }),
}));

vi.mock('@/components/logic', () => ({
  LogicBuilder: () => <div>Condition editor</div>,
}));

const section: ApiSection = {
  id: 'section-final',
  workflowId: 'workflow-1',
  title: 'Final Documents',
  description: null,
  order: 3,
  createdAt: '2026-08-08T00:00:00.000Z',
  config: {
    finalBlock: true,
    templates: [{ templateId: 'template-1', title: 'Client Contract' }],
    screenTitle: 'Your documents',
    markdownMessage: 'Download your files below.',
    outputFormats: ['docx'],
    showDocuments: true,
  },
};

function renderEditor(sectionOverride: ApiSection = section) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FinalDocumentsSectionEditor section={sectionOverride} workflowId="workflow-1" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('FinalDocumentsSectionEditor (GH-155)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url === '/api/workflows/workflow-1') {
        return { data: { projectId: 'project-1' } };
      }
      if (url === '/api/projects/project-1/templates') {
        return {
          data: {
            items: [{ id: 'template-1', name: 'Contract', description: 'Engagement agreement' }],
          },
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  it('edits the output title, exposes conditional rules, and has no placeholder warning', async () => {
    renderEditor();

    const title = await screen.findByRole('textbox', { name: 'Output title' });
    expect(title).toHaveValue('Client Contract');
    expect(screen.getByText('Always generated')).toBeInTheDocument();
    expect(screen.queryByText(/No advanced options available yet/i)).not.toBeInTheDocument();

    fireEvent.change(title, { target: { value: 'Signed Engagement Letter' } });
    fireEvent.blur(title);

    expect(updateSection).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'section-final',
      workflowId: 'workflow-1',
      config: expect.objectContaining({
        templates: [{ templateId: 'template-1', title: 'Signed Engagement Letter' }],
      }),
    }));
  });

  // An untitled document follows its template's name. Merely focusing and
  // leaving the field must not freeze today's template name into the config,
  // or a later template rename silently stops flowing through to the output.
  it('leaves an untitled document untitled when the field is only visited', async () => {
    renderEditor({
      ...section,
      config: { ...(section.config as Record<string, unknown>), templates: ['template-1'] },
    });

    const title = await screen.findByRole('textbox', { name: 'Output title' });
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Contract');

    fireEvent.focus(title);
    fireEvent.blur(title);

    expect(updateSection).not.toHaveBeenCalled();
  });

  it('persists DOCX + PDF and participant delivery options in one config', async () => {
    const user = userEvent.setup();
    renderEditor();

    const pdf = await screen.findByRole('checkbox', { name: /PDF/i });
    await user.click(pdf);
    await user.click(screen.getByRole('checkbox', { name: /Show secure download links/i }));

    const redirect = screen.getByRole('textbox', { name: 'Redirect after completion' });
    await user.type(redirect, 'https://example.com/next');
    fireEvent.blur(redirect);

    await waitFor(() => {
      expect(updateSection).toHaveBeenLastCalledWith(expect.objectContaining({
        config: expect.objectContaining({
          outputFormats: ['docx', 'pdf'],
          showDocuments: false,
          redirectUrl: 'https://example.com/next',
        }),
      }));
    });
  });
});
