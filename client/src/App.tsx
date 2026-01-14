import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";

import FeedbackWidget from "@/components/FeedbackWidget";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ShortcutHelper } from "@/components/layout/ShortcutHelper";
import { FullScreenLoader } from "@/components/ui/loader";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";



import { queryClient } from "./lib/queryClient";

// Lazy load pages
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/marketing/LandingPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const WorkflowsList = lazy(() => import("@/pages/WorkflowsList"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminLogs = lazy(() => import("@/pages/AdminLogs"));
const AdminAiSettings = lazy(() => import("@/pages/AdminAiSettings"));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const WorkflowDashboard = lazy(() => import("@/pages/WorkflowDashboard"));
const WorkflowBuilder = lazy(() => import("@/pages/WorkflowBuilder"));
const VisualWorkflowBuilder = lazy(() => import("@/pages/VisualWorkflowBuilder"));
const NewWorkflow = lazy(() => import("@/pages/NewWorkflow"));
const WorkflowRunner = lazy(() => import("@/pages/WorkflowRunner").then(module => ({ default: module.WorkflowRunner })));
const WorkflowAnalytics = lazy(() => import("@/pages/WorkflowAnalytics").then(module => ({ default: module.WorkflowAnalytics })));
const OptimizationWizard = lazy(() => import("@/pages/optimization/OptimizationWizard"));
const WorkflowPreview = lazy(() => import("@/pages/WorkflowPreview"));
const ProjectView = lazy(() => import("@/pages/ProjectView"));
const RunsDashboard = lazy(() => import("@/pages/RunsDashboard")); // Stage 8
const RunDetails = lazy(() => import("@/pages/RunDetails")); // Stage 8
const RunsCompare = lazy(() => import("@/pages/RunsCompare")); // Stage 8
const BrandingSettingsPage = lazy(() => import("@/pages/BrandingSettingsPage")); // Stage 17
const DomainSettingsPage = lazy(() => import("@/pages/DomainSettingsPage")); // Stage 17
const IntakePreviewPage = lazy(() => import("@/pages/IntakePreviewPage")); // Stage 17
const EmailTemplatesPage = lazy(() => import("@/pages/EmailTemplatesPage")); // Stage 17
const EmailTemplateEditorPage = lazy(() => import("@/pages/EmailTemplateEditorPage")); // Stage 17
const CollectionsPage = lazy(() => import("@/pages/CollectionsPage")); // Stage 19
const CollectionDetailPage = lazy(() => import("@/pages/CollectionDetailPage")); // Stage 19
const TemplateTestRunner = lazy(() => import("@/pages/TemplateTestRunner")); // Template Test Runner PR1
const DataVaultDashboard = lazy(() => import("@/pages/datavault")); // DataVault Phase 1
const DataVaultTablesPage = lazy(() => import("@/pages/datavault/tables")); // DataVault Phase 1
const TableViewPage = lazy(() => import("@/pages/datavault/[tableId]")); // DataVault Phase 1
const DataVaultDatabasesPage = lazy(() => import("@/pages/datavault/databases")); // DataVault Phase 2
const DatabaseDetailPage = lazy(() => import("@/pages/datavault/[databaseId]")); // DataVault Phase 2
const DatabaseSettingsPage = lazy(() => import("@/pages/datavault/DatabaseSettingsPage")); // DataVault Phase 2: PR 13
const UrlParametersDoc = lazy(() => import("@/pages/docs/UrlParametersDoc")); // Documentation
const BillingDashboard = lazy(() => import("@/pages/billing/BillingDashboard"));
const PricingPage = lazy(() => import("@/pages/billing/PricingPage"));
const PublicRunner = lazy(() => import("@/pages/public/PublicRunner"));
const RunCompletionView = lazy(() => import("@/pages/RunCompletionView"));
const OAuthApps = lazy(() => import("@/pages/developer/OAuthApps"));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/VerifyEmailPage"));
const PortalLogin = lazy(() => import("@/pages/portal/PortalLogin"));
const PortalMagicLink = lazy(() => import("@/pages/portal/PortalMagicLink"));
const PortalDashboard = lazy(() => import("@/pages/portal/PortalDashboard"));
const Organizations = lazy(() => import("@/pages/Organizations"));
const OrganizationDetail = lazy(() => import("@/pages/OrganizationDetail"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Switch>
        {/* Public Workflow Runner */}
        <Route path="/w/:slug" component={PublicRunner} />

        {/* Public Shared Run View */}
        <Route path="/share/:token" component={RunCompletionView} />

        {/* Client Portal Routes - Independent Auth */}
        <Route path="/portal/login" component={PortalLogin} />
        <Route path="/portal/auth/verify" component={PortalMagicLink} />
        <Route path="/portal" component={PortalDashboard} />

        {/* Workflow runner - available to everyone */}
        <Route path="/run/:id">
          {(params) => <WorkflowRunner runId={params.id} />}
        </Route>


        {/* New preview mode (in-memory, no database) - authenticated only */}
        {isAuthenticated && (
          <Route path="/workflows/:workflowId/preview" component={WorkflowPreview} />
        )}

        {/* Intake preview - public branded intake portal preview */}
        <Route path="/intake/preview" component={IntakePreviewPage} />

        {/* Documentation - available to everyone */}
        <Route path="/docs/url-parameters" component={UrlParametersDoc} />

        {isLoading || !isAuthenticated ? (
          <>
            <Route path="/" component={Landing} />
            {/* Auth Routes - Public */}
            <Route path="/auth/login" component={LoginPage} />
            <Route path="/auth/register" component={RegisterPage} />
            <Route path="/auth/forgot-password" component={ForgotPasswordPage} />
            <Route path="/auth/reset-password" component={ResetPasswordPage} />
            <Route path="/auth/verify-email" component={VerifyEmailPage} />

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

            <Route path="/workflows/:id/analytics" component={WorkflowAnalytics} />
            <Route path="/workflows/:workflowId/optimize" component={OptimizationWizard} />
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

            <Route path="/marketplace" component={Marketplace} />
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
            <Route path="/datavault/databases/:databaseId/settings" component={DatabaseSettingsPage} />
            <Route path="/datavault/databases/:databaseId" component={DatabaseDetailPage} />
            <Route path="/projects/:id/settings/branding/domains" component={DomainSettingsPage} />
            <Route path="/projects/:id/settings/email-templates" component={EmailTemplatesPage} />
            <Route path="/projects/:id/settings/email-templates/:templateId" component={EmailTemplateEditorPage} />
            {/* Admin routes */}
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/logs" component={AdminLogs} />
            <Route path="/admin/ai-settings" component={AdminAiSettings} />

            {/* Billing Routes */}
            <Route path="/billing" component={BillingDashboard} />
            <Route path="/billing/plans" component={PricingPage} />

            {/* Organizations Routes */}
            <Route path="/organizations" component={Organizations} />
            <Route path="/organizations/:id" component={OrganizationDetail} />
            <Route path="/invites/:token/accept" component={AcceptInvite} />

            {/* Developer Settings */}
            <Route path="/developer/oauth" component={OAuthApps} />

            <Route component={NotFound} />
          </>
        )}
      </Switch>
    </Suspense>
  );
}

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [location] = useLocation();

  const isBuilder = location.includes('/builder') || location.includes('/visual-builder');

  if (!googleClientId) {
    console.warn('VITE_GOOGLE_CLIENT_ID environment variable is not set - running in development mode');
    // Allow app to run without Google OAuth in development mode
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

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
          {/* Feedback widget - visible on all authenticated pages except builder */}
          {!isBuilder && <FeedbackWidget />}
        </TooltipProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
