import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface StripeSetupValues {
  name: string;
  secretKey: string;
  webhookSecret: string;
}

interface StripeSetupDialogProps {
  disabled?: boolean;
  isPending: boolean;
  error?: string;
  onSubmit: (values: StripeSetupValues) => Promise<void>;
}

export function StripeSetupDialog({
  disabled,
  isPending,
  error,
  onSubmit,
}: StripeSetupDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<StripeSetupValues>({
    name: 'Stripe Payments',
    secretKey: '',
    webhookSecret: '',
  });
  const canSubmit = /^(sk|rk)_(test|live)_/.test(values.secretKey)
    && values.webhookSecret.startsWith('whsec_');

  const submit = async () => {
    try {
      await onSubmit(values);
      setOpen(false);
    } catch {
      // The mutation error is rendered inline so the user can correct setup.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" disabled={disabled}>
          {disabled ? 'Stripe configured' : 'Configure Stripe'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Stripe Payments</DialogTitle>
          <DialogDescription>
            Add a restricted or secret API key and the signing secret for this project&apos;s webhook endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="stripe-name">Connection name</Label>
            <Input
              id="stripe-name"
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stripe-secret-key">Secret API key</Label>
            <Input
              id="stripe-secret-key"
              type="password"
              autoComplete="new-password"
              placeholder="rk_test_… or sk_test_…"
              value={values.secretKey}
              onChange={(event) => setValues((current) => ({ ...current, secretKey: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stripe-webhook-secret">Webhook signing secret</Label>
            <Input
              id="stripe-webhook-secret"
              type="password"
              autoComplete="new-password"
              placeholder="whsec_…"
              value={values.webhookSecret}
              onChange={(event) => setValues((current) => ({ ...current, webhookSecret: event.target.value }))}
            />
          </div>
          <div className="flex gap-2 rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Both values are stored with AES-256-GCM encryption and are never returned by the API.
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => { void submit(); }}
            disabled={!canSubmit || isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
