import type { ReactNode } from 'react';
import { Check, CircleDashed } from 'lucide-react';

import type { LegalIntegrationSummary, LegalIntegrationStatus } from '@shared/types';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<LegalIntegrationStatus, string> = {
  not_configured: 'Not configured',
  needs_authorization: 'Authorization needed',
  connected: 'Connected',
  configured: 'Configured',
  unavailable: 'Server setup needed',
};

interface IntegrationCardProps {
  integration: LegalIntegrationSummary;
  icon: ReactNode;
  description: string;
  action: ReactNode;
  detail?: ReactNode;
}

export function IntegrationCard({
  integration,
  icon,
  description,
  action,
  detail,
}: IntegrationCardProps) {
  const ready = integration.status === 'connected' || integration.status === 'configured';
  return (
    <Card className="flex h-full flex-col border-border/80 transition-colors hover:border-foreground/20">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/40 text-foreground">
            {icon}
          </div>
          <Badge
            variant="outline"
            className={cn(
              'font-mono text-[11px] uppercase tracking-wide',
              ready && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              integration.status === 'needs_authorization'
                && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
            )}
          >
            {STATUS_LABELS[integration.status]}
          </Badge>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{integration.name}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          {integration.capabilities.map((capability) => (
            <div key={capability} className="flex items-center gap-2 text-sm">
              {ready ? (
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span>{capability}</span>
            </div>
          ))}
        </div>
        {detail}
      </CardContent>
      <CardFooter>{action}</CardFooter>
    </Card>
  );
}
