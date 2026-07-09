import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "wouter";

// eslint-disable-next-line @typescript-eslint/naming-convention -- React component
import FeedbackWidget from "@/components/FeedbackWidget";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { queryClient } from "./lib/queryClient";
import Router from "./Router";

function AppContent({ isBuilder }: { isBuilder: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        {/* Feedback widget - visible on all authenticated pages except builder */}
        {!isBuilder && <FeedbackWidget />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const [location] = useLocation();
  const isBuilder = location.includes('/builder');

  if (googleClientId === null || googleClientId === undefined || googleClientId === '') {
    console.warn('VITE_GOOGLE_CLIENT_ID environment variable is not set - running in development mode');
    return <AppContent isBuilder={isBuilder} />;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AppContent isBuilder={isBuilder} />
    </GoogleOAuthProvider>
  );
}

export default App;