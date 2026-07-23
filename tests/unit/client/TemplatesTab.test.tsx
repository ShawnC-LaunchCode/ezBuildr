// @vitest-environment jsdom
/**
 * ICW2-B8 — TemplatesTab used to silently fall back to `projects[0]` (the
 * user's newest project) whenever a workflow was unfiled (`projectId ==
 * null`), reading and writing document templates into an unrelated project
 * with no UI signal. These tests pin the fix: an unfiled workflow shows an
 * explicit "file this workflow first" empty-state, disables upload, and
 * fires no template fetch/upload at all; a filed workflow is unaffected.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiWorkflow } from '../../../client/src/lib/vault-api';

const { useWorkflowMock, useWorkflowVariablesMock } = vi.hoisted(() => ({
  useWorkflowMock: vi.fn(),
  useWorkflowVariablesMock: vi.fn(),
}));

vi.mock('@/lib/vault-hooks', () => ({
  useWorkflow: useWorkflowMock,
  useWorkflowVariables: useWorkflowVariablesMock,
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Neither editor mounts in these tests (editingTemplate stays null), but both
// pull in heavy real dependencies (react-pdf/pdfjs-dist needs `DOMMatrix`,
// unavailable in jsdom) purely via their static import chain.
vi.mock('@/components/builder/templates/PdfMappingEditor', () => ({
  PdfMappingEditor: () => null,
}));
vi.mock('@/components/builder/templates/DocumentTemplateEditor', () => ({
  DocumentTemplateEditor: () => null,
}));

import axios from 'axios';

import { TemplatesTab } from '../../../client/src/components/builder/tabs/TemplatesTab';

const mockedAxios = vi.mocked(axios, true);

function makeWorkflow(overrides: Partial<ApiWorkflow>): ApiWorkflow {
  return {
    id: 'wf-1',
    title: 'Test workflow',
    description: null,
    creatorId: 'user-1',
    projectId: null,
    status: 'draft',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TemplatesTab — unfiled workflow (ICW2-B8)', () => {
  it('shows the guidance empty-state, disables upload, and fetches nothing', async () => {
    useWorkflowMock.mockReturnValue({ data: makeWorkflow({ projectId: null }) });
    useWorkflowVariablesMock.mockReturnValue({ data: [] });

    render(<TemplatesTab workflowId="wf-1" />);

    // Guidance renders in place of both the Word and PDF grids.
    const notices = await screen.findAllByText('No project context found.');
    expect(notices).toHaveLength(2);

    // No template list is fetched, and no request is ever fired against a
    // project the user did not explicitly choose (AC3).
    await waitFor(() => {
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    // Upload affordances are disabled rather than silently targeting a guess.
    expect(screen.getByRole('button', { name: /Upload Template/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create online' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});

describe('TemplatesTab — filed workflow (unchanged)', () => {
  it('fetches the workflow\'s own project and shows no guidance state', async () => {
    useWorkflowMock.mockReturnValue({ data: makeWorkflow({ projectId: 'proj-1' }) });
    useWorkflowVariablesMock.mockReturnValue({ data: [] });
    mockedAxios.get.mockResolvedValue({ data: { items: [] } });

    render(<TemplatesTab workflowId="wf-1" />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/projects/proj-1/templates');
    });

    expect(screen.queryByText('No project context found.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload Template/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create online' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });
});
