
import type { Express } from "express";
import { registerAuthRoutes } from "./auth.routes";
import { registerAccountRoutes } from "./account.routes";
import { registerUserPreferencesRoutes } from "./userPreferences.routes";
import { registerFileRoutes } from "./files.routes";
import { registerDashboardRoutes } from "./dashboard.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerAiRoutes } from "./ai.routes";
import { registerProjectRoutes } from "./projects.routes";
import { registerWorkflowRoutes } from "./workflows.routes";
import { registerSectionRoutes } from "./sections.routes";
import { registerStepRoutes } from "./steps.routes";
import { registerBlockRoutes } from "./blocks.routes";
import { registerRunRoutes } from "./runs.routes";
import { registerSnapshotRoutes } from "./snapshots.routes";
import { registerWorkflowExportRoutes } from "./workflowExports.routes";
import { registerTransformBlockRoutes } from "./transformBlocks.routes";
import lifecycleHooksRoutes from "./lifecycleHooks.routes";
import documentHooksRoutes from "./documentHooks.routes";
import { registerTeamRoutes } from "./teams.routes";
import { registerTenantRoutes } from "./tenant.routes";
import { registerSecretsRoutes } from "./secrets.routes";
import { registerConnectionsV2Routes } from "./connections-v2.routes";
import { registerApiProjectRoutes } from "./api.projects.routes";
import { registerApiWorkflowRoutes } from "./api.workflows.routes";
import { registerApiTemplateRoutes } from "./api.templates.routes";
import { registerApiRunRoutes } from "./api.runs.routes";
import { registerWorkflowAnalyticsRoutes } from "./workflowAnalytics.routes";
import { registerIntakeRoutes } from "./intake.routes";
import { registerVersionRoutes } from "./versions.routes";
import { registerBrandingRoutes } from "./branding.routes";
import { registerEmailTemplateRoutes } from "./emailTemplates.routes";
import { registerCollectionsRoutes } from "./collections.routes";
import { registerTemplateAnalysisRoutes } from "./templateAnalysis.routes";
import { registerWorkflowTemplateRoutes } from "./workflowTemplates.routes";
import { registerRunOutputsRoutes } from "./runOutputs.routes";
import { registerDatavaultRoutes } from "./datavault.routes";
import { registerDatavaultApiTokenRoutes } from "./datavaultApiTokens.routes";
import { registerDocumentRoutes } from "./documents.routes";
import { registerFinalBlockRoutes } from "./finalBlock.routes";
import { registerEsignRoutes } from "./esign.routes";
import { validationRouter } from "./validation.routes";
import marketplaceRouter from "./marketplace";
import sharingRouter from "./sharing";
import enterpriseAdminRouter from "./admin";
import { registerBillingRoutes } from "./billing.routes";
import { apiLimiter } from "../lib/rateLimit";
import publicRouter from "./public.routes";
import externalRouter from "./external.routes";
import oauthRouter from "./oauth.routes";
import webhookRouter from "./webhooks.routes";

import aiDocRouter from "./ai.doc.routes";
import aiPersonalizationRouter from "./api.ai.personalization.routes";
import aiOptimizationRouter from "./api.ai.optimization.routes";
import aiTransformRouter from "./api.ai.transform.routes";
import { registerDebugRoutes } from "./debug.routes";
import { placesRouter } from "./places.routes";

/**
 * Register all modular routes
 * This is the main aggregator that wires up all domain-specific route modules
 */
export function registerAllRoutes(app: Express): void {
  // Public Access Routes (Platform Expansion)
  app.use("/public", publicRouter);

  // External API Routes (Platform Expansion)
  app.use("/api/external", apiLimiter, externalRouter);

  // OAuth 2.1 Provider
  app.use("/oauth", oauthRouter);

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

  // Validation
  app.use(validationRouter);

  // Features
  registerBrandingRoutes(app);
  registerEmailTemplateRoutes(app);
  registerDashboardRoutes(app);
  registerFileRoutes(app);
  registerAiRoutes(app);
  registerAdminRoutes(app);
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
}
