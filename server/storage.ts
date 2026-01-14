/**
 * DEPRECATED: Legacy Survey Storage Layer
 *
 * This file was the central storage abstraction for the legacy survey system.
 * It has been replaced by dedicated repositories for the workflow system.
 *
 * Survey system removed: November 2025
 *
 * For workflow data access, use:
 * - WorkflowRepository, SectionRepository, StepRepository
 * - WorkflowRunRepository, StepValueRepository
 * - LogicRuleRepository, TransformBlockRepository
 * - See server/repositories/ for all available repositories
 *
 * Status: Deprecated - kept for backward compatibility only
 */

import {
  type User,
  type UpsertUser,
  type Survey,
  type InsertSurvey,
  type SurveyPage,
  type InsertSurveyPage,
  type Question,
  type InsertQuestion,
  type LoopGroupSubquestion,
  type InsertLoopGroupSubquestion,
  type ConditionalRule,
  type InsertConditionalRule,
  type QuestionWithSubquestions,
  type Response,
  type InsertResponse,
  type Answer,
  type InsertAnswer,
  type AnalyticsEvent,
  type DashboardStats,
  type ActivityItem,
  type SurveyAnalytics,
  type ResponseTrend,
  type BulkOperationRequest,
  type BulkOperationResult,
  type SurveyDuplication,
  type File as FileMetadata,
  type QuestionAnalytics,
  type PageAnalytics,
  type CompletionFunnelData,
  type TimeSpentData,
  type EngagementMetrics,
  type AnonymousResponseTracking,
  type InsertAnonymousResponseTracking,
  type AnonymousSurveyConfig,
} from "@shared/schema";

import { userRepository } from "./repositories";

/**
 * @deprecated Legacy survey storage interface - workflow system uses repositories directly
 */
export interface IStorage {
  // Health check operations (still functional)
  ping(): Promise<boolean>;

  // User operations (still functional - required for Google Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // All methods below are deprecated stubs from the legacy survey system
  // Survey operations
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  getSurvey(id: string): Promise<Survey | undefined>;
  getSurveysByCreator(creatorId: string): Promise<Survey[]>;
  updateSurvey(id: string, updates: Partial<InsertSurvey>): Promise<Survey>;
  deleteSurvey(id: string): Promise<void>;

  // Survey page operations
  createSurveyPage(page: InsertSurveyPage): Promise<SurveyPage>;
  getSurveyPage(id: string): Promise<SurveyPage | undefined>;
  getSurveyPages(surveyId: string): Promise<SurveyPage[]>;
  getSurveyPagesWithQuestions(surveyId: string): Promise<(SurveyPage & { questions: Question[] })[]>;
  updateSurveyPage(id: string, updates: Partial<InsertSurveyPage>): Promise<SurveyPage>;
  deleteSurveyPage(id: string): Promise<void>;
  bulkReorderPages(surveyId: string, pageOrders: Array<{ id: string; order: number }>): Promise<SurveyPage[]>;

  // Question operations
  createQuestion(question: InsertQuestion): Promise<Question>;
  getQuestion(id: string): Promise<Question | undefined>;
  getQuestionsByPage(pageId: string): Promise<Question[]>;
  getQuestionsWithSubquestionsByPage(pageId: string): Promise<QuestionWithSubquestions[]>;
  updateQuestion(id: string, updates: Partial<InsertQuestion>): Promise<Question>;
  deleteQuestion(id: string): Promise<void>;
  bulkReorderQuestions(surveyId: string, questionOrders: Array<{ id: string; pageId: string; order: number }>): Promise<Question[]>;

  // Loop group subquestion operations
  createLoopGroupSubquestion(subquestion: InsertLoopGroupSubquestion): Promise<LoopGroupSubquestion>;
  getLoopGroupSubquestion(id: string): Promise<LoopGroupSubquestion | undefined>;
  getLoopGroupSubquestions(loopQuestionId: string): Promise<LoopGroupSubquestion[]>;
  updateLoopGroupSubquestion(id: string, updates: Partial<InsertLoopGroupSubquestion>): Promise<LoopGroupSubquestion>;
  deleteLoopGroupSubquestion(id: string): Promise<void>;
  deleteLoopGroupSubquestionsByLoopId(loopQuestionId: string): Promise<void>;

  // Conditional rules operations
  createConditionalRule(rule: InsertConditionalRule): Promise<ConditionalRule>;
  getConditionalRule(id: string): Promise<ConditionalRule | undefined>;
  getConditionalRulesBySurvey(surveyId: string): Promise<ConditionalRule[]>;
  getConditionalRulesByQuestion(questionId: string): Promise<ConditionalRule[]>;
  updateConditionalRule(id: string, updates: Partial<InsertConditionalRule>): Promise<ConditionalRule>;
  deleteConditionalRule(id: string): Promise<void>;
  deleteConditionalRulesBySurvey(surveyId: string): Promise<void>;

  // Response operations
  createResponse(response: InsertResponse): Promise<Response>;
  getResponse(id: string): Promise<Response | undefined>;
  getResponsesBySurvey(surveyId: string): Promise<Response[]>;
  updateResponse(id: string, updates: Partial<InsertResponse>): Promise<Response>;

  // Answer operations
  createAnswer(answer: InsertAnswer): Promise<Answer>;
  getAnswer(id: string): Promise<Answer | undefined>;
  getAnswersByResponse(responseId: string): Promise<Answer[]>;
  getAnswersWithQuestionsByResponse(responseId: string): Promise<(Answer & { question: Question })[]>;
  updateAnswer(id: string, updates: Partial<InsertAnswer>): Promise<Answer>;

  // Analytics operations
  createAnalyticsEvent(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): Promise<AnalyticsEvent>;
  getAnalyticsByResponse(responseId: string): Promise<AnalyticsEvent[]>;
  getAnalyticsBySurvey(surveyId: string): Promise<AnalyticsEvent[]>;

  // Advanced analytics
  getQuestionAnalytics(surveyId: string): Promise<QuestionAnalytics[]>;
  getPageAnalytics(surveyId: string): Promise<PageAnalytics[]>;
  getCompletionFunnelData(surveyId: string): Promise<CompletionFunnelData[]>;
  getTimeSpentData(surveyId: string): Promise<TimeSpentData[]>;
  getEngagementMetrics(surveyId: string): Promise<EngagementMetrics>;

  // Enhanced dashboard analytics
  getDashboardStats(creatorId: string): Promise<DashboardStats>;
  getSurveyAnalytics(creatorId: string): Promise<SurveyAnalytics[]>;
  getResponseTrends(creatorId: string, days?: number): Promise<ResponseTrend[]>;
  getRecentActivity(creatorId: string, limit?: number): Promise<ActivityItem[]>;

  // Bulk operations
  bulkUpdateSurveyStatus(surveyIds: string[], status: string, creatorId: string): Promise<BulkOperationResult>;
  bulkDeleteSurveys(surveyIds: string[], creatorId: string): Promise<BulkOperationResult>;

  // Survey management
  duplicateSurvey(surveyId: string, newTitle: string, creatorId: string): Promise<Survey>;
  archiveSurvey(surveyId: string, creatorId: string): Promise<Survey>;

  // File operations
  createFile(fileData: {
    answerId: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
  }): Promise<FileMetadata>;
  getFile(id: string): Promise<FileMetadata | undefined>;
  getFilesByAnswer(answerId: string): Promise<FileMetadata[]>;
  deleteFile(id: string): Promise<void>;
  deleteFilesByAnswer(answerId: string): Promise<void>;

  // Anonymous survey operations
  getSurveyByPublicLink(publicLink: string): Promise<Survey | undefined>;
  generatePublicLink(surveyId: string): Promise<string>;
  enableAnonymousAccess(surveyId: string, config: { accessType: string; anonymousConfig?: AnonymousSurveyConfig }): Promise<Survey>;
  disableAnonymousAccess(surveyId: string): Promise<Survey>;

  // Anonymous response operations
  createAnonymousResponse(data: {
    surveyId: string;
    ipAddress: string;
    userAgent?: string;
    sessionId?: string;
    anonymousMetadata?: any;
  }): Promise<Response>;
  checkAnonymousResponseLimit(surveyId: string, ipAddress: string, sessionId?: string): Promise<boolean>;
  createAnonymousResponseTracking(tracking: InsertAnonymousResponseTracking): Promise<AnonymousResponseTracking>;
  getAnonymousResponsesBySurvey(surveyId: string): Promise<Response[]>;
  getAnonymousResponseCount(surveyId: string): Promise<number>;
}

/**
 * @deprecated Legacy database storage - use repositories directly
 */
export class DatabaseStorage implements IStorage {
  private throwDeprecatedError(methodName: string): never {
    throw new Error(
      `DatabaseStorage.${methodName}() is deprecated. ` +
      `Survey system removed Nov 2025. ` +
      `Use workflow repositories instead (see server/repositories/).`
    );
  }

  // ============================================================================
  // FUNCTIONAL METHODS (Still used for authentication)
  // ============================================================================

  async ping(): Promise<boolean> {
    return userRepository.ping();
  }

  async getUser(id: string): Promise<User | undefined> {
    return userRepository.findById(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    return userRepository.upsert(userData);
  }

  // ============================================================================
  // DEPRECATED SURVEY METHODS (All throw errors)
  // ============================================================================

  async createSurvey(): Promise<Survey> {
    this.throwDeprecatedError('createSurvey');
  }

  async getSurvey(): Promise<Survey | undefined> {
    this.throwDeprecatedError('getSurvey');
  }

  async getSurveysByCreator(): Promise<Survey[]> {
    this.throwDeprecatedError('getSurveysByCreator');
  }

  async updateSurvey(): Promise<Survey> {
    this.throwDeprecatedError('updateSurvey');
  }

  async deleteSurvey(): Promise<void> {
    this.throwDeprecatedError('deleteSurvey');
  }

  async createSurveyPage(): Promise<SurveyPage> {
    this.throwDeprecatedError('createSurveyPage');
  }

  async getSurveyPage(): Promise<SurveyPage | undefined> {
    this.throwDeprecatedError('getSurveyPage');
  }

  async getSurveyPages(): Promise<SurveyPage[]> {
    this.throwDeprecatedError('getSurveyPages');
  }

  async getSurveyPagesWithQuestions(): Promise<(SurveyPage & { questions: Question[] })[]> {
    this.throwDeprecatedError('getSurveyPagesWithQuestions');
  }

  async updateSurveyPage(): Promise<SurveyPage> {
    this.throwDeprecatedError('updateSurveyPage');
  }

  async deleteSurveyPage(): Promise<void> {
    this.throwDeprecatedError('deleteSurveyPage');
  }

  async bulkReorderPages(): Promise<SurveyPage[]> {
    this.throwDeprecatedError('bulkReorderPages');
  }

  async createQuestion(): Promise<Question> {
    this.throwDeprecatedError('createQuestion');
  }

  async getQuestionsByPage(): Promise<Question[]> {
    this.throwDeprecatedError('getQuestionsByPage');
  }

  async updateQuestion(): Promise<Question> {
    this.throwDeprecatedError('updateQuestion');
  }

  async getQuestion(): Promise<Question | undefined> {
    this.throwDeprecatedError('getQuestion');
  }

  async deleteQuestion(): Promise<void> {
    this.throwDeprecatedError('deleteQuestion');
  }

  async bulkReorderQuestions(): Promise<Question[]> {
    this.throwDeprecatedError('bulkReorderQuestions');
  }

  async getQuestionsWithSubquestionsByPage(): Promise<QuestionWithSubquestions[]> {
    this.throwDeprecatedError('getQuestionsWithSubquestionsByPage');
  }

  async createLoopGroupSubquestion(): Promise<LoopGroupSubquestion> {
    this.throwDeprecatedError('createLoopGroupSubquestion');
  }

  async getLoopGroupSubquestion(): Promise<LoopGroupSubquestion | undefined> {
    this.throwDeprecatedError('getLoopGroupSubquestion');
  }

  async getLoopGroupSubquestions(): Promise<LoopGroupSubquestion[]> {
    this.throwDeprecatedError('getLoopGroupSubquestions');
  }

  async updateLoopGroupSubquestion(): Promise<LoopGroupSubquestion> {
    this.throwDeprecatedError('updateLoopGroupSubquestion');
  }

  async deleteLoopGroupSubquestion(): Promise<void> {
    this.throwDeprecatedError('deleteLoopGroupSubquestion');
  }

  async deleteLoopGroupSubquestionsByLoopId(): Promise<void> {
    this.throwDeprecatedError('deleteLoopGroupSubquestionsByLoopId');
  }

  async createConditionalRule(): Promise<ConditionalRule> {
    this.throwDeprecatedError('createConditionalRule');
  }

  async getConditionalRule(): Promise<ConditionalRule | undefined> {
    this.throwDeprecatedError('getConditionalRule');
  }

  async getConditionalRulesBySurvey(): Promise<ConditionalRule[]> {
    this.throwDeprecatedError('getConditionalRulesBySurvey');
  }

  async getConditionalRulesByQuestion(): Promise<ConditionalRule[]> {
    this.throwDeprecatedError('getConditionalRulesByQuestion');
  }

  async updateConditionalRule(): Promise<ConditionalRule> {
    this.throwDeprecatedError('updateConditionalRule');
  }

  async deleteConditionalRule(): Promise<void> {
    this.throwDeprecatedError('deleteConditionalRule');
  }

  async deleteConditionalRulesBySurvey(): Promise<void> {
    this.throwDeprecatedError('deleteConditionalRulesBySurvey');
  }

  async createResponse(): Promise<Response> {
    this.throwDeprecatedError('createResponse');
  }

  async getResponse(): Promise<Response | undefined> {
    this.throwDeprecatedError('getResponse');
  }

  async getResponsesBySurvey(): Promise<Response[]> {
    this.throwDeprecatedError('getResponsesBySurvey');
  }

  async updateResponse(): Promise<Response> {
    this.throwDeprecatedError('updateResponse');
  }

  async createAnswer(): Promise<Answer> {
    this.throwDeprecatedError('createAnswer');
  }

  async getAnswer(): Promise<Answer | undefined> {
    this.throwDeprecatedError('getAnswer');
  }

  async getAnswersByResponse(): Promise<Answer[]> {
    this.throwDeprecatedError('getAnswersByResponse');
  }

  async getAnswersWithQuestionsByResponse(): Promise<(Answer & { question: Question })[]> {
    this.throwDeprecatedError('getAnswersWithQuestionsByResponse');
  }

  async updateAnswer(): Promise<Answer> {
    this.throwDeprecatedError('updateAnswer');
  }

  async createAnalyticsEvent(): Promise<AnalyticsEvent> {
    this.throwDeprecatedError('createAnalyticsEvent');
  }

  async getAnalyticsByResponse(): Promise<AnalyticsEvent[]> {
    this.throwDeprecatedError('getAnalyticsByResponse');
  }

  async getAnalyticsBySurvey(): Promise<AnalyticsEvent[]> {
    this.throwDeprecatedError('getAnalyticsBySurvey');
  }

  async getQuestionAnalytics(): Promise<QuestionAnalytics[]> {
    this.throwDeprecatedError('getQuestionAnalytics');
  }

  async getPageAnalytics(): Promise<PageAnalytics[]> {
    this.throwDeprecatedError('getPageAnalytics');
  }

  async getCompletionFunnelData(): Promise<CompletionFunnelData[]> {
    this.throwDeprecatedError('getCompletionFunnelData');
  }

  async getTimeSpentData(): Promise<TimeSpentData[]> {
    this.throwDeprecatedError('getTimeSpentData');
  }

  async getEngagementMetrics(): Promise<EngagementMetrics> {
    this.throwDeprecatedError('getEngagementMetrics');
  }

  async getDashboardStats(): Promise<DashboardStats> {
    this.throwDeprecatedError('getDashboardStats');
  }

  async getSurveyAnalytics(): Promise<SurveyAnalytics[]> {
    this.throwDeprecatedError('getSurveyAnalytics');
  }

  async getResponseTrends(): Promise<ResponseTrend[]> {
    this.throwDeprecatedError('getResponseTrends');
  }

  async getRecentActivity(): Promise<ActivityItem[]> {
    this.throwDeprecatedError('getRecentActivity');
  }

  async bulkUpdateSurveyStatus(): Promise<BulkOperationResult> {
    this.throwDeprecatedError('bulkUpdateSurveyStatus');
  }

  async bulkDeleteSurveys(): Promise<BulkOperationResult> {
    this.throwDeprecatedError('bulkDeleteSurveys');
  }

  async duplicateSurvey(): Promise<Survey> {
    this.throwDeprecatedError('duplicateSurvey');
  }

  async archiveSurvey(): Promise<Survey> {
    this.throwDeprecatedError('archiveSurvey');
  }

  async createFile(): Promise<FileMetadata> {
    this.throwDeprecatedError('createFile');
  }

  async getFile(): Promise<FileMetadata | undefined> {
    this.throwDeprecatedError('getFile');
  }

  async getFilesByAnswer(): Promise<FileMetadata[]> {
    this.throwDeprecatedError('getFilesByAnswer');
  }

  async deleteFile(): Promise<void> {
    this.throwDeprecatedError('deleteFile');
  }

  async deleteFilesByAnswer(): Promise<void> {
    this.throwDeprecatedError('deleteFilesByAnswer');
  }

  async getSurveyByPublicLink(): Promise<Survey | undefined> {
    this.throwDeprecatedError('getSurveyByPublicLink');
  }

  async generatePublicLink(): Promise<string> {
    this.throwDeprecatedError('generatePublicLink');
  }

  async enableAnonymousAccess(): Promise<Survey> {
    this.throwDeprecatedError('enableAnonymousAccess');
  }

  async disableAnonymousAccess(): Promise<Survey> {
    this.throwDeprecatedError('disableAnonymousAccess');
  }

  async createAnonymousResponse(): Promise<Response> {
    this.throwDeprecatedError('createAnonymousResponse');
  }

  async checkAnonymousResponseLimit(): Promise<boolean> {
    this.throwDeprecatedError('checkAnonymousResponseLimit');
  }

  async createAnonymousResponseTracking(): Promise<AnonymousResponseTracking> {
    this.throwDeprecatedError('createAnonymousResponseTracking');
  }

  async getAnonymousResponsesBySurvey(): Promise<Response[]> {
    this.throwDeprecatedError('getAnonymousResponsesBySurvey');
  }

  async getAnonymousResponseCount(): Promise<number> {
    this.throwDeprecatedError('getAnonymousResponseCount');
  }
}

/**
 * Singleton instance
 * @deprecated Use repositories directly instead
 */
export const storage = new DatabaseStorage();
