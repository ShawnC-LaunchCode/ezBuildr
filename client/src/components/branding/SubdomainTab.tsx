
import { CheckCircle2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SubdomainTabProps {
    subdomain: string;
    setSubdomain: (value: string) => void;
    setError: (error: string | null) => void;
    isSubmitting: boolean;
}

export function SubdomainTab({ subdomain, setSubdomain, setError, isSubmitting }: SubdomainTabProps) {
    return (
        <div className="space-y-4 mt-4">
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
        </div>
    );
}
