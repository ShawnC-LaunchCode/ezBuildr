import type { Express } from "express";
import { registerAuthRoutes } from "./auth.routes";
import { registerAccountRoutes } from "./account.routes";
import { registerUserPreferencesRoutes } from "./userPreferences.routes";
import { registerFileRoutes } from "./files.routes";
import { registerDashboardRoutes } from "./dashboard.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerAiRoutes } from "./ai.routes";
import { registerTemplateRoutes } from "./templates.routes";
import { registerTemplateSharingRoutes } from "./templateSharing.routes";
import { registerProjectRoutes } from "./projects.routes";
import { registerWorkflowRoutes } from "./workflows.routes";
import { registerSectionRoutes } from "./sections.routes";
import { registerStepRoutes } from "./steps.routes";
import { registerBlockRoutes } from "./blocks.routes";
import { registerRunRoutes } from "./runs.routes";
import { registerWorkflowExportRoutes } from "./workflowExports.routes";
import { registerTransformBlockRoutes } from "./transformBlocks.routes";
import { registerTeamRoutes } from "./teams.routes";
import { registerTenantRoutes } from "./tenant.routes";
import { registerSecretsRoutes } from "./secrets.routes";
import { registerConnectionsRoutes } from "./connections.routes";
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

/**
 * Register all modular routes
 * This is the main aggregator that wires up all domain-specific route modules
 */
export function registerAllRoutes(app: Express): void {
  // Authentication routes
  registerAuthRoutes(app);

  // Tenant routes (multi-tenancy and RBAC)
  registerTenantRoutes(app);

  // Branding routes (Stage 17)
  registerBrandingRoutes(app);

  // Email template metadata routes (Stage 17)
  registerEmailTemplateRoutes(app);

  // Account routes (mode preferences)
  registerAccountRoutes(app);

  // User preferences routes
  registerUserPreferencesRoutes(app);

  // Dashboard routes (DISABLED - survey-specific, needs workflow conversion)
  // registerDashboardRoutes(app);

  // Template management routes
  registerTemplateRoutes(app);

  // Template sharing and collaboration routes
  registerTemplateSharingRoutes(app);

  // File upload and management routes
  registerFileRoutes(app);

  // AI-powered analytics routes
  registerAiRoutes(app);

  // Admin routes (must be after auth routes)
  registerAdminRoutes(app);

  // ========================================================================
  // Vault-Logic Workflow Routes
  // ========================================================================

  // Team management routes (collaboration)
  registerTeamRoutes(app);

  // Project management routes (workflow organization)
  registerProjectRoutes(app);

  // Workflow management routes
  registerWorkflowRoutes(app);

  // Workflow template mapping routes (Stage 21)
  registerWorkflowTemplateRoutes(app);

  // Section management routes
  registerSectionRoutes(app);

  // Step management routes
  registerStepRoutes(app);

  // Block management routes
  registerBlockRoutes(app);

  // Transform block routes (custom logic execution)
  registerTransformBlockRoutes(app);

  // Secrets management routes (Stage 9)
  registerSecretsRoutes(app);

  // External connections routes (Stage 9)
  registerConnectionsRoutes(app);

  // Connections routes (Stage 16 - Integrations Hub)
  registerConnectionsV2Routes(app);

  // Workflow run and execution routes
  registerRunRoutes(app);

  // Workflow export routes (JSON and CSV)
  registerWorkflowExportRoutes(app);

  // ========================================================================
  // Stage 4: REST API Endpoints (Projects, Workflows, Templates, Runs)
  // ========================================================================

  // Projects API (tenant-scoped)
  registerApiProjectRoutes(app);

  // Workflows API (versioning, publishing)
  registerApiWorkflowRoutes(app);

  // Templates API (file upload, placeholders)
  registerApiTemplateRoutes(app);

  // Template Analysis API (Stage 21 - analyze, validate, sample data)
  registerTemplateAnalysisRoutes(app);

  // Run Outputs API (Stage 21 - view, download generated documents)
  registerRunOutputsRoutes(app);

  // Runs API (workflow execution, logs, download)
  registerApiRunRoutes(app);

  // ========================================================================
  // Stage 11: Workflow Analytics & SLIs
  // ========================================================================

  // Workflow analytics routes (metrics, rollups, SLI)
  registerWorkflowAnalyticsRoutes(app);

  // ========================================================================
  // Stage 12: Intake Portal (Public Workflow Runner)
  // ========================================================================

  // Intake portal routes (public workflow execution)
  registerIntakeRoutes(app);

  // ========================================================================
  // Stage 13: Publishing, Snapshots & Rollback
  // ========================================================================

  // Version management routes (publish, rollback, diff)
  registerVersionRoutes(app);

  // ========================================================================
  // Stage 19: Collections / Datastore System
  // ========================================================================

  // Collections/Datastore routes (tenant-scoped tables, fields, records)
  registerCollectionsRoutes(app);
}
