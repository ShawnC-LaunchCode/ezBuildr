import type { Express } from "express";
import { registerAuthRoutes } from "./auth.routes";
import { registerAccountRoutes } from "./account.routes";
import { registerUserPreferencesRoutes } from "./userPreferences.routes";
import { registerSurveyRoutes } from "./surveys.routes";
import { registerPageRoutes } from "./pages.routes";
import { registerQuestionRoutes } from "./questions.routes";
import { registerResponseRoutes } from "./responses.routes";
import { registerAnalyticsRoutes } from "./analytics.routes";
import { registerFileRoutes } from "./files.routes";
import { registerDashboardRoutes } from "./dashboard.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerExportRoutes } from "./export.routes";
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
import { registerApiProjectRoutes } from "./api.projects.routes";
import { registerApiWorkflowRoutes } from "./api.workflows.routes";
import { registerApiTemplateRoutes } from "./api.templates.routes";
import { registerApiRunRoutes } from "./api.runs.routes";
import { registerWorkflowAnalyticsRoutes } from "./workflowAnalytics.routes";
import { registerIntakeRoutes } from "./intake.routes";
import { registerVersionRoutes } from "./versions.routes";

/**
 * Register all modular routes
 * This is the main aggregator that wires up all domain-specific route modules
 */
export function registerAllRoutes(app: Express): void {
  // Authentication routes
  registerAuthRoutes(app);

  // Tenant routes (multi-tenancy and RBAC)
  registerTenantRoutes(app);

  // Account routes (mode preferences)
  registerAccountRoutes(app);

  // User preferences routes
  registerUserPreferencesRoutes(app);

  // Dashboard routes
  registerDashboardRoutes(app);

  // Survey management routes
  registerSurveyRoutes(app);

  // Template management routes
  registerTemplateRoutes(app);

  // Template sharing and collaboration routes
  registerTemplateSharingRoutes(app);

  // Survey page routes
  registerPageRoutes(app);

  // Question and conditional logic routes
  registerQuestionRoutes(app);

  // Response collection routes
  registerResponseRoutes(app);

  // Analytics and reporting routes
  registerAnalyticsRoutes(app);

  // File upload and management routes
  registerFileRoutes(app);

  // Export routes (CSV and PDF)
  registerExportRoutes(app);

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
}
