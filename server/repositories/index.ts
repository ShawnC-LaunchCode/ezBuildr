/**
 * Repository Index
 * Central export point for all repository classes
 *
 * Repositories provide a clean abstraction layer over database operations,
 * encapsulating all data access logic and making it easier to test and maintain.
 */

// Export base repository and transaction type
export { BaseRepository, type DbTransaction } from "./BaseRepository";

// Export domain repositories (user, analytics, files, system)
// NOTE: Survey repositories removed (Nov 2025) - workflow-only platform
export { UserRepository, userRepository } from "./UserRepository";
export { UserCredentialsRepository, userCredentialsRepository } from "./UserCredentialsRepository";
export { UserPreferencesRepository, userPreferencesRepository } from "./UserPreferencesRepository";
export { AnalyticsRepository, analyticsRepository } from "./AnalyticsRepository";
export { FileRepository, fileRepository } from "./FileRepository";
export { SystemStatsRepository, systemStatsRepository } from "./SystemStatsRepository";

// Vault-Logic Workflow repositories
export { ProjectRepository, projectRepository } from "./ProjectRepository";
export { WorkflowRepository, workflowRepository } from "./WorkflowRepository";
export { SectionRepository, sectionRepository } from "./SectionRepository";
export { StepRepository, stepRepository } from "./StepRepository";
export { WorkflowRunRepository, workflowRunRepository } from "./WorkflowRunRepository";
export { StepValueRepository, stepValueRepository } from "./StepValueRepository";
export { LogicRuleRepository, logicRuleRepository } from "./LogicRuleRepository";
export { BlockRepository, blockRepository } from "./BlockRepository";
export { TransformBlockRepository, transformBlockRepository, TransformBlockRunRepository, transformBlockRunRepository } from "./TransformBlockRepository";
export { RunGeneratedDocumentsRepository, runGeneratedDocumentsRepository } from "./RunGeneratedDocumentsRepository";
export { SnapshotRepository, snapshotRepository, type WorkflowSnapshot, type SnapshotValueMap } from "./SnapshotRepository";
export { WorkflowQueriesRepository, workflowQueriesRepository } from "./WorkflowQueriesRepository";

// Teams & ACL repositories
export { TeamRepository, teamRepository, TeamMemberRepository, teamMemberRepository } from "./TeamRepository";
export { ProjectAccessRepository, projectAccessRepository, WorkflowAccessRepository, workflowAccessRepository } from "./AclRepository";

// Stage 14: Review & E-Signature repositories
export { ReviewTaskRepository, reviewTaskRepository } from "./ReviewTaskRepository";
export { SignatureRequestRepository, signatureRequestRepository } from "./SignatureRequestRepository";

// Stage 19: Collections/Datastore repositories
export { CollectionRepository, collectionRepository } from "./CollectionRepository";
export { CollectionFieldRepository, collectionFieldRepository } from "./CollectionFieldRepository";
export { RecordRepository, recordRepository } from "./RecordRepository";

// Stage 21: Document Generation Engine repositories
export { DocumentTemplateRepository, documentTemplateRepository } from "./DocumentTemplateRepository";
export { WorkflowTemplateRepository, workflowTemplateRepository } from "./WorkflowTemplateRepository";

// DataVault Phase 1 repositories
export { DatavaultDatabasesRepository, datavaultDatabasesRepository } from "./DatavaultDatabasesRepository";
export { DatavaultTablesRepository, datavaultTablesRepository } from "./DatavaultTablesRepository";
export { DatavaultColumnsRepository, datavaultColumnsRepository } from "./DatavaultColumnsRepository";
export { DatavaultRowsRepository, datavaultRowsRepository } from "./DatavaultRowsRepository";

// DataVault v4 Micro-Phase 3: Row Notes
export { DatavaultRowNotesRepository, datavaultRowNotesRepository } from "./DatavaultRowNotesRepository";

// DataVault v4 Micro-Phase 5: API Tokens
export { DatavaultApiTokensRepository, datavaultApiTokensRepository } from "./DatavaultApiTokensRepository";

// DataVault v4 Micro-Phase 6: Table Permissions
export { DatavaultTablePermissionsRepository, datavaultTablePermissionsRepository } from "./DatavaultTablePermissionsRepository";

// DataVault Writeback Mappings - Workflow to DataVault integration
export { DatavaultWritebackMappingsRepository, datavaultWritebackMappingsRepository } from "./DatavaultWritebackMappingsRepository";

// Export type for Insert operations
export type { InsertAnalyticsEvent } from "./AnalyticsRepository";
export * from "./ExternalDestinationsRepository";
