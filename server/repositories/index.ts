/**
 * Repository Index
 * Central export point for all repository classes
 *
 * Repositories provide a clean abstraction layer over database operations,
 * encapsulating all data access logic and making it easier to test and maintain.
 */

// Export base repository and transaction type
export { BaseRepository, type DbTransaction } from "./BaseRepository";

// Export domain repositories
export { UserRepository, userRepository } from "./UserRepository";
export { UserPreferencesRepository, userPreferencesRepository } from "./UserPreferencesRepository";
export { SurveyRepository, surveyRepository } from "./SurveyRepository";
export { PageRepository, pageRepository } from "./PageRepository";
export { QuestionRepository, questionRepository } from "./QuestionRepository";
export { ResponseRepository, responseRepository } from "./ResponseRepository";
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
export { TransformBlockRepository, transformBlockRepository, TransformBlockRunRepository, transformBlockRunRepository } from "./TransformBlockRepository";

// Teams & ACL repositories
export { TeamRepository, teamRepository, TeamMemberRepository, teamMemberRepository } from "./TeamRepository";
export { ProjectAccessRepository, projectAccessRepository, WorkflowAccessRepository, workflowAccessRepository } from "./AclRepository";

// Export type for Insert operations
export type { InsertAnalyticsEvent } from "./AnalyticsRepository";
