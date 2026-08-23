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
  entityCounts: { workflows: 1, pages: 3, steps: 12, templates: 1 },
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

  it('IEX3-10: reports what could not travel, not only secret-scan hits', async () => {
    // The engine composes these for a reader (IEX3-1) and the dialog used to
    // filter every non-secret_scan warning away, leaving the one screen that
    // claims to say what travels silent about what didn't.
    mockFetch({
      ...MANIFEST,
      warnings: [
        ...MANIFEST.warnings,
        {
          type: 'dangling_reference',
          entity: 'datavault_databases',
          column: 'id',
          missingId: '44444444-4444-4444-8444-444444444444',
          message:
            'DataVault database "Shared Clients" is used by this workflow but was not exported: ' +
            'it is account-scoped and you do not have edit access to it. Queries and data sources ' +
            'pointing at it have been omitted from the bundle.',
        },
        {
          type: 'missing_blob',
          entity: 'templates',
          column: 'fileRef',
          fileRef: 'templates/gone.docx',
          message: 'Blob not present in bundle: templates/gone.docx.',
        },
      ],
    });
    renderDialog();

    await screen.findByText('2 things could not travel with this copy');
    // The engine's own sentence, which is the actionable part — not
    // `datavault_databases.id → <uuid>`.
    expect(screen.getByText(/Shared Clients/)).toBeInTheDocument();
    expect(screen.getByText(/templates\/gone\.docx/)).toBeInTheDocument();
    // The secret-scan callout is unaffected.
    expect(screen.getByText('transform_blocks.code — line 7')).toBeInTheDocument();
  });

  it('IEX3-10: counts knock-on row drops instead of reciting them', async () => {
    // Printing every dropped row flat said "4 things" for what is one cause and
    // its consequences, in the table names this disclosure is not allowed to
    // use. The cause is reported against `column: "id"`; the consequences carry
    // the FK column that dangled.
    mockFetch({
      ...MANIFEST,
      warnings: [
        {
          type: 'dangling_reference', entity: 'datavault_databases', column: 'id',
          missingId: '44444444-4444-4444-8444-444444444444',
          message: 'DataVault database "Shared Clients" is used by this workflow but was not exported.',
        },
        {
          type: 'dangling_reference', entity: 'workflow_queries', column: 'dataSourceId',
          missingId: '44444444-4444-4444-8444-444444444444',
          message: 'A workflow_queries row was omitted from the bundle.',
        },
        {
          type: 'dangling_reference', entity: 'workflow_data_sources', column: 'dataSourceId',
          missingId: '44444444-4444-4444-8444-444444444444',
          message: 'A workflow_data_sources row was omitted from the bundle.',
        },
      ],
    });
    renderDialog();

    await screen.findByText('One thing could not travel with this copy');
    expect(screen.getByText(/along with 2 links that pointed at it/)).toBeInTheDocument();
    // The raw row-level messages, and their table names, stay out of the dialog.
    expect(screen.queryByText(/workflow_queries row was omitted/)).toBeNull();
    expect(screen.queryByText(/workflow_data_sources row was omitted/)).toBeNull();
  });

  it('IEX3-10: says nothing about omissions when there are none', async () => {
    mockFetch();
    renderDialog();

    await screen.findByText('What the file contains');
    expect(screen.queryByText(/could not travel with this copy/)).toBeNull();
  });

  it('AC 6: moves focus onto the summary once the manifest has loaded', async () => {
    // The ref was wired for this from the start and nothing ever called
    // focus(), so the first thing a screen reader reached was the close button.
    mockFetch();
    renderDialog();

    const summary = await screen.findByText('What the file contains');
    const focusTarget = summary.closest('[tabindex="-1"]');
    expect(focusTarget).not.toBeNull();
    await waitFor(() => expect(focusTarget).toHaveFocus());
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
