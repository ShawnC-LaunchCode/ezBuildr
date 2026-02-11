/**
 * Stage 17: Add Domain Modal
 *
 * Modal for adding subdomains or custom domains to a tenant
 */

import { Loader2, AlertCircle } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CustomDomainTab } from './CustomDomainTab';
import { SubdomainTab } from './SubdomainTab';

export interface AddDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDomain: (domain: string) => Promise<void>;
  existingDomains: string[];
}

// Reserved subdomain names that cannot be used
const RESERVED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'staging', 'dev', 'test', 'demo', 'portal',
  'dashboard', 'login', 'auth', 'docs', 'blog', 'support', 'help', 'mail',
  'email', 'cdn', 'assets', 'static', 'media', 'files', 'downloads',
  'storage', 'backup', 'vault', 'vaultlogic',
];

const validateSubdomain = (value: string, existingDomains: string[]): string | null => {
  if (!value) {
    return 'Subdomain is required';
  }

  if (value.length < 3) {
    return 'Subdomain must be at least 3 characters';
  }

  if (value.length > 63) {
    return 'Subdomain must be less than 63 characters';
  }

  // Check format: alphanumeric and hyphens only, no leading/trailing hyphens
  // eslint-disable-next-line security/detect-unsafe-regex
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    return 'Subdomain can only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphens)';
  }

  if (RESERVED_SUBDOMAINS.includes(value.toLowerCase())) {
    return 'This subdomain is reserved and cannot be used';
  }

  const fullDomain = `${value}.vaultlogic.com`;
  if (existingDomains.includes(fullDomain)) {
    return 'This subdomain is already configured';
  }

  return null;
};

const validateCustomDomain = (value: string, existingDomains: string[]): string | null => {
  if (!value) {
    return 'Domain is required';
  }

  // Basic domain format validation
  // eslint-disable-next-line security/detect-unsafe-regex
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  if (!domainRegex.test(value)) {
    return 'Please enter a valid domain name (e.g., example.com)';
  }

  if (existingDomains.includes(value.toLowerCase())) {
    return 'This domain is already configured';
  }

  if (value.toLowerCase().endsWith('.vaultlogic.com')) {
    return 'VaultLogic subdomains should be added using the Subdomain tab';
  }

  return null;
};

export default function AddDomainModal({
  open,
  onOpenChange,
  onAddDomain,
  existingDomains,
}: AddDomainModalProps) {
  const [domainType, setDomainType] = useState<'subdomain' | 'custom'>('subdomain');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    let domainToAdd: string;
    let validationError: string | null;

    if (domainType === 'subdomain') {
      validationError = validateSubdomain(subdomain, existingDomains);
      domainToAdd = `${subdomain.toLowerCase()}.vaultlogic.com`;
    } else {
      validationError = validateCustomDomain(customDomain, existingDomains);
      domainToAdd = customDomain.toLowerCase();
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddDomain(domainToAdd);
      setSubdomain('');
      setCustomDomain('');
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add domain';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSubdomain('');
      setCustomDomain('');
      setError(null);
      setIsSubmitting(false);
    }
    onOpenChange(newOpen);
  };

  const currentValue = domainType === 'subdomain' ? subdomain : customDomain;
  const isValid =
    domainType === 'subdomain'
      ? validateSubdomain(subdomain, existingDomains) === null
      : validateCustomDomain(customDomain, existingDomains) === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Domain</DialogTitle>
          <DialogDescription>
            Add a subdomain or custom domain for your tenant&apos;s intake portals
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={domainType}
          onValueChange={(v) => setDomainType(v as 'subdomain' | 'custom')}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="subdomain">Subdomain</TabsTrigger>
            <TabsTrigger value="custom">Custom Domain</TabsTrigger>
          </TabsList>

          <TabsContent value="subdomain">
            <SubdomainTab
              subdomain={subdomain}
              setSubdomain={setSubdomain}
              setError={setError}
              isSubmitting={isSubmitting}
            />
          </TabsContent>

          <TabsContent value="custom">
            <CustomDomainTab
              customDomain={customDomain}
              setCustomDomain={setCustomDomain}
              setError={setError}
              isSubmitting={isSubmitting}
            />
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => { void handleSubmit(); }}
            disabled={!currentValue || isSubmitting || !isValid}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Domain'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
