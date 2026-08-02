// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ImportWorkflow from '../../../client/src/pages/ImportWorkflow';

const navigate = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/workflows/import', navigate],
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../../client/src/lib/vault-api', () => ({
  getAccessToken: () => 'test-token',
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useProjects: () => ({
    data: [{ id: 'p-1', title: 'Estate Planning' }],
  }),
}));

const CLEAN_PREVIEW = {
  canProceed: true,
  entityCounts: { workflows: 1, sections: 2, steps: 9 },
  collisions: [],
  requiresReentry: [],
  hasExecutableCode: false,
  warnings: [],
  errors: [],
};

const LOADED_PREVIEW = {
  canProceed: true,
  entityCounts: { workflows: 1, sections: 2, steps: 9, transform_blocks: 2, lifecycle_hooks: 1 },
  collisions: [
    { entity: 'workflows', name: 'Client Intake', type: 'workflow' },
    { entity: 'datavault_tables', name: 'states-ab12', type: 'table_slug' },
  ],
  requiresReentry: [
    { type: 'secret', entity: 'secrets', projectId: 'p1', key: 'STRIPE_API_KEY', environment: 'production', secretType: 'api_key' },
  ],
  hasExecutableCode: true,
  warnings: [
    {
      type: 'dangling_reference', entity: 'steps',
      column: 'config.dynamicOptions.tableId', missingId: 'abc-123',
      message: 'points at a datavault_tables record that is not in this bundle',
    },
  ],
  errors: [],
};

const BLOCKED_PREVIEW = {
  ...CLEAN_PREVIEW,
  canProceed: false,
  errors: [
    'Validation failed in workflow_templates: Unresolvable reference: workflow_templates.templateId -> xyz',
    'Bundle roots not found in bundle data',
  ],
};

function mockFetch(previewBody: unknown, applyBody: unknown = { rootId: 'new-wf', scope: 'workflow', entityCounts: { workflows: 1 }, blobsRestored: 0, warnings: [] }) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/preview')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(previewBody) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(applyBody) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bundleFile(name = 'client-intake.ezb'): File {
  return new File(['zip-bytes'], name, { type: 'application/zip' });
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>, file = bundleFile()) {
  const input = screen.getByLabelText('Bundle file');
  await user.upload(input, file);
}

beforeEach(() => {
  navigate.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ImportWorkflow', () => {
  it('AC 1: previews the chosen file without applying it', async () => {
    const fetchMock = mockFetch(LOADED_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);
    await screen.findByText('What will be created');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/portability/import/preview');
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/apply'))
    ).toBe(false);
  });

  it('AC 2: warns prominently when the bundle carries executable code, naming the kinds', async () => {
    mockFetch(LOADED_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);

    const callout = await screen.findByRole('region', {
      name: 'This bundle contains code that will run in your workspace',
    });
    expect(callout).toHaveTextContent('transform blocks');
    expect(callout).toHaveTextContent('lifecycle hooks');
    // document_hooks is absent from the fixture and must not be claimed.
    expect(callout).not.toHaveTextContent('document hooks');
  });

  it('AC 3: blocks the import and lists every error when canProceed is false', async () => {
    mockFetch(BLOCKED_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);

    await screen.findByRole('region', { name: 'This bundle cannot be imported' });
    for (const error of BLOCKED_PREVIEW.errors) {
      expect(screen.getByText(error)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Import this workflow/ })).toBeDisabled();
  });

  it('AC 4: renders collisions, unresolved references and re-entry items with their fields', async () => {
    mockFetch(LOADED_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);
    await screen.findByText('Names that already exist here');

    expect(screen.getByText('Client Intake')).toBeInTheDocument();
    expect(screen.getByText('Workflow name already in use')).toBeInTheDocument();
    expect(screen.getByText('states-ab12')).toBeInTheDocument();
    expect(screen.getByText('DataVault table slug already in use')).toBeInTheDocument();

    expect(screen.getByText(/steps\.config\.dynamicOptions\.tableId/)).toBeInTheDocument();

    expect(screen.getByText('STRIPE_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('secret · production')).toBeInTheDocument();
  });

  it('AC 4: says so plainly when there is nothing to flag', async () => {
    mockFetch(CLEAN_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);

    await screen.findByRole('region', { name: 'Nothing to flag' });
    expect(screen.queryByText('Names that already exist here')).toBeNull();
    expect(
      screen.queryByRole('region', { name: /code that will run/ })
    ).toBeNull();
  });

  it('AC 5: applies with only the allowlisted fields and keeps warnings visible afterwards', async () => {
    const applyBody = {
      rootId: 'imported-1', scope: 'workflow',
      entityCounts: { workflows: 1 }, blobsRestored: 0,
      warnings: [{
        type: 'dangling_reference', entity: 'steps',
        column: 'config.dynamicOptions.tableId', missingId: 'abc-123',
        message: 'unresolved',
      }],
    };
    const fetchMock = mockFetch(LOADED_PREVIEW, applyBody);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);
    await screen.findByText('What will be created');

    await user.type(screen.getByLabelText('Rename (optional)'), 'Client Intake (copy)');
    await user.click(screen.getByRole('button', { name: /Import this workflow/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const applyCall = fetchMock.mock.calls[1];
    expect(String(applyCall[0])).toContain('/api/portability/import/apply');

    const body = applyCall[1]?.body as FormData;
    expect(body.get('name')).toBe('Client Intake (copy)');
    expect(body.get('file')).toBeInstanceOf(File);
    // Nothing outside applyOptionsSchema may be sent — widening it is a
    // mass-assignment hole on the server.
    const sent = [...body.keys()].sort();
    expect(sent).toEqual(['file', 'name']);

    // The result screen still shows what could not be resolved.
    await screen.findByRole('region', { name: /could not be resolved/ });
    expect(screen.getByText(/steps\.config\.dynamicOptions\.tableId/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the imported workflow' })).toBeInTheDocument();
  });

  it('IEX3-9: surfaces the adjustments the server decided on your behalf', async () => {
    // "Your workflow has no project" is composed by the service, was dropped by
    // the route, and is the only notice the user ever gets that the import did
    // not land where they assumed.
    const applyBody = {
      rootId: 'imported-1', scope: 'workflow',
      entityCounts: { workflows: 1 }, blobsRestored: 0, warnings: [],
      adjustments: [
        'Imported workflow was left without a project: the bundle referenced project p-9, ' +
        'which is not yours in this tenant. Re-import with targetProjectId to place it.',
      ],
    };
    mockFetch(CLEAN_PREVIEW, applyBody);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);
    await screen.findByText('What will be created');
    await user.click(screen.getByRole('button', { name: /Import this workflow/ }));

    await screen.findByRole('region', { name: 'Where this landed had to be decided for you' });
    expect(screen.getByText(/left without a project/)).toBeInTheDocument();
  });

  it('IEX3-9: stays quiet when the server made no adjustments', async () => {
    mockFetch(CLEAN_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);
    await screen.findByText('What will be created');
    await user.click(screen.getByRole('button', { name: /Import this workflow/ }));

    await screen.findByText('Import complete');
    expect(screen.queryByText(/had to be decided for you/)).toBeNull();
  });

  it("AC 6: surfaces the server's own rejection message", async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 413,
        json: () => Promise.resolve({ message: 'Bundle exceeds the 250MB upload limit' }),
      } as Response)
    ));
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user, bundleFile('huge.ezb'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bundle exceeds the 250MB upload limit');
    expect(screen.queryByRole('button', { name: /Import this workflow/ })).toBeNull();
  });

  it('AC 7: moves focus to the error summary when the bundle cannot be applied', async () => {
    mockFetch(BLOCKED_PREVIEW);
    const user = userEvent.setup();
    render(<ImportWorkflow />);

    await chooseFile(user);
    await screen.findByRole('region', { name: 'This bundle cannot be imported' });

    await waitFor(() => {
      const region = screen.getByRole('region', { name: 'This bundle cannot be imported' });
      expect(region.parentElement).toHaveFocus();
    });
  });
});
