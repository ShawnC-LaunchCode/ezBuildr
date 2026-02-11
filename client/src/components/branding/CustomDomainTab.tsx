
import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CustomDomainTabProps {
    customDomain: string;
    setCustomDomain: (value: string) => void;
    setError: (error: string | null) => void;
    isSubmitting: boolean;
}

export function CustomDomainTab({ customDomain, setCustomDomain, setError, isSubmitting }: CustomDomainTabProps) {
    return (
        <div className="space-y-4 mt-4">
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
        </div>
    );
}
