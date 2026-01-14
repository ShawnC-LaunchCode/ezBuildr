import { GoogleLogin as GoogleOAuthLogin, googleLogout } from '@react-oauth/google';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface GoogleLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  'data-testid'?: string;
}

export function GoogleLogin({ onSuccess, onError, 'data-testid': testId }: GoogleLoginProps) {
  const { toast } = useToast();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      if (!credentialResponse.credential) {
        throw new Error('No credential received from Google');
      }

      // Send the Google ID token to the backend
      await apiRequest('POST', '/api/auth/google', {
        idToken: credentialResponse.credential,
      });

      // Invalidate the auth query to refetch user data
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

      toast({
        title: 'Welcome!',
        description: 'You have successfully signed in with Google.',
      });

      onSuccess?.();
    } catch (error) {
      console.error('Google login error:', error);

      // Extract error message from API error response
      let errorMessage = 'Login failed';

      if (error instanceof Error) {
        // Try to parse structured error from API response
        // Format: "401: {\"message\":\"...\",\"error\":\"...\"}"
        const jsonMatch = error.message.match(/\d+:\s*(.+)/);
        if (jsonMatch?.[1]) {
          try {
            const errorData = JSON.parse(jsonMatch[1]);
            errorMessage = errorData.message || errorMessage;
          } catch {
            // If JSON parsing fails, use the original error message
            errorMessage = error.message;
          }
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      onError?.(errorMessage);
    }
  };

  const handleLoginError = () => {
    const errorMessage = 'Google login was cancelled or failed';
    console.error('Google login error');

    toast({
      title: 'Login Failed',
      description: errorMessage,
      variant: 'destructive',
    });

    onError?.(errorMessage);
  };

  const handleLogout = async () => {
    try {
      // Use centralized logout from useAuth
      // This handles API call, state clearing, and redirect
      await logout();

      // Also ensure Google session is cleared
      googleLogout();

      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.',
      });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: 'Logout Error',
        description: 'There was an error signing out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center space-x-3">
        <span className="text-sm text-muted-foreground">
          {user.firstName} {user.lastName}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <GoogleOAuthLogin
      onSuccess={handleLoginSuccess}
      onError={handleLoginError}
      useOneTap={false}
      data-testid={testId || "button-google-login"}
    />
  );
}

export default GoogleLogin;