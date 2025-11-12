import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import SurveyBuilder from "@/pages/SurveyBuilder";
import SurveyPlayer from "@/pages/SurveyPlayer";
import SurveyPreview from "@/pages/SurveyPreview";
import SurveysList from "@/pages/SurveysList";
import WorkflowsList from "@/pages/WorkflowsList";
import Responses from "@/pages/Responses";
import ResponseDetails from "@/pages/ResponseDetails";
import SurveyAnalytics from "@/pages/SurveyAnalytics";
import SurveyResults from "@/pages/SurveyResults";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminUserSurveys from "@/pages/AdminUserSurveys";
import AdminSurveys from "@/pages/AdminSurveys";
import AdminLogs from "@/pages/AdminLogs";
import AISurveyCreator from "@/pages/AISurveyCreator";
import TemplatesPage from "@/pages/TemplatesPage";
import SettingsPage from "@/pages/SettingsPage";
import FeedbackWidget from "@/components/FeedbackWidget";
import WorkflowDashboard from "@/pages/WorkflowDashboard";
import WorkflowBuilder from "@/pages/WorkflowBuilder";
import VisualWorkflowBuilder from "@/pages/VisualWorkflowBuilder";
import NewWorkflow from "@/pages/NewWorkflow";
import { WorkflowRunner } from "@/pages/WorkflowRunner";
import PreviewRunner from "@/pages/PreviewRunner";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <>
      <Switch>
        {/* Survey response route - available to everyone (authenticated or not) */}
        <Route path="/survey/:identifier" component={SurveyPlayer} />

        {/* Workflow runner - available to everyone */}
        <Route path="/run/:id">
          {(params) => <WorkflowRunner runId={params.id} />}
        </Route>

        {/* Preview runner - available to everyone (uses bearer token) */}
        <Route path="/preview/:id" component={PreviewRunner} />

        {isLoading || !isAuthenticated ? (
          <>
            <Route path="/" component={Landing} />
            {/* Redirect all other routes to landing for unauthenticated users */}
            <Route component={Landing} />
          </>
        ) : (
          <>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />

            {/* Workflow routes */}
            <Route path="/workflows" component={WorkflowDashboard} />
            <Route path="/workflows/new" component={NewWorkflow} />
            <Route path="/workflows/:id/builder" component={WorkflowBuilder} />
            <Route path="/workflows/:id/visual-builder" component={VisualWorkflowBuilder} />

            <Route path="/surveys" component={WorkflowsList} />
            <Route path="/surveys/new" component={SurveyBuilder} />
            <Route path="/ai-survey" component={AISurveyCreator} />
            <Route path="/templates" component={TemplatesPage} />
            <Route path="/builder/:surveyId" component={SurveyBuilder} />
            <Route path="/builder/:surveyId/preview" component={SurveyPreview} />
            <Route path="/surveys/:id/preview" component={SurveyPreview} />
            <Route path="/surveys/:surveyId/results" component={SurveyResults} />
            <Route path="/surveys/:id/responses" component={Responses} />
            <Route path="/surveys/:surveyId/analytics" component={SurveyAnalytics} />
            <Route path="/responses/:id" component={ResponseDetails} />
            <Route path="/responses" component={Responses} />
            <Route path="/analytics" component={Dashboard} />
            <Route path="/settings" component={SettingsPage} />
            {/* Admin routes */}
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/users/:userId/surveys" component={AdminUserSurveys} />
            <Route path="/admin/surveys" component={AdminSurveys} />
            <Route path="/admin/logs" component={AdminLogs} />
            {/* 404 for authenticated users only */}
            <Route component={NotFound} />
          </>
        )}
      </Switch>
      {/* Feedback widget - visible on all authenticated pages */}
      {!isLoading && isAuthenticated && <FeedbackWidget />}
    </>
  );
}

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    console.warn('VITE_GOOGLE_CLIENT_ID environment variable is not set - running in development mode');
    // Allow app to run without Google OAuth in development mode
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
