// @vitest-environment jsdom
/**
 * ICW2-B8 — TemplatesTab used to silently fall back to `projects[0]` (the
 * user's newest project) whenever a workflow was unfiled (`projectId ==
 * null`), reading and writing document templates into an unrelated project
 * with no UI signal. These tests pin the fix: an unfiled workflow shows an
 * explicit "file this workflow first" empty-state, disables upload, and
 * fires no template fetch/upload at all; a filed workflow is unaffected.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TemplateValidationReport } from '../../../client/src/hooks/api/useTemplateValidation';
import type { ApiWorkflow, ApiWorkflowVariable } from '../../../client/src/lib/vault-api';

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

function makeVariable(alias: string): ApiWorkflowVariable {
  return {
    key: `step-${alias}`,
    alias,
    label: alias.replaceAll('_', ' '),
    type: 'text',
    pageId: 'page-1',
    pageTitle: 'Details',
    stepId: `step-${alias}`,
  };
}

type ValidationReportFixture = TemplateValidationReport & { totalVariableCount: number };

function makeValidationReport(overrides: Partial<ValidationReportFixture> = {}): ValidationReportFixture {
  return {
    templateId: 'template-1',
    workflowId: 'wf-1',
    placeholders: [],
    matched: [],
    missing: [],
    loopScoped: [],
    unusedVariables: [],
    stepsWithoutAlias: [],
    syntaxErrors: [],
    unknownHelpers: [],
    totalVariableCount: 0,
    valid: true,
    ...overrides,
  };
}

function makeTemplateListResponse() {
  return {
    data: {
      items: [{
        id: 'template-1',
        name: 'Client agreement',
        type: 'docx',
        updatedAt: '2026-08-10T00:00:00.000Z',
      }],
    },
  };
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
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

describe('TemplatesTab — template variable health (TPL-6)', () => {
  it('summarises problems and drills into distinct error, warning, and informational classes', async () => {
    const user = userEvent.setup();
    useWorkflowMock.mockReturnValue({ data: makeWorkflow({ projectId: 'proj-1' }) });
    useWorkflowVariablesMock.mockReturnValue({
      data: [makeVariable('client_name'), makeVariable('signature_date')],
    });

    const report = makeValidationReport({
      totalVariableCount: 24,
      matched: ['client_name'],
      missing: [
        { placeholder: 'cleint_name', raw: '{{ cleint_name }}', suggestions: ['client_name'] },
        { placeholder: 'matter_number', raw: '{{ matter_number }}', suggestions: [] },
        { placeholder: 'filing_date', raw: '{{ filing_date }}', suggestions: ['signature_date'] },
      ],
      unknownHelpers: ['titelCase'],
      syntaxErrors: ['Unclosed variable tag near paragraph 4'],
      unusedVariables: [{ alias: 'signature_date', label: 'Signature date' }],
      loopScoped: ['children.name'],
      valid: false,
    });

    mockedAxios.get.mockImplementation((url) => {
      if (url === '/api/projects/proj-1/templates') {
        return Promise.resolve(makeTemplateListResponse());
      }
      if (url === '/api/templates/template-1/validate') {
        return Promise.resolve({ data: report });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderWithQueryClient(<TemplatesTab workflowId="wf-1" />);

    expect(await screen.findByText('24 variables')).toBeInTheDocument();
    expect(screen.getByText('3 unmapped')).toBeInTheDocument();
    expect(screen.getByText('2 errors')).toBeInTheDocument();
    expect(screen.getByText('1 unused')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review variable health details' }));

    const errors = screen.getByRole('alert', { name: '2 upload-blocking errors' });
    expect(errors).toHaveTextContent('Syntax error: Unclosed variable tag near paragraph 4');
    expect(errors).toHaveTextContent('Unknown filter: titelCase');
    expect(errors).toHaveTextContent('Fix the template file before uploading it again.');

    const warnings = screen.getByRole('status', { name: '3 unmapped variable warnings' });
    expect(warnings).toHaveTextContent('These do not block upload.');
    expect(warnings).toHaveTextContent('cleint_name');
    expect(warnings).toHaveTextContent('matter_number');
    expect(warnings).toHaveTextContent('filing_date');
    expect(warnings).toHaveTextContent('Did you mean client_name?');
    expect(warnings).toHaveTextContent('Did you mean signature_date?');

    expect(screen.getByRole('note', { name: '1 unused workflow variable' })).toHaveTextContent(
      'signature_date — Signature date',
    );
    expect(screen.getByRole('note', { name: 'Loop-scoped references are checked at generation time' }))
      .toHaveTextContent('not treated as errors');
  });

  it('shows a clean variable count without an error or drill-in affordance', async () => {
    useWorkflowMock.mockReturnValue({ data: makeWorkflow({ projectId: 'proj-1' }) });
    useWorkflowVariablesMock.mockReturnValue({ data: [makeVariable('client_name')] });
    const report = makeValidationReport({
      totalVariableCount: 4,
      matched: ['client_name', 'matter_number', 'filing_date', 'signature_date'],
    });

    mockedAxios.get.mockImplementation((url) => {
      if (url === '/api/projects/proj-1/templates') {
        return Promise.resolve(makeTemplateListResponse());
      }
      if (url === '/api/templates/template-1/validate') {
        return Promise.resolve({ data: report });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderWithQueryClient(<TemplatesTab workflowId="wf-1" />);

    expect(await screen.findByText('4 variables')).toBeInTheDocument();
    expect(screen.getByText('All mapped')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /variable health details/i })).not.toBeInTheDocument();
  });

  it('invalidates and refreshes validation when a workflow alias is renamed', async () => {
    let variables = [makeVariable('client_name')];
    let validationRequests = 0;
    useWorkflowMock.mockReturnValue({ data: makeWorkflow({ projectId: 'proj-1' }) });
    useWorkflowVariablesMock.mockImplementation(() => ({ data: variables }));

    mockedAxios.get.mockImplementation((url) => {
      if (url === '/api/projects/proj-1/templates') {
        return Promise.resolve(makeTemplateListResponse());
      }
      if (url === '/api/templates/template-1/validate') {
        validationRequests += 1;
        return Promise.resolve({
          data: validationRequests === 1
            ? makeValidationReport({ totalVariableCount: 1, matched: ['client_name'] })
            : makeValidationReport({
              totalVariableCount: 1,
              missing: [{
                placeholder: 'client_name',
                raw: '{{ client_name }}',
                suggestions: ['customer_name'],
              }],
              valid: false,
            }),
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const makeTab = () => (
      <QueryClientProvider client={queryClient}>
        <TemplatesTab workflowId="wf-1" />
      </QueryClientProvider>
    );
    const view = render(makeTab());

    expect(await screen.findByText('All mapped')).toBeInTheDocument();
    expect(validationRequests).toBe(1);

    variables = [makeVariable('customer_name')];
    view.rerender(makeTab());

    expect(await screen.findByText('1 unmapped')).toBeInTheDocument();
    expect(validationRequests).toBe(2);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Review variable health details' }));
    expect(screen.getByRole('status', { name: '1 unmapped variable warning' }))
      .toHaveTextContent('Did you mean customer_name?');
  });
});
