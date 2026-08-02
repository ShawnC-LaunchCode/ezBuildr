// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportWorkflowDialog } from '../../../client/src/components/builder/ExportWorkflowDialog';
import { EXCLUSION_CATEGORIES } from '@shared/types/portabilityDisclosure';

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../../client/src/lib/vault-api', () => ({
  getAccessToken: () => 'test-token',
}));

const WORKFLOW_ID = '33333333-3333-4333-8333-333333333333';

const MANIFEST = {
  scope: 'workflow',
  entityCounts: { workflows: 1, sections: 3, steps: 12, templates: 1 },
  blobCount: 2,
  warnings: [
    {
      type: 'secret_scan',
      entity: 'transform_blocks',
      column: 'code',
      line: 7,
      message: 'Possible secret found in transform_blocks.code at line 7. Please review before sharing.',
    },
  ],
  requiresReentry: [
    { type: 'secret', entity: 'secrets', projectId: 'p1', key: 'STRIPE_API_KEY', environment: 'production', secretType: 'api_key' },
    { type: 'connection', entity: 'connections', projectId: 'p1', connectionId: 'c1', connectionName: 'Billing API' },
  ],
};

/** Resolves the manifest fetch; download fetch returns a blob. */
function mockFetch(manifest: unknown = MANIFEST) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/manifest')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) } as Response);
    }
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['zip-bytes'])),
    } as unknown as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <ExportWorkflowDialog
      open
      onOpenChange={onOpenChange}
      workflowId={WORKFLOW_ID}
      workflowTitle="Client Intake"
    />
  );
  return onOpenChange;
}

describe('ExportWorkflowDialog', () => {
  it('AC 4: renders entity counts from the live manifest', async () => {
    mockFetch();
    renderDialog();

    await screen.findByText('What the file contains');

    const included = screen.getByText('What the file contains').closest('section');
    expect(included).not.toBeNull();
    expect(within(included as HTMLElement).getByText('Questions')).toBeInTheDocument();
    expect(within(included as HTMLElement).getByText('12')).toBeInTheDocument();
    expect(within(included as HTMLElement).getByText('Pages')).toBeInTheDocument();
    expect(within(included as HTMLElement).getByText('3')).toBeInTheDocument();
    // Blobs are part of "what you are getting" and were previously invisible.
    expect(within(included as HTMLElement).getByText('Attached files')).toBeInTheDocument();
  });

  it('AC 4: names every secret and connection that must be re-entered', async () => {
    mockFetch();
    renderDialog();

    await screen.findByText('Must be re-entered after importing');
    expect(screen.getByText('STRIPE_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('secret · production')).toBeInTheDocument();
    expect(screen.getByText('Billing API')).toBeInTheDocument();
  });

  it('AC 4: reports secret-scan hits with entity and line', async () => {
    mockFetch();
    renderDialog();

    await screen.findByText('A possible credential was found in your code');
    expect(screen.getByText('transform_blocks.code — line 7')).toBeInTheDocument();
  });

  it('AC 4: states what stays behind up front and lists every category on expand', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('What stays behind');

    // Collapsed by default, but the promise itself is never hidden — a
    // disclosure the user has to go looking for is not a disclosure.
    const trigger = screen.getByRole('button', { name: /Responses, credentials, user accounts/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    for (const category of EXCLUSION_CATEGORIES) {
      expect(screen.getByText(category.title)).toBeInTheDocument();
      expect(screen.getByText(category.summary)).toBeInTheDocument();
    }

    // The disclosure is editorial: no snake_case table identifiers on screen.
    expect(screen.queryByText(/workflow_runs/)).toBeNull();
    expect(screen.queryByText(/mfa_secrets/)).toBeNull();
  });

  it('AC 5: issues no download request until the user confirms', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('What the file contains');

    // Only the manifest has been fetched at this point.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/manifest');

    await user.click(screen.getByRole('button', { name: /Download \.ezb/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const downloadUrl = String(fetchMock.mock.calls[1][0]);
    expect(downloadUrl).toBe(`/api/portability/export/workflow/${WORKFLOW_ID}`);
    expect(downloadUrl).not.toContain('/manifest');
  });

  it('AC 5: cancelling closes the dialog without downloading', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const onOpenChange = renderDialog();

    await screen.findByText('What the file contains');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AC 6: exposes the disclosure as a labelled dialog and keeps the download reachable by keyboard', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('What the file contains');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Download a copy of this workflow');
    expect(dialog).toHaveAccessibleDescription(/portable file|\.ezb file containing the design/i);

    // Every disclosure section is a labelled region, so a screen reader can
    // navigate between them rather than hearing one wall of text.
    expect(screen.getByRole('region', { name: 'What the file contains' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What stays behind' })).toBeInTheDocument();

    const download = screen.getByRole('button', { name: /Download \.ezb/ });
    download.focus();
    expect(download).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());
  });

  it('shows a loading state, then an error state if the manifest cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Access denied' }),
      } as Response)
    ));
    renderDialog();

    expect(screen.getByRole('status')).toHaveTextContent('Checking what this export contains');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Access denied');
    // Nothing to download when we could not establish what would be in it.
    expect(screen.getByRole('button', { name: /Download \.ezb/ })).toBeDisabled();
  });
});
