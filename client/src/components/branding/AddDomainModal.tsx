/**
 * Stage 17: Add Domain Modal
 *
 * Modal for adding subdomains or custom domains to a tenant
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface AddDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDomain: (domain: string) => Promise<void>;
  existingDomains: string[];
}

// Reserved subdomain names that cannot be used
const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'app',
  'admin',
  'staging',
  'dev',
  'test',
  'demo',
  'portal',
  'dashboard',
  'login',
  'auth',
  'docs',
  'blog',
  'support',
  'help',
  'mail',
  'email',
  'cdn',
  'assets',
  'static',
  'media',
  'files',
  'downloads',
  'storage',
  'backup',
  'vault',
  'vaultlogic',
];

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

  const validateSubdomain = (value: string): string | null => {
    if (!value) {
      return 'Subdomain is required';
    }

    // Check length
    if (value.length < 3) {
      return 'Subdomain must be at least 3 characters';
    }

    if (value.length > 63) {
      return 'Subdomain must be less than 63 characters';
    }

    // Check format: alphanumeric and hyphens only, no leading/trailing hyphens
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) {
      return 'Subdomain can only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphens)';
    }

    // Check for reserved names
    if (RESERVED_SUBDOMAINS.includes(value.toLowerCase())) {
      return 'This subdomain is reserved and cannot be used';
    }

    // Check if already exists
    const fullDomain = `${value}.vaultlogic.com`;
    if (existingDomains.includes(fullDomain)) {
      return 'This subdomain is already configured';
    }

    return null;
  };

  const validateCustomDomain = (value: string): string | null => {
    if (!value) {
      return 'Domain is required';
    }

    // Basic domain format validation
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(value)) {
      return 'Please enter a valid domain name (e.g., example.com)';
    }

    // Check if already exists
    if (existingDomains.includes(value.toLowerCase())) {
      return 'This domain is already configured';
    }

    // Prevent vaultlogic.com domains in custom
    if (value.toLowerCase().endsWith('.vaultlogic.com')) {
      return 'VaultLogic subdomains should be added using the Subdomain tab';
    }

    return null;
  };

  const handleSubmit = async () => {
    setError(null);

    let domainToAdd: string;
    let validationError: string | null;

    if (domainType === 'subdomain') {
      validationError = validateSubdomain(subdomain);
      domainToAdd = `${subdomain.toLowerCase()}.vaultlogic.com`;
    } else {
      validationError = validateCustomDomain(customDomain);
      domainToAdd = customDomain.toLowerCase();
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddDomain(domainToAdd);
      // Reset form on success
      setSubdomain('');
      setCustomDomain('');
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to add domain');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
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
      ? validateSubdomain(subdomain) === null
      : validateCustomDomain(customDomain) === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Domain</DialogTitle>
          <DialogDescription>
            Add a subdomain or custom domain for your tenant's intake portals
          </DialogDescription>
        </DialogHeader>

        <Tabs value={domainType} onValueChange={(v) => setDomainType(v as any)} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="subdomain">Subdomain</TabsTrigger>
            <TabsTrigger value="custom">Custom Domain</TabsTrigger>
          </TabsList>

          <TabsContent value="subdomain" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="subdomain">Subdomain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="subdomain"
                  placeholder="my-portal"
                  value={subdomain}
                  onChange={(e) => {
                    setSubdomain(e.target.value.toLowerCase());
                    setError(null);
                  }}
                  className="flex-1"
                  disabled={isSubmitting}
                />
                <span className="text-muted-foreground">.vaultlogic.com</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose a unique subdomain for your branded intake portal
              </p>
            </div>

            {subdomain && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">Preview URL:</p>
                <p className="text-sm text-muted-foreground font-mono break-all">
                  https://{subdomain}.vaultlogic.com
                </p>
              </div>
            )}

            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Subdomains are instantly active - no DNS configuration required!
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="customDomain">Custom Domain</Label>
              <Input
                id="customDomain"
                placeholder="portal.example.com"
                value={customDomain}
                onChange={(e) => {
                  setCustomDomain(e.target.value.toLowerCase());
                  setError(null);
                }}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Enter your custom domain (e.g., portal.example.com)
              </p>
            </div>

            {customDomain && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">Preview URL:</p>
                <p className="text-sm text-muted-foreground font-mono break-all">
                  https://{customDomain}
                </p>
              </div>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Custom domains require DNS configuration. After adding, configure a CNAME record
                pointing to <strong>vaultlogic.app</strong>
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!currentValue || isSubmitting || !isValid}>
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
