import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLocation, useRoute } from 'wouter';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAcceptInvite } from '@/hooks/useOrganizations';

export default function AcceptInvite() {
  const [, params] = useRoute('/invites/:token/accept');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const acceptInvite = useAcceptInvite();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [orgInfo, setOrgInfo] = useState<{ orgId: string; orgName: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    const accept = async () => {
      const token = params?.token;

      if (!token) {
        setStatus('error');
        setErrorMessage('Invalid invitation link - missing token');
        return;
      }

      // Prevent duplicate accepts
      if (hasAttemptedRef.current) {
        return;
      }
      hasAttemptedRef.current = true;

      try {
        const result = await acceptInvite.mutateAsync(token);
        setOrgInfo(result);
        setStatus('success');
        toast({
          title: 'Success!',
          description: `You've joined ${result.orgName}`,
        });
      } catch (error: any) {
        setStatus('error');
        setErrorMessage(error.message || 'Failed to accept invitation');
        toast({
          title: 'Failed to accept invite',
          description: error.message || 'An error occurred',
          variant: 'destructive',
        });
      }
    };

    accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Organization Invitation</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Processing your invitation...'}
            {status === 'success' && 'Welcome to the team!'}
            {status === 'error' && 'Invitation Error'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {status === 'loading' && (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          )}

          {status === 'success' && orgInfo && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-center text-muted-foreground">
                You've successfully joined <strong>{orgInfo.orgName}</strong>
              </p>
              <Button asChild className="w-full">
                <a href={`/organizations/${orgInfo.orgId}`}>
                  Go to Organization
                </a>
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-center text-muted-foreground">{errorMessage}</p>
              <Button asChild variant="outline" className="w-full">
                <a href="/organizations">
                  View My Organizations
                </a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
