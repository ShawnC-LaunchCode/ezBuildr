import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

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

export interface ClioSetupValues {
  name: string;
  clientId: string;
  clientSecret: string;
  region: 'us' | 'eu' | 'ca' | 'au';
}

interface ClioSetupDialogProps {
  disabled?: boolean;
  isPending: boolean;
  error?: string;
  onSubmit: (values: ClioSetupValues) => Promise<void>;
}

export function ClioSetupDialog({
  disabled,
  isPending,
  error,
  onSubmit,
}: ClioSetupDialogProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ClioSetupValues>({
    name: 'Clio Manage',
    clientId: '',
    clientSecret: '',
    region: 'us',
  });
  const canSubmit = values.clientId.trim().length > 0 && values.clientSecret.trim().length > 0;

  const submit = async () => {
    try {
      await onSubmit(values);
    } catch {
      // The mutation error is rendered inline so the user can correct setup.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" disabled={disabled}>
          {disabled ? 'Clio connected' : 'Configure Clio'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Clio Manage</DialogTitle>
          <DialogDescription>
            Enter the OAuth application credentials from Clio. You will authorize the account in Clio next.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="clio-name">Connection name</Label>
            <Input
              id="clio-name"
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clio-region">Data region</Label>
            <select
              id="clio-region"
              value={values.region}
              onChange={(event) => setValues((current) => ({
                ...current,
                region: event.target.value as ClioSetupValues['region'],
              }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="eu">European Union</option>
              <option value="au">Australia</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clio-client-id">Client ID</Label>
            <Input
              id="clio-client-id"
              autoComplete="off"
              value={values.clientId}
              onChange={(event) => setValues((current) => ({ ...current, clientId: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clio-client-secret">Client secret</Label>
            <Input
              id="clio-client-secret"
              type="password"
              autoComplete="new-password"
              value={values.clientSecret}
              onChange={(event) => setValues((current) => ({ ...current, clientSecret: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Credentials are encrypted before they are stored.</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={() => { void submit(); }} disabled={!canSubmit || isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Save and authorize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
