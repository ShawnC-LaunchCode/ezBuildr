
import { apiLimiter } from "../lib/rateLimit";

import { registerAccountRoutes } from "./account.routes";
import enterpriseAdminRouter from "./admin";
import { registerAdminAiSettingsRoutes } from "./admin.aiSettings.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerAiWorkflowEditRoutes } from "./ai/workflowEdit.routes";
import aiDocRouter from "./ai.doc.routes";
import { registerAiFeedbackRoutes } from "./ai.feedback.routes";
import { registerAiRoutes } from "./ai.routes";
import aiOptimizationRouter from "./api.ai.optimization.routes";
import aiPersonalizationRouter from "./api.ai.personalization.routes";
import aiTransformRouter from "./api.ai.transform.routes";
import { registerApiProjectRoutes } from "./api.projects.routes";
import { registerApiRunRoutes } from "./api.runs.routes";
import { registerApiTemplateRoutes } from "./api.templates.routes";
import { registerApiWorkflowRoutes } from "./api.workflows.routes";
import { registerAuthRoutes } from "./auth.routes";
import { registerBillingRoutes } from "./billing.routes";
import { registerBlockRoutes } from "./blocks.routes";
import { registerBlueprintRoutes } from "./blueprint.routes";
import { registerBrandingRoutes } from "./branding.routes";
import { registerCollectionsRoutes } from "./collections.routes";
import { registerConnectionsV2Routes } from "./connections-v2.routes";
import { registerDashboardRoutes } from "./dashboard.routes";
import { dataSourceRouter } from "./dataSource.routes";
import { registerDatavaultRoutes } from "./datavault.routes";
import { registerDatavaultApiTokenRoutes } from "./datavaultApiTokens.routes";
import { registerDebugRoutes } from "./debug.routes";
import { registerDocsRoutes } from "./docs.routes";
import documentHooksRoutes from "./documentHooks.routes";
import { registerDocumentRoutes } from "./documents.routes";
import { registerEmailTemplateRoutes } from "./emailTemplates.routes";
import { registerEsignRoutes } from "./esign.routes";
import externalRouter from "./external.routes";
import { registerFileRoutes } from "./files.routes";
import { registerFinalBlockRoutes } from "./finalBlock.routes";
import { registerIntakeRoutes } from "./intake.routes";
import lifecycleHooksRoutes from "./lifecycleHooks.routes";
import marketplaceRouter from "./marketplace";
import { registerMetricsRoutes } from "./metrics";
import oauthRouter from "./oauth.routes";
import { registerOrganizationRoutes } from "./organizations.routes";
import { placesRouter } from "./places.routes";
import portalRouter from "./portal.routes";
import { registerPreviewRoutes } from "./preview.routes";
import { registerProjectRoutes } from "./projects.routes";
import publicRouter from "./public.routes";
import { registerRunOutputsRoutes } from "./runOutputs.routes";
import { registerRunRoutes } from "./runs.routes";
import { registerSecretsRoutes } from "./secrets.routes";
import { registerSectionRoutes } from "./sections.routes";
import sharingRouter from "./sharing";
import { registerSnapshotRoutes } from "./snapshots.routes";
import { registerStepRoutes } from "./steps.routes";
import { registerTeamRoutes } from "./teams.routes";
import { registerTemplateAnalysisRoutes } from "./templateAnalysis.routes";
import { registerTenantRoutes } from "./tenant.routes";
import { registerTransformBlockRoutes } from "./transformBlocks.routes";
import { registerUserPreferencesRoutes } from "./userPreferences.routes";
import { validationRouter } from "./validation.routes";
import { registerVersionRoutes } from "./versions.routes";
import webhookRouter from "./webhooks.routes";
import { registerWorkflowAnalyticsRoutes } from "./workflowAnalytics.routes";
import { registerWorkflowExportRoutes } from "./workflowExports.routes";
import { registerWorkflowRoutes } from "./workflows.routes";
import { registerWorkflowTemplateRoutes } from "./workflowTemplates.routes";

import type { Express } from "express";

/**
 * Register all modular routes
 * This is the main aggregator that wires up all domain-specific route modules
 */
export function registerAllRoutes(app: Express): void {
  // API Documentation (Swagger UI)
  registerDocsRoutes(app);

  // Metrics endpoint (Prometheus)
  registerMetricsRoutes(app);

  // Public Access Routes (Platform Expansion)
  app.use("/public", publicRouter);

  // External API Routes (Platform Expansion)
  app.use("/api/external", apiLimiter, externalRouter);

  // OAuth 2.1 Provider
  app.use("/oauth", oauthRouter);

  // Data Sources
  app.use("/api/data-sources", dataSourceRouter);

  // Webhook Management
  app.use("/api/webhooks", webhookRouter);

  // AI Document Assist
  app.use("/api/ai/doc", aiDocRouter);

  // AI Personalization
  app.use("/api/ai/personalize", aiPersonalizationRouter);

  // AI Optimization
  app.use("/api/ai/workflows/optimize", aiOptimizationRouter);

  // AI Transforms
  app.use("/api/ai/transform", aiTransformRouter);

  // AI Workflow Editing (Stage 22)
  registerAiWorkflowEditRoutes(app);

  // Debug Routes (temporary)
  if (process.env.NODE_ENV === 'development') {
    registerDebugRoutes(app);
  }

  // Legacy Workflow Routes (MUST come before new API routes to avoid shadowing)
  registerWorkflowRoutes(app);
  registerSectionRoutes(app);
  registerStepRoutes(app);
  registerBlockRoutes(app);
  registerTransformBlockRoutes(app);

  // REST API Endpoints (New graph-based workflow system)
  registerApiProjectRoutes(app);
  registerApiWorkflowRoutes(app);
  registerApiTemplateRoutes(app);
  registerApiRunRoutes(app);

  // Authentication & Core
  registerAuthRoutes(app);
  registerTenantRoutes(app);
  registerAccountRoutes(app);
  registerUserPreferencesRoutes(app);
  registerTeamRoutes(app);
  registerOrganizationRoutes(app);

  // Validation
  app.use(validationRouter);

  // Features
  registerBrandingRoutes(app);
  registerEmailTemplateRoutes(app);
  registerDashboardRoutes(app);
  registerFileRoutes(app);
  registerAiRoutes(app);
  registerAiFeedbackRoutes(app);
  registerAdminRoutes(app);
  registerAdminAiSettingsRoutes(app);
  registerProjectRoutes(app);
  registerSnapshotRoutes(app);
  registerWorkflowTemplateRoutes(app);

  app.use("/api", lifecycleHooksRoutes);
  app.use("/api", documentHooksRoutes);

  registerSecretsRoutes(app);
  registerConnectionsV2Routes(app);
  registerRunRoutes(app);
  registerWorkflowExportRoutes(app);
  registerTemplateAnalysisRoutes(app);
  registerRunOutputsRoutes(app);
  registerDocumentRoutes(app);
  registerFinalBlockRoutes(app);
  registerEsignRoutes(app);
  registerWorkflowAnalyticsRoutes(app);
  registerIntakeRoutes(app);
  registerVersionRoutes(app);
  registerCollectionsRoutes(app);
  registerDatavaultRoutes(app);
  registerDatavaultApiTokenRoutes(app);
  app.use("/api", marketplaceRouter);

  // Google Places
  app.use("/api/places", placesRouter);

  // Enterprise Routes
  app.use("/api/sharing", sharingRouter);
  app.use("/api/enterprise/admin", enterpriseAdminRouter);
  registerBillingRoutes(app);
  registerPreviewRoutes(app);

  // Client Portal
  app.use("/api/portal", portalRouter);

  // Workflow Blueprints (FE-15)
  registerBlueprintRoutes(app);
}
