import type { Express } from "express";
import { registerAuthRoutes } from "./auth.routes";
import { registerUserPreferencesRoutes } from "./userPreferences.routes";
import { registerSurveyRoutes } from "./surveys.routes";
import { registerPageRoutes } from "./pages.routes";
import { registerQuestionRoutes } from "./questions.routes";
import { registerRecipientRoutes } from "./recipients.routes";
import { registerRecipientGroupRoutes } from "./recipientGroups.routes";
import { registerRecipientImportRoutes } from "./recipients.import.routes";
import { registerResponseRoutes } from "./responses.routes";
import { registerAnalyticsRoutes } from "./analytics.routes";
import { registerFileRoutes } from "./files.routes";
import { registerDashboardRoutes } from "./dashboard.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerExportRoutes } from "./export.routes";
import { registerAiRoutes } from "./ai.routes";
import { registerGroupAnalyticsRoutes } from "./groupAnalytics.routes";
import { registerTemplateRoutes } from "./templates.routes";
import { registerTemplateSharingRoutes } from "./templateSharing.routes";
import { registerWorkflowRoutes } from "./workflows.routes";
import { registerSectionRoutes } from "./sections.routes";
import { registerStepRoutes } from "./steps.routes";
import { registerRunRoutes } from "./runs.routes";
import { registerWorkflowExportRoutes } from "./workflowExports.routes";

/**
 * Register all modular routes
 * This is the main aggregator that wires up all domain-specific route modules
 */
export function registerAllRoutes(app: Express): void {
  // Authentication routes
  registerAuthRoutes(app);

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

  // Recipient management routes
  registerRecipientRoutes(app);

  // Recipient group management routes
  registerRecipientGroupRoutes(app);

  // Recipient CSV import/export routes
  registerRecipientImportRoutes(app);

  // Response collection routes
  registerResponseRoutes(app);

  // Analytics and reporting routes
  registerAnalyticsRoutes(app);

  // Group analytics routes
  registerGroupAnalyticsRoutes(app);

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

  // Workflow management routes
  registerWorkflowRoutes(app);

  // Section management routes
  registerSectionRoutes(app);

  // Step management routes
  registerStepRoutes(app);

  // Workflow run and execution routes
  registerRunRoutes(app);

  // Workflow export routes (JSON and CSV)
  registerWorkflowExportRoutes(app);
}
