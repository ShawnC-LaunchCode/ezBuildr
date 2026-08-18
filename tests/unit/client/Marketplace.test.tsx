// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import Marketplace from '@/pages/Marketplace';

/**
 * TM-4: the client used to send a hardcoded `projectId: "default"` on every
 * install, which can never match a real project. These tests drive the
 * replacement — a project picker fed by `useProjects` — and pin down the
 * `Template` shape to exactly what the curated catalog (TM-2's
 * `CatalogTemplate`) actually returns.
 */

const navigate = vi.fn();
const toast = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/marketplace', navigate],
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

// Layout chrome is not under test here and pulls in useAuth's own network
// call (`/api/auth/refresh-token`) — stub it out so fetch mocking below stays
// scoped to the marketplace endpoints this page actually owns.
vi.mock('@/components/layout/Header', () => ({
  default: () => null,
}));
vi.mock('@/components/layout/Sidebar', () => ({
  default: () => null,
}));

let mockProjects: Array<{ id: string; title: string }> = [];
vi.mock('@/lib/vault-hooks', () => ({
  useProjects: () => ({ data: mockProjects }),
}));

const CURATED_TEMPLATES = [
  {
    id: 'nda',
    title: 'Mutual NDA',
    description: 'Collects the facts needed to render a mutual NDA.',
    category: 'legal',
    tags: ['confidentiality', 'legal'],
  },
  {
    id: 'retainer-agreement',
    title: 'Retainer Agreement',
    description: 'Collects the facts needed to render a retainer agreement.',
    category: 'legal',
    tags: ['legal'],
  },
];

function mockFetch(installResponse: unknown = { id: 'new-workflow-1' }, installOk = true) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/templates') && init?.method === undefined) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(CURATED_TEMPLATES),
      } as Response);
    }
    if (url.includes('/install')) {
      return Promise.resolve({
        ok: installOk,
        json: () => Promise.resolve(installResponse),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderMarketplace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <Marketplace />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeAll(() => {
  // jsdom has no pointer-capture / scrollIntoView implementation, which
  // Radix Select's pointer interactions depend on.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mockProjects = [];
});

describe('Marketplace', () => {
  it('AC4: renders only fields the curated catalog actually returns, with no invented usage/rating/official data', async () => {
    mockFetch();
    mockProjects = [{ id: 'p-1', title: 'Estate Planning' }];
    renderMarketplace();

    await screen.findByText('Mutual NDA');
    expect(screen.getByText('Retainer Agreement')).toBeInTheDocument();
    expect(screen.queryByText(/installs/)).toBeNull();
    expect(screen.queryByText('Official')).toBeNull();
    expect(screen.queryByRole('img', { name: /star/i })).toBeNull();
  });

  it('AC1: a single-project user gets that project pre-selected in the install dialog', async () => {
    mockFetch();
    mockProjects = [{ id: 'p-1', title: 'Estate Planning' }];
    const user = userEvent.setup();
    renderMarketplace();

    await screen.findByText('Mutual NDA');
    const card = screen.getByTestId('template-card-nda');
    await user.click(within(card).getByRole('button', { name: 'Use Template' }));

    const dialog = await screen.findByRole('dialog');
    // A default was chosen for the caller — Install works with no further
    // interaction, which is only possible if the sole project got pre-selected.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('AC1/AC5: a multi-project user chooses a project, then install succeeds and redirects to the builder', async () => {
    const fetchMock = mockFetch({ id: 'new-workflow-1' });
    mockProjects = [
      { id: 'p-1', title: 'Estate Planning' },
      { id: 'p-2', title: 'Corporate' },
    ];
    const user = userEvent.setup();
    renderMarketplace();

    await screen.findByText('Mutual NDA');
    const card = screen.getByTestId('template-card-nda');
    await user.click(within(card).getByRole('button', { name: 'Use Template' }));

    const dialog = await screen.findByRole('dialog');
    // Nothing pre-selected when there is a real choice to make.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();

    await user.click(within(dialog).getByRole('combobox', { name: /project/i }));
    await user.click(await screen.findByRole('option', { name: 'Corporate' }));
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/install'))).toBe(true);
    });
    const installCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/install'));
    expect(String(installCall?.[0])).toBe('/api/templates/nda/install');
    const body = JSON.parse((installCall?.[1] as RequestInit).body as string) as { projectId: string };
    // No hardcoded "default" — the id sent is the one the user picked.
    expect(body.projectId).toBe('p-2');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Template Installed' })
    ));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workflows/new-workflow-1/builder'), {
      timeout: 2000,
    });
  });

  it('AC3: with no projects, install is disabled and a clear message is shown instead of a failed request', async () => {
    const fetchMock = mockFetch();
    mockProjects = [];
    renderMarketplace();

    await screen.findByText('Mutual NDA');
    expect(screen.getByRole('alert')).toHaveTextContent(/don't have a project yet/i);

    const card = screen.getByTestId('template-card-nda');
    expect(within(card).getByRole('button', { name: 'Use Template' })).toBeDisabled();

    // No install request was ever attempted.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/install'))).toBe(false);
  });
});
