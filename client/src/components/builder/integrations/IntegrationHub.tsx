import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, FileSignature, Landmark, LockKeyhole, RefreshCw } from 'lucide-react';

import type {
  ClioSetupResponse,
  LegalIntegrationSummary,
  LegalIntegrationsResponse,
  StripeSetupResponse,
} from '@shared/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import { ClioSetupDialog, type ClioSetupValues } from './ClioSetupDialog';
import { IntegrationCard } from './IntegrationCard';
import { StripeSetupDialog, type StripeSetupValues } from './StripeSetupDialog';

interface IntegrationHubProps {
  projectId: string;
  onAuthorize?: (url: string) => void;
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

function integrationByProvider(
  integrations: LegalIntegrationSummary[],
  provider: LegalIntegrationSummary['provider'],
): LegalIntegrationSummary {
  const integration = integrations.find((candidate) => candidate.provider === provider);
  if (!integration) {
    throw new Error(`Missing ${provider} integration definition`);
  }
  return integration;
}

export function IntegrationHub({ projectId, onAuthorize }: IntegrationHubProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['/api/projects', projectId, 'integrations'];
  const integrationsQuery = useQuery({
    queryKey,
    queryFn: async () => readJson<LegalIntegrationsResponse>(
      await apiRequest('GET', `/api/projects/${projectId}/integrations`),
    ),
  });

  const continueClioAuthorization = (result: ClioSetupResponse) => {
    toast({ title: 'Clio credentials saved', description: 'Continue in Clio to authorize access.' });
    (onAuthorize ?? ((url: string) => window.location.assign(url)))(result.authorizationUrl);
  };

  const clioMutation = useMutation({
    mutationFn: async (values: ClioSetupValues) => readJson<ClioSetupResponse>(
      await apiRequest('POST', `/api/projects/${projectId}/integrations/clio`, values),
    ),
    onSuccess: continueClioAuthorization,
    meta: { suppressGlobalError: true },
  });

  const clioAuthorizationMutation = useMutation({
    mutationFn: async (connectionId: string) => readJson<ClioSetupResponse>(
      await apiRequest(
        'POST',
        `/api/projects/${projectId}/integrations/clio/${connectionId}/authorize`,
        {},
      ),
    ),
    onSuccess: continueClioAuthorization,
    meta: { suppressGlobalError: true },
  });

  const stripeMutation = useMutation({
    mutationFn: async (values: StripeSetupValues) => readJson<StripeSetupResponse>(
      await apiRequest('POST', `/api/projects/${projectId}/integrations/stripe`, values),
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Stripe connected', description: 'PaymentIntent and signed webhook endpoints are ready.' });
    },
    meta: { suppressGlobalError: true },
  });

  if (integrationsQuery.isLoading) {
    return <IntegrationHubSkeleton />;
  }
  if (integrationsQuery.isError || !integrationsQuery.data) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-medium">Integrations could not be loaded</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Check your project access and try again. Existing connections were not changed.
          </p>
          <Button variant="outline" onClick={() => { void integrationsQuery.refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const clio = integrationByProvider(integrationsQuery.data.integrations, 'clio');
  const stripe = integrationByProvider(integrationsQuery.data.integrations, 'stripe');
  const docusign = integrationByProvider(integrationsQuery.data.integrations, 'docusign');

  return (
    <div className="space-y-6">
      <SetupFlow />
      <div className="grid gap-4 lg:grid-cols-3">
        <IntegrationCard
          integration={clio}
          icon={<Landmark className="h-5 w-5" aria-hidden="true" />}
          description="Create client contacts and file generated documents directly to a Clio Manage matter."
          action={clio.status === 'needs_authorization' && clio.id ? (
            <Button
              className="w-full"
              disabled={clioAuthorizationMutation.isPending}
              onClick={() => { void clioAuthorizationMutation.mutateAsync(clio.id!).catch(() => undefined); }}
            >
              Continue Clio authorization
            </Button>
          ) : (
            <ClioSetupDialog
              disabled={clio.status === 'connected'}
              isPending={clioMutation.isPending}
              error={clioMutation.error instanceof Error ? clioMutation.error.message : undefined}
              onSubmit={async (values) => { await clioMutation.mutateAsync(values); }}
            />
          )}
          detail={clio.status === 'needs_authorization' ? (
            <p className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              {clioAuthorizationMutation.error instanceof Error
                ? clioAuthorizationMutation.error.message
                : 'Credentials are saved. Continue to generate a fresh Clio authorization link.'}
            </p>
          ) : undefined}
        />
        <IntegrationCard
          integration={stripe}
          icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
          description="Generate idempotent PaymentIntents and confirm payment state through signed webhooks."
          action={(
            <StripeSetupDialog
              disabled={stripe.status === 'configured'}
              isPending={stripeMutation.isPending}
              error={stripeMutation.error instanceof Error ? stripeMutation.error.message : undefined}
              onSubmit={async (values) => { await stripeMutation.mutateAsync(values); }}
            />
          )}
          detail={stripe.webhookPath ? (
            <div className="space-y-1 rounded-md border bg-muted/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Webhook endpoint</p>
              <code className="block break-all text-xs">{window.location.origin}{stripe.webhookPath}</code>
            </div>
          ) : undefined}
        />
        <IntegrationCard
          integration={docusign}
          icon={<FileSignature className="h-5 w-5" aria-hidden="true" />}
          description="Send mapped envelopes, track terminal events, and retain the signed PDF on the workflow run."
          action={(
            <Button variant="outline" className="w-full" asChild>
              <a href="https://developers.docusign.com/platform/auth/jwt/" target="_blank" rel="noreferrer">
                DocuSign setup reference
              </a>
            </Button>
          )}
          detail={docusign.status === 'unavailable' ? (
            <p className="rounded-md border p-3 text-xs leading-5 text-muted-foreground">
              Ask an administrator to configure the DocuSign JWT and Connect variables described in the setup guide.
            </p>
          ) : undefined}
        />
      </div>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
        <p>
          Provider credentials are encrypted with AES-256-GCM. Setup responses, connection lists, logs, and exports never include plaintext values.
        </p>
      </div>
    </div>
  );
}

function SetupFlow() {
  return (
    <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-3">
      {[
        ['01', 'Connect', 'Store provider credentials securely.'],
        ['02', 'Authorize', 'Complete OAuth or register the webhook.'],
        ['03', 'Deliver', 'Use packaged legal workflow actions.'],
      ].map(([number, title, description], index) => (
        <div key={number} className={`p-4 ${index > 0 ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{number}</p>
          <p className="mt-2 font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      ))}
    </div>
  );
}

function IntegrationHubSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading integrations">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-80 w-full" />)}
      </div>
    </div>
  );
}
