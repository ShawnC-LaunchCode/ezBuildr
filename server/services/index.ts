/**
 * Service Layer Index
 * Central export point for all business logic services
 *
 * Services provide a clean abstraction layer between routes and repositories,
 * handling business logic, validation, authorization, and orchestration.
 *
 * NOTE: Survey-specific services removed (Nov 2025) - workflow-only platform
 */

// Workflow services
export { ProjectService, projectService } from "./ProjectService";
export { WorkflowService, workflowService } from "./WorkflowService";
export { SnapshotService, snapshotService } from "./snapshotService";
// AnalyticsService removed - was 100% legacy survey code (Nov 2025)

// Stage 14: Review & E-Signature services
export { ReviewTaskService, reviewTaskService } from "./ReviewTaskService";
export { SignatureRequestService, signatureRequestService } from "./SignatureRequestService";

// DataVault Phase 1 services
export { DatavaultTablesService, datavaultTablesService } from "./DatavaultTablesService";
export { DatavaultColumnsService, datavaultColumnsService } from "./DatavaultColumnsService";
export { DatavaultRowsService, datavaultRowsService } from "./DatavaultRowsService";

// DataVault v4 Micro-Phase 3: Row Notes
export { DatavaultRowNotesService, datavaultRowNotesService } from "./DatavaultRowNotesService";

// DataVault v4 Micro-Phase 5: API Tokens
export { DatavaultApiTokensService, datavaultApiTokensService } from "./DatavaultApiTokensService";

// DataVault v4 Micro-Phase 6: Table Permissions
export { DatavaultTablePermissionsService, datavaultTablePermissionsService } from "./DatavaultTablePermissionsService";

// Utility services
// Note: Not re-exporting emailService and sendgrid to avoid conflicts
export * from "./fileService";
