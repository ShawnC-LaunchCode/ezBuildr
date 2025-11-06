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
export { RecipientRepository, recipientRepository } from "./RecipientRepository";
export { ResponseRepository, responseRepository } from "./ResponseRepository";
export { AnalyticsRepository, analyticsRepository } from "./AnalyticsRepository";
export { FileRepository, fileRepository } from "./FileRepository";
export { SystemStatsRepository, systemStatsRepository } from "./SystemStatsRepository";

// Vault-Logic Workflow repositories
export { WorkflowRepository, workflowRepository } from "./WorkflowRepository";
export { SectionRepository, sectionRepository } from "./SectionRepository";
export { StepRepository, stepRepository } from "./StepRepository";
export { WorkflowRunRepository, workflowRunRepository } from "./WorkflowRunRepository";
export { StepValueRepository, stepValueRepository } from "./StepValueRepository";
export { ParticipantRepository, participantRepository } from "./ParticipantRepository";
export { LogicRuleRepository, logicRuleRepository } from "./LogicRuleRepository";
export { TransformBlockRepository, transformBlockRepository, TransformBlockRunRepository, transformBlockRunRepository } from "./TransformBlockRepository";

// Export type for Insert operations
export type { InsertAnalyticsEvent } from "./AnalyticsRepository";
