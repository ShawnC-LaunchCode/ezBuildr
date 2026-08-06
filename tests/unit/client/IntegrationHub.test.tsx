// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntegrationHub } from '../../../client/src/components/builder/integrations/IntegrationHub';
import { apiRequest } from '../../../client/src/lib/queryClient';

const toast = vi.fn();

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

const integrations = {
  integrations: [
    {
      provider: 'clio',
      name: 'Clio Manage',
      status: 'not_configured',
      capabilities: ['Create contacts', 'File documents to matters'],
    },
    {
      provider: 'stripe',
      name: 'Stripe Payments',
      status: 'configured',
      id: 'stripe-connection',
      webhookPath: '/api/integrations/stripe/webhook/stripe-connection',
      capabilities: ['Create PaymentIntents', 'Confirm payment webhooks'],
    },
    {
      provider: 'docusign',
      name: 'DocuSign',
      status: 'configured',
      capabilities: ['Send envelopes', 'Track signature lifecycle', 'Store signed PDFs'],
    },
  ],
};

function renderHub(onAuthorize = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IntegrationHub projectId="project-1" onAuthorize={onAuthorize} />
    </QueryClientProvider>,
  );
  return { onAuthorize };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('IntegrationHub', () => {
  it('shows the packaged legal capabilities and continues Clio OAuth after encrypted setup', async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(new Response(JSON.stringify(integrations), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        integration: integrations.integrations[0],
        authorizationUrl: 'https://app.clio.com/oauth/authorize?state=state-1',
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const { onAuthorize } = renderHub();

    expect(await screen.findByRole('heading', { name: 'Clio Manage' })).toBeInTheDocument();
    expect(screen.getByText('Create PaymentIntents')).toBeInTheDocument();
    expect(screen.getByText('Store signed PDFs')).toBeInTheDocument();
    expect(screen.getByText(/stripe-connection/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Configure Clio' }));
    const saveButton = screen.getByRole('button', { name: 'Save and authorize' });
    expect(saveButton).toBeDisabled();
    await user.type(screen.getByLabelText('Client ID'), 'clio-client-id');
    await user.type(screen.getByLabelText('Client secret'), 'clio-client-secret');
    await user.click(saveButton);

    await waitFor(() => expect(onAuthorize).toHaveBeenCalledWith(
      'https://app.clio.com/oauth/authorize?state=state-1',
    ));
    expect(apiRequest).toHaveBeenLastCalledWith(
      'POST',
      '/api/projects/project-1/integrations/clio',
      expect.objectContaining({
        clientId: 'clio-client-id',
        clientSecret: 'clio-client-secret',
        region: 'us',
      }),
    );
  });

  it('keeps setup open and shows an actionable provider error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(new Response(JSON.stringify(integrations), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockRejectedValueOnce(new Error('Clio is already configured for this project.'));
    renderHub();

    await user.click(await screen.findByRole('button', { name: 'Configure Clio' }));
    await user.type(screen.getByLabelText('Client ID'), 'clio-client-id');
    await user.type(screen.getByLabelText('Client secret'), 'clio-client-secret');
    await user.click(screen.getByRole('button', { name: 'Save and authorize' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already configured');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restarts OAuth without asking for saved Clio credentials again', async () => {
    const user = userEvent.setup();
    const authorizationNeeded = {
      integrations: integrations.integrations.map((integration) => integration.provider === 'clio'
        ? { ...integration, id: 'clio-connection', status: 'needs_authorization' }
        : integration),
    };
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(new Response(JSON.stringify(authorizationNeeded), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        integration: authorizationNeeded.integrations[0],
        authorizationUrl: 'https://app.clio.com/oauth/authorize?state=fresh-state',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { onAuthorize } = renderHub();

    await user.click(await screen.findByRole('button', { name: 'Continue Clio authorization' }));

    await waitFor(() => expect(onAuthorize).toHaveBeenCalledWith(
      'https://app.clio.com/oauth/authorize?state=fresh-state',
    ));
    expect(apiRequest).toHaveBeenLastCalledWith(
      'POST',
      '/api/projects/project-1/integrations/clio/clio-connection/authorize',
      {},
    );
  });
});
