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
import WorkflowsList from "@/pages/WorkflowsList";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminLogs from "@/pages/AdminLogs";
import TemplatesPage from "@/pages/TemplatesPage";
import SettingsPage from "@/pages/SettingsPage";
import FeedbackWidget from "@/components/FeedbackWidget";
import WorkflowDashboard from "@/pages/WorkflowDashboard";
import WorkflowBuilder from "@/pages/WorkflowBuilder";
import VisualWorkflowBuilder from "@/pages/VisualWorkflowBuilder";
import NewWorkflow from "@/pages/NewWorkflow";
import { WorkflowRunner } from "@/pages/WorkflowRunner";
import PreviewRunner from "@/pages/PreviewRunner";
import ProjectView from "@/pages/ProjectView";
import RunsDashboard from "@/pages/RunsDashboard"; // Stage 8
import RunDetails from "@/pages/RunDetails"; // Stage 8
import RunsCompare from "@/pages/RunsCompare"; // Stage 8
import BrandingSettingsPage from "@/pages/BrandingSettingsPage"; // Stage 17
import DomainSettingsPage from "@/pages/DomainSettingsPage"; // Stage 17
import IntakePreviewPage from "@/pages/IntakePreviewPage"; // Stage 17
import EmailTemplatesPage from "@/pages/EmailTemplatesPage"; // Stage 17
import EmailTemplateEditorPage from "@/pages/EmailTemplateEditorPage"; // Stage 17
import CollectionsPage from "@/pages/CollectionsPage"; // Stage 19
import CollectionDetailPage from "@/pages/CollectionDetailPage"; // Stage 19
import TemplateTestRunner from "@/pages/TemplateTestRunner"; // Template Test Runner PR1
import DataVaultDashboard from "@/pages/datavault"; // DataVault Phase 1
import DataVaultTablesPage from "@/pages/datavault/tables"; // DataVault Phase 1
import TableViewPage from "@/pages/datavault/[tableId]"; // DataVault Phase 1
import DataVaultDatabasesPage from "@/pages/datavault/databases"; // DataVault Phase 2
import DatabaseDetailPage from "@/pages/datavault/[databaseId]"; // DataVault Phase 2

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <>
      <Switch>
        {/* Workflow runner - available to everyone */}
        <Route path="/run/:id">
          {(params) => <WorkflowRunner runId={params.id} />}
        </Route>

        {/* Preview runner - available to everyone (uses bearer token) */}
        <Route path="/preview/:id" component={PreviewRunner} />

        {/* Intake preview - public branded intake portal preview */}
        <Route path="/intake/preview" component={IntakePreviewPage} />

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
            <Route path="/workflows" component={WorkflowsList} />
            <Route path="/workflows/new" component={NewWorkflow} />
            <Route path="/workflows/:id/builder" component={WorkflowBuilder} />
            <Route path="/workflows/:id/visual-builder" component={VisualWorkflowBuilder} />
            {/* Template Test Runner - PR1 */}
            <Route path="/workflows/:workflowId/builder/templates/test/:templateId">
              {(params) => <TemplateTestRunner />}
            </Route>

            {/* Project routes */}
            <Route path="/projects/:id" component={ProjectView} />

            {/* Stage 8: Document Runs routes */}
            <Route path="/runs" component={RunsDashboard} />
            <Route path="/runs/compare" component={RunsCompare} />
            <Route path="/runs/:id" component={RunDetails} />

            <Route path="/templates" component={TemplatesPage} />
            <Route path="/settings" component={SettingsPage} />
            {/* Stage 17: Branding Settings */}
            <Route path="/projects/:id/settings/branding" component={BrandingSettingsPage} />
            {/* Stage 19: Collections / Datastore */}
            <Route path="/data" component={CollectionsPage} />
            <Route path="/data/:id" component={CollectionDetailPage} />
            {/* DataVault Phase 1: Built-in Data Tables */}
            <Route path="/datavault" component={DataVaultDashboard} />
            <Route path="/datavault/tables" component={DataVaultTablesPage} />
            <Route path="/datavault/tables/:tableId" component={TableViewPage} />
            {/* DataVault Phase 2: Databases */}
            <Route path="/datavault/databases" component={DataVaultDatabasesPage} />
            <Route path="/datavault/databases/:databaseId" component={DatabaseDetailPage} />
            <Route path="/projects/:id/settings/branding/domains" component={DomainSettingsPage} />
            <Route path="/projects/:id/settings/email-templates" component={EmailTemplatesPage} />
            <Route path="/projects/:id/settings/email-templates/:templateId" component={EmailTemplateEditorPage} />
            {/* Admin routes */}
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/users" component={AdminUsers} />
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
