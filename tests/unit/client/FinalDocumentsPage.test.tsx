// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinalDocumentsPage } from '../../../client/src/components/runner/pages/FinalDocumentsPage';

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

vi.mock('@/lib/vault-api', () => ({ downloadRunDocument: downloadMock }));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({
      data: {
        generationStatus: 'done',
        documents: [{
          id: 'doc-1',
          fileName: 'run-1_advance_directive.docx',
          fileUrl: '/api/runs/run-1/final-documents/run-1_advance_directive.docx/download',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 2122,
          createdAt: '2026-09-15T09:00:00Z',
        }],
      },
    })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FinalDocumentsPage runId="run-1" runToken="run-token-1" pageConfig={{}} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  downloadMock.mockReset();
});

describe('FinalDocumentsPage download', () => {
  // 2026-09-15: Download was a plain link, and the route needs a Bearer run
  // token that a link click cannot send -- anonymous respondents got a 401.
  it('downloads with the run token instead of following a plain link', async () => {
    downloadMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('run-1_advance_directive.docx');
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Download/ }));
    expect(downloadMock).toHaveBeenCalledWith('run-1', 'run-1_advance_directive.docx', 'run-token-1');
  });

  it('says so when the download fails', async () => {
    downloadMock.mockRejectedValue(new Error('Download failed (HTTP 401)'));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('run-1_advance_directive.docx');
    await user.click(screen.getByRole('button', { name: /Download/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Download failed');
  });
});
