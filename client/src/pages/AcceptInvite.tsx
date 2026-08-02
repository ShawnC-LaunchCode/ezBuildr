import { Loader2, CheckCircle, LogIn, XCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRoute } from 'wouter';

import { GoogleLogin } from '@/components/GoogleLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAcceptInvite } from '@/hooks/useOrganizations';
import { withReturnTo } from '@/lib/authRedirect';

export default function AcceptInvite() {
  const [, params] = useRoute('/invites/:token/accept');
  const { toast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const acceptInvite = useAcceptInvite();
  const returnTo = params?.token ? `/invites/${params.token}/accept` : '/organizations';
  const loginUrl = withReturnTo('/auth/login', returnTo);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [orgInfo, setOrgInfo] = useState<{ orgId: string; orgName: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    const accept = async () => {
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

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
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus('error');
        setErrorMessage(message || 'Failed to accept invitation');
        toast({
          title: 'Failed to accept invite',
          description: message || 'An error occurred',
          variant: 'destructive',
        });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    accept();

  }, [isAuthLoading, isAuthenticated, params?.token]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" aria-label="Loading invitation" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Organization Invitation</CardTitle>
            <CardDescription>Sign in to accept your invitation</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            <LogIn className="h-12 w-12 text-primary" />
            <p className="text-center text-muted-foreground">
              Use the account that received this invitation. If you are new to ezBuildr,
              sign in with Google or use the Complete Setup email in your inbox.
            </p>
            <div className="flex justify-center w-full">
              <GoogleLogin onSuccess={() => undefined} />
            </div>
            <Button asChild variant="outline" className="w-full">
              <a href={loginUrl}>Sign in with email</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                You&apos;ve successfully joined <strong>{orgInfo.orgName}</strong>
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
