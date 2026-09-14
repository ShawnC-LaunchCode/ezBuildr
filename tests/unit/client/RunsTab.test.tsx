// @vitest-environment jsdom
/**
 * The Runs tab: a creator's way back to a finished run's documents
 * (2026-09-14 — before it, only the respondent ever saw them).
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiRun, ApiRunDocumentList } from '../../../client/src/lib/vault-api';

const { useRunsMock, useRunDocumentsMock, downloadMock } = vi.hoisted(() => ({
  useRunsMock: vi.fn(),
  useRunDocumentsMock: vi.fn(),
  downloadMock: vi.fn(),
}));

vi.mock('@/hooks/api/useRuns', () => ({
  useRuns: useRunsMock,
  useRunDocuments: useRunDocumentsMock,
}));
vi.mock('@/lib/vault-api', () => ({ downloadRunDocument: downloadMock }));

import { RunsTab, documentState } from '../../../client/src/components/builder/tabs/RunsTab';

function run(overrides: Partial<ApiRun>): ApiRun {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    workflowVersionId: null,
    currentPageId: null,
    visitedPageIds: [],
    participantId: null,
    completed: true,
    completedAt: '2026-09-14T12:43:57.000Z',
    metadata: null,
    createdAt: '2026-09-14T12:42:04.000Z',
    updatedAt: '2026-09-14T12:43:57.000Z',
    generationStatus: 'done',
    ...overrides,
  };
}

const docsResult = (list: ApiRunDocumentList) => ({ data: list, isLoading: false, error: null });

describe('RunsTab', () => {
  beforeEach(() => {
    useRunDocumentsMock.mockReturnValue(docsResult({ documents: [], generationStatus: 'done' }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('says so when the workflow has no runs', () => {
    useRunsMock.mockReturnValue({ data: [], isLoading: false, error: null });
    render(<RunsTab workflowId="wf-1" />);

    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it("shows each run's status and document state, including a failure's reason", () => {
    useRunsMock.mockReturnValue({
      data: [
        run({ id: 'done-run' }),
        run({ id: 'open-run', completed: false, completedAt: null, generationStatus: 'pending' }),
        run({ id: 'failed-run', generationStatus: 'failed:Documents could not be generated' }),
      ],
      isLoading: false,
      error: null,
    });
    render(<RunsTab workflowId="wf-1" />);

    // Each status badge renders twice — under the start time (phones) and in
    // the Status column (sm and up); CSS shows one. jsdom applies no CSS.
    expect(screen.getAllByText('Completed')).toHaveLength(4);
    expect(screen.getAllByText('In progress')).toHaveLength(2);
    expect(screen.getByText('Failed')).toHaveAttribute('title', 'Documents could not be generated');
    // An unfinished run has nothing to open.
    const buttons = screen.getAllByRole('button', { name: /Documents/ });
    expect(buttons[1]).toBeDisabled();
  });

  it("opens a finished run's documents and downloads one", async () => {
    useRunsMock.mockReturnValue({ data: [run({})], isLoading: false, error: null });
    useRunDocumentsMock.mockReturnValue(docsResult({
      documents: [{ id: 'd1', fileName: 'Estate Checklist.docx', fileUrl: '/x', fileSize: 20480, createdAt: '2026-09-14T12:44:00.000Z' }],
      generationStatus: 'done',
    }));
    downloadMock.mockResolvedValue(undefined);
    render(<RunsTab workflowId="wf-1" />);

    const toggle = screen.getByRole('button', { name: /Documents/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(useRunDocumentsMock).toHaveBeenCalledWith('run-1');
    expect(screen.getByText('Estate Checklist.docx')).toBeInTheDocument();
    expect(screen.getByText('20.0 KB')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download Estate Checklist.docx' }));
    expect(downloadMock).toHaveBeenCalledWith('run-1', 'Estate Checklist.docx');
  });

  it('explains a failed run that has no documents', async () => {
    useRunsMock.mockReturnValue({
      data: [run({ generationStatus: 'failed:Documents could not be generated' })],
      isLoading: false,
      error: null,
    });
    render(<RunsTab workflowId="wf-1" />);

    await userEvent.click(screen.getByRole('button', { name: /Documents/ }));
    expect(screen.getByText('No documents — Documents could not be generated.')).toBeInTheDocument();
  });
});

describe('documentState', () => {
  it('reads every generation status', () => {
    expect(documentState({ completed: true, generationStatus: 'done' }).label).toBe('Done');
    expect(documentState({ completed: true, generationStatus: 'generating' }).label).toBe('Generating…');
    expect(documentState({ completed: false, generationStatus: 'pending' }).label).toBe('—');
    expect(documentState({ completed: true, generationStatus: 'failed:x' })).toEqual({ label: 'Failed', tone: 'failed', reason: 'x' });
    expect(documentState({ completed: true, generationStatus: null }).label).toBe('—');
  });
});
