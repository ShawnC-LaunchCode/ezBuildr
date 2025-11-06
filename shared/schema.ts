import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  uuid,
  boolean,
  integer,
  pgEnum,
  primaryKey
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Google Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User roles enum
export const userRoleEnum = pgEnum('user_role', ['admin', 'creator']);

// Survey status enum
export const surveyStatusEnum = pgEnum('survey_status', ['draft', 'open', 'closed']);

// Question type enum
export const questionTypeEnum = pgEnum('question_type', [
  'short_text', 
  'long_text', 
  'multiple_choice', 
  'radio', 
  'yes_no', 
  'date_time', 
  'file_upload',
  'loop_group'
]);

// Condition operator enum for conditional logic
export const conditionOperatorEnum = pgEnum('condition_operator', [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'between',
  'is_empty',
  'is_not_empty'
]);

// Conditional action enum
export const conditionalActionEnum = pgEnum('conditional_action', [
  'show',
  'hide',
  'require',
  'make_optional'
]);

// Users table for Google Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").default('creator').notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Anonymous access type enum
export const anonymousAccessTypeEnum = pgEnum('anonymous_access_type', ['disabled', 'unlimited', 'one_per_ip', 'one_per_session']);

// Surveys table
export const surveys = pgTable("surveys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  status: surveyStatusEnum("status").default('draft').notNull(),
  // Anonymous survey configuration
  allowAnonymous: boolean("allow_anonymous").default(false),
  anonymousAccessType: anonymousAccessTypeEnum("anonymous_access_type").default('unlimited'),
  publicLink: varchar("public_link").unique(), // Generated public UUID for anonymous access
  anonymousConfig: jsonb("anonymous_config"), // Additional anonymous survey settings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Unique index on publicLink for database-level UUID collision prevention
  index("surveys_public_link_unique_idx").on(table.publicLink),
]);

// Survey pages table
export const surveyPages = pgTable("survey_pages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Questions table
export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: uuid("page_id").references(() => surveyPages.id, { onDelete: 'cascade' }).notNull(),
  type: questionTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  required: boolean("required").default(false),
  options: jsonb("options"), // For multiple choice, radio options
  loopConfig: jsonb("loop_config"), // For loop groups: {minIterations, maxIterations, addButtonText, removeButtonText}
  conditionalLogic: jsonb("conditional_logic"), // For conditional visibility and requirements
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Loop group subquestions table
export const loopGroupSubquestions = pgTable("loop_group_subquestions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loopQuestionId: uuid("loop_question_id").references(() => questions.id, { onDelete: 'cascade' }).notNull(),
  type: questionTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  required: boolean("required").default(false),
  options: jsonb("options"),
  loopConfig: jsonb("loop_config"), // For nested loop groups: {minIterations, maxIterations, addButtonText, removeButtonText}
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Conditional rules table
export const conditionalRules = pgTable("conditional_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
  conditionQuestionId: uuid("condition_question_id").references(() => questions.id, { onDelete: 'cascade' }).notNull(),
  operator: conditionOperatorEnum("operator").notNull(),
  conditionValue: jsonb("condition_value").notNull(), // Support complex values for between, contains, etc.
  targetQuestionId: uuid("target_question_id").references(() => questions.id, { onDelete: 'cascade' }),
  targetPageId: uuid("target_page_id").references(() => surveyPages.id, { onDelete: 'cascade' }),
  action: conditionalActionEnum("action").notNull(),
  logicalOperator: varchar("logical_operator").default("AND"), // For multiple conditions: AND, OR
  order: integer("order").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Responses table
export const responses = pgTable("responses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
  completed: boolean("completed").default(false),
  submittedAt: timestamp("submitted_at"),
  // Anonymous response metadata
  isAnonymous: boolean("is_anonymous").default(false),
  ipAddress: varchar("ip_address"), // For anonymous response tracking and limiting
  userAgent: text("user_agent"), // For analytics
  sessionId: varchar("session_id"), // For one_per_session limiting
  anonymousMetadata: jsonb("anonymous_metadata"), // Additional anonymous response data
  createdAt: timestamp("created_at").defaultNow(),
});

// Answers table
export const answers = pgTable("answers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  responseId: uuid("response_id").references(() => responses.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid("question_id").references(() => questions.id, { onDelete: 'cascade' }).notNull(),
  subquestionId: uuid("subquestion_id").references(() => loopGroupSubquestions.id, { onDelete: 'cascade' }), // For loop group subquestion answers
  loopIndex: integer("loop_index"), // For loop group answers
  value: jsonb("value").notNull(), // Stores answer data as JSON
  createdAt: timestamp("created_at").defaultNow(),
});

// Files table
export const files = pgTable("files", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  answerId: uuid("answer_id").references(() => answers.id, { onDelete: 'cascade' }).notNull(),
  filename: varchar("filename").notNull(),
  originalName: varchar("original_name").notNull(),
  mimeType: varchar("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Analytics events table
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  responseId: uuid("response_id").references(() => responses.id, { onDelete: 'cascade' }).notNull(),
  surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
  pageId: uuid("page_id").references(() => surveyPages.id, { onDelete: 'cascade' }),
  questionId: uuid("question_id").references(() => questions.id, { onDelete: 'cascade' }),
  event: varchar("event").notNull(), // 'page_view', 'page_leave', 'question_focus', 'question_answer', 'question_skip', 'survey_start', 'survey_complete', 'survey_abandon'
  data: jsonb("data"), // Event-specific data including time tracking
  duration: integer("duration"), // Time spent in milliseconds
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  // Performance indices for analytics queries
  index("analytics_survey_event_idx").on(table.surveyId, table.event),
  index("analytics_response_event_idx").on(table.responseId, table.event),
  index("analytics_question_event_idx").on(table.questionId, table.event),
  index("analytics_page_event_idx").on(table.pageId, table.event),
  index("analytics_timestamp_idx").on(table.timestamp),
  index("analytics_duration_idx").on(table.duration),
  // Composite indices for common query patterns
  index("analytics_survey_question_event_idx").on(table.surveyId, table.questionId, table.event),
  index("analytics_survey_page_event_idx").on(table.surveyId, table.pageId, table.event),
]);

// Anonymous response tracking table for IP/session limiting
export const anonymousResponseTracking = pgTable("anonymous_response_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
  ipAddress: varchar("ip_address").notNull(),
  sessionId: varchar("session_id"),
  responseId: uuid("response_id").references(() => responses.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Indices for anonymous response limiting
  index("anonymous_tracking_survey_ip_idx").on(table.surveyId, table.ipAddress),
  index("anonymous_tracking_survey_session_idx").on(table.surveyId, table.sessionId),
]);

// System statistics table for tracking historical totals
export const systemStats = pgTable("system_stats", {
  id: integer("id").primaryKey().default(1), // Single row table
  totalSurveysCreated: integer("total_surveys_created").default(0).notNull(),
  totalSurveysDeleted: integer("total_surveys_deleted").default(0).notNull(),
  totalResponsesCollected: integer("total_responses_collected").default(0).notNull(),
  totalResponsesDeleted: integer("total_responses_deleted").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User preferences table for personalization settings
export const userPreferences = pgTable("user_preferences", {
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
  settings: jsonb("settings").default({
    celebrationEffects: true,
    darkMode: "system",
    aiHints: true,
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Survey templates table for reusable survey sections
export const surveyTemplates = pgTable("survey_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  content: jsonb("content").notNull(), // Full serialized survey/page/question tree
  creatorId: varchar("creator_id").references(() => users.id),
  isSystem: boolean("is_system").default(false).notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`), // Tags for categorization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("survey_templates_creator_idx").on(table.creatorId),
  index("survey_templates_system_idx").on(table.isSystem),
]);

// Template access enum
export const templateAccessEnum = pgEnum('template_access', ['use', 'edit']);

// Template shares table for collaboration
export const templateShares = pgTable("template_shares", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").references(() => surveyTemplates.id, { onDelete: 'cascade' }).notNull(),
  // Either userId (resolved user) or pendingEmail (invite not yet accepted)
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  pendingEmail: text("pending_email"),
  access: templateAccessEnum("access").notNull().default('use'),
  invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, (table) => [
  index("template_shares_template_idx").on(table.templateId),
  index("template_shares_user_idx").on(table.userId),
  index("template_shares_pending_email_idx").on(table.pendingEmail),
]);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  surveys: many(surveys),
  surveyTemplates: many(surveyTemplates),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  creator: one(users, {
    fields: [surveys.creatorId],
    references: [users.id],
  }),
  pages: many(surveyPages),
  responses: many(responses),
  conditionalRules: many(conditionalRules),
}));

export const surveyPagesRelations = relations(surveyPages, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [surveyPages.surveyId],
    references: [surveys.id],
  }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  page: one(surveyPages, {
    fields: [questions.pageId],
    references: [surveyPages.id],
  }),
  subquestions: many(loopGroupSubquestions),
  answers: many(answers),
}));

export const loopGroupSubquestionsRelations = relations(loopGroupSubquestions, ({ one }) => ({
  loopQuestion: one(questions, {
    fields: [loopGroupSubquestions.loopQuestionId],
    references: [questions.id],
  }),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [responses.surveyId],
    references: [surveys.id],
  }),
  answers: many(answers),
  analyticsEvents: many(analyticsEvents),
  anonymousTracking: many(anonymousResponseTracking),
}));

export const anonymousResponseTrackingRelations = relations(anonymousResponseTracking, ({ one }) => ({
  survey: one(surveys, {
    fields: [anonymousResponseTracking.surveyId],
    references: [surveys.id],
  }),
  response: one(responses, {
    fields: [anonymousResponseTracking.responseId],
    references: [responses.id],
  }),
}));

export const answersRelations = relations(answers, ({ one, many }) => ({
  response: one(responses, {
    fields: [answers.responseId],
    references: [responses.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
  subquestion: one(loopGroupSubquestions, {
    fields: [answers.subquestionId],
    references: [loopGroupSubquestions.id],
  }),
  files: many(files),
}));

export const surveyTemplatesRelations = relations(surveyTemplates, ({ one, many }) => ({
  creator: one(users, {
    fields: [surveyTemplates.creatorId],
    references: [users.id],
  }),
  shares: many(templateShares),
}));

export const templateSharesRelations = relations(templateShares, ({ one }) => ({
  template: one(surveyTemplates, {
    fields: [templateShares.templateId],
    references: [surveyTemplates.id],
  }),
  user: one(users, {
    fields: [templateShares.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSurveySchema = createInsertSchema(surveys).omit({ id: true, createdAt: true, updatedAt: true, publicLink: true });
export const insertSurveyPageSchema = createInsertSchema(surveyPages).omit({ id: true, createdAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true, createdAt: true });
export const insertLoopGroupSubquestionSchema = createInsertSchema(loopGroupSubquestions).omit({ id: true, createdAt: true });
export const insertConditionalRuleSchema = createInsertSchema(conditionalRules).omit({ id: true, createdAt: true });
export const insertResponseSchema = createInsertSchema(responses).omit({ id: true, createdAt: true });
export const insertAnswerSchema = createInsertSchema(answers).omit({ id: true, createdAt: true });
export const insertAnonymousResponseTrackingSchema = createInsertSchema(anonymousResponseTracking).omit({ id: true, createdAt: true });
export const insertFileSchema = createInsertSchema(files).omit({ id: true, uploadedAt: true });
export const insertSurveyTemplateSchema = createInsertSchema(surveyTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTemplateShareSchema = createInsertSchema(templateShares).omit({ id: true, invitedAt: true, acceptedAt: true });
export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({ createdAt: true, updatedAt: true });

// Analytics event validation schema with strict validation
export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({ 
  id: true, 
  timestamp: true 
}).extend({
  event: z.enum(['page_view', 'page_leave', 'question_focus', 'question_blur', 'question_answer', 'question_skip', 'survey_start', 'survey_complete', 'survey_abandon']),
  responseId: z.string().uuid("Invalid response ID format"),
  surveyId: z.string().uuid("Invalid survey ID format"),
  pageId: z.string().uuid("Invalid page ID format").optional().nullable(),
  questionId: z.string().uuid("Invalid question ID format").optional(),
  duration: z.number().int().min(0, "Duration must be non-negative").optional(),
  data: z.record(z.any()).optional()
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Survey = typeof surveys.$inferSelect;
export type InsertSurvey = typeof insertSurveySchema._type;
export type SurveyPage = typeof surveyPages.$inferSelect;
export type InsertSurveyPage = typeof insertSurveyPageSchema._type;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof insertQuestionSchema._type;
export type LoopGroupSubquestion = typeof loopGroupSubquestions.$inferSelect;
export type InsertLoopGroupSubquestion = typeof insertLoopGroupSubquestionSchema._type;
export type ConditionalRule = typeof conditionalRules.$inferSelect;
export type InsertConditionalRule = typeof insertConditionalRuleSchema._type;
export type Response = typeof responses.$inferSelect;
export type InsertResponse = typeof insertResponseSchema._type;
export type Answer = typeof answers.$inferSelect;
export type InsertAnswer = typeof insertAnswerSchema._type;
export type File = typeof files.$inferSelect;
export type InsertFile = typeof insertFileSchema._type;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type AnonymousResponseTracking = typeof anonymousResponseTracking.$inferSelect;
export type InsertAnonymousResponseTracking = typeof insertAnonymousResponseTrackingSchema._type;
export type SystemStats = typeof systemStats.$inferSelect;
export type SurveyTemplate = typeof surveyTemplates.$inferSelect;
export type InsertSurveyTemplate = typeof insertSurveyTemplateSchema._type;
export type TemplateShare = typeof templateShares.$inferSelect;
export type InsertTemplateShare = typeof insertTemplateShareSchema._type;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = typeof insertUserPreferencesSchema._type;

// Additional API response types
export interface DashboardStats {
  totalSurveys: number;
  activeSurveys: number;
  draftSurveys: number;
  closedSurveys: number;
  totalResponses: number;
  completionRate: number;
  avgResponsesPerSurvey: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'survey_created' | 'survey_published' | 'response_received' | 'survey_closed';
  title: string;
  description: string;
  timestamp: Date;
  surveyId?: string;
  responseId?: string;
}

export interface SurveyAnalytics {
  surveyId: string;
  title: string;
  responseCount: number;
  completionRate: number;
  avgCompletionTime: number; // in minutes
  medianCompletionTime: number; // in minutes
  totalTimeSpent: number; // in minutes
  dropOffRate: number; // percentage
  mostAnsweredQuestionId?: string;
  leastAnsweredQuestionId?: string;
  lastResponseAt: Date | null;
  status: string;
}

export interface ResponseTrend {
  date: string;
  count: number;
  completed: number;
  avgCompletionTime: number; // in minutes
  totalTimeSpent: number; // in minutes
}

export interface BulkOperationRequest {
  surveyIds: string[];
  operation: 'close' | 'open' | 'delete' | 'archive';
}

export interface BulkOperationResult {
  success: boolean;
  updatedCount: number;
  errors: string[];
}

export interface SurveyDuplication {
  originalId: string;
  title: string;
  includeResponses?: boolean;
}

// Loop group configuration types
export interface LoopGroupConfig {
  minIterations: number;
  maxIterations: number;
  addButtonText?: string;
  removeButtonText?: string;
  allowReorder?: boolean;
}

// Extended question type with subquestions for frontend usage
export interface QuestionWithSubquestions extends Question {
  subquestions?: LoopGroupSubquestion[];
}

// Loop instance data for responses
export interface LoopInstanceData {
  instanceIndex: number;
  answers: Record<string, any>;
}

// Conditional logic configuration types
export interface ConditionalLogicConfig {
  enabled: boolean;
  conditions: ConditionalCondition[];
  action: 'show' | 'hide' | 'require' | 'make_optional';
  logicalOperator?: 'AND' | 'OR'; // For multiple conditions
}

export interface ConditionalCondition {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'is_empty' | 'is_not_empty';
  value: any; // Can be string, number, array, etc.
  secondValue?: any; // For 'between' operator
}

// Extended question type with conditional rules for frontend usage
export interface QuestionWithConditionalLogic extends Question {
  conditionalRules?: ConditionalRule[];
}

// File upload configuration types
export interface FileUploadConfig {
  acceptedTypes: string[]; // e.g., ['image/*', '.pdf', '.doc', '.docx']
  maxFileSize: number; // in bytes
  maxFiles: number; // maximum number of files
  required: boolean;
  allowMultiple: boolean;
}

// Enhanced analytics types
export interface QuestionAnalytics {
  questionId: string;
  questionTitle: string;
  questionType: string;
  pageId: string;
  totalResponses: number; // total survey responses
  totalViews: number;
  totalAnswers: number;
  totalSkips: number;
  answerRate: number; // percentage
  avgTimeSpent: number; // in seconds
  medianTimeSpent: number; // in seconds
  dropOffCount: number; // how many people left at this question
  aggregates?: Array<{ option: string; count: number; percentage: number }>; // for multiple choice, radio, yes_no
  textAnswers?: string[]; // for short_text, long_text
}

export interface PageAnalytics {
  pageId: string;
  pageTitle: string;
  pageOrder: number;
  totalViews: number;
  totalCompletions: number;
  completionRate: number; // percentage
  avgTimeSpent: number; // in seconds
  medianTimeSpent: number; // in seconds
  dropOffCount: number;
  questions: QuestionAnalytics[];
}

export interface CompletionFunnelData {
  pageId: string;
  pageTitle: string;
  pageOrder: number;
  entrances: number;
  exits: number;
  completions: number;
  dropOffRate: number;
}

export interface TimeSpentData {
  surveyId: string;
  responseId: string;
  totalTime: number; // in milliseconds
  pageTimeSpent: { pageId: string; duration: number }[];
  questionTimeSpent: { questionId: string; duration: number }[];
}

export interface EngagementMetrics {
  surveyId: string;
  avgSessionDuration: number; // in minutes
  bounceRate: number; // percentage who left without answering any questions
  engagementScore: number; // calculated based on time spent vs expected time
  peakEngagementHour: number; // hour of day with most engagement
  completionTrends: { hour: number; completions: number }[];
}

// Question aggregates types
export interface YesNoAggregation {
  yes: number;
  no: number;
}

export interface ChoiceAggregation {
  option: string;
  count: number;
  percent: number;
}

export interface TextAggregation {
  topKeywords: Array<{ word: string; count: number }>;
  totalWords: number;
}

export interface QuestionAggregate {
  questionId: string;
  questionTitle: string;
  questionType: string;
  totalAnswers: number;
  aggregation: YesNoAggregation | ChoiceAggregation[] | TextAggregation;
}

export interface QuestionAggregatesResponse {
  surveyId: string;
  questions: QuestionAggregate[];
}

// File metadata type
export interface FileMetadata {
  id: string;
  answerId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

// File upload response type
export interface FileUploadResponse {
  success: boolean;
  files: FileMetadata[];
  errors?: string[];
}

// Condition evaluation result
export interface ConditionalEvaluationResult {
  questionId: string;
  visible: boolean;
  required: boolean;
  reason?: string; // For debugging
}

// Anonymous survey configuration types
export interface AnonymousSurveyConfig {
  maxResponsesPerIP?: number; // For custom limiting
  cooldownPeriodHours?: number; // Time between responses from same IP
  collectUserAgent?: boolean;
  collectTimestamp?: boolean;
  requireCaptcha?: boolean; // Future extension
  customMessage?: string; // Message shown to anonymous users
}

// Anonymous response metadata
export interface AnonymousResponseMetadata {
  browserInfo?: {
    userAgent: string;
    language: string;
    timezone: string;
  };
  deviceInfo?: {
    isMobile: boolean;
    screenResolution: string;
  };
  accessInfo?: {
    referrer?: string;
    entryTime: number;
  };
}

// =====================================================================
// VAULT-LOGIC SCHEMA (Workflow Builder)
// =====================================================================

// Workflow status enum
export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'archived']);

// Step (question) type enum - reuse question types
export const stepTypeEnum = pgEnum('step_type', [
  'short_text',
  'long_text',
  'multiple_choice',
  'radio',
  'yes_no',
  'date_time',
  'file_upload'
]);

// Logic rule target type enum
export const logicRuleTargetTypeEnum = pgEnum('logic_rule_target_type', ['section', 'step']);

// Workflows table (equivalent to surveys)
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  status: workflowStatusEnum("status").default('draft').notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workflows_creator_idx").on(table.creatorId),
  index("workflows_status_idx").on(table.status),
]);

// Sections table (equivalent to survey pages)
export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sections_workflow_idx").on(table.workflowId),
]);

// Steps table (equivalent to questions)
export const steps = pgTable("steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }).notNull(),
  type: stepTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  required: boolean("required").default(false),
  options: jsonb("options"), // For multiple choice, radio options
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("steps_section_idx").on(table.sectionId),
]);

// Logic rules table (conditional logic for workflows)
export const logicRules = pgTable("logic_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  conditionStepId: uuid("condition_step_id").references(() => steps.id, { onDelete: 'cascade' }).notNull(),
  operator: conditionOperatorEnum("operator").notNull(),
  conditionValue: jsonb("condition_value").notNull(),
  targetType: logicRuleTargetTypeEnum("target_type").notNull(), // 'section' or 'step'
  targetStepId: uuid("target_step_id").references(() => steps.id, { onDelete: 'cascade' }),
  targetSectionId: uuid("target_section_id").references(() => sections.id, { onDelete: 'cascade' }),
  action: conditionalActionEnum("action").notNull(),
  logicalOperator: varchar("logical_operator").default("AND"),
  order: integer("order").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("logic_rules_workflow_idx").on(table.workflowId),
  index("logic_rules_condition_step_idx").on(table.conditionStepId),
]);

// Participants table (equivalent to global recipients)
export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  metadata: jsonb("metadata"), // Additional participant info
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("participants_creator_idx").on(table.creatorId),
  index("participants_email_idx").on(table.email),
]);

// Workflow runs table (execution instances)
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  participantId: uuid("participant_id").references(() => participants.id),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"), // Run-specific metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workflow_runs_workflow_idx").on(table.workflowId),
  index("workflow_runs_participant_idx").on(table.participantId),
  index("workflow_runs_completed_idx").on(table.completed),
]);

// Step values table (captured values per step in a run)
export const stepValues = pgTable("step_values", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
  stepId: uuid("step_id").references(() => steps.id, { onDelete: 'cascade' }).notNull(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("step_values_run_idx").on(table.runId),
  index("step_values_step_idx").on(table.stepId),
]);

// Block type enum
export const blockTypeEnum = pgEnum('block_type', ['prefill', 'validate', 'branch']);

// Block phase enum
export const blockPhaseEnum = pgEnum('block_phase', [
  'onRunStart',
  'onSectionEnter',
  'onSectionSubmit',
  'onNext',
  'onRunComplete'
]);

// Blocks table (generic block framework for workflow runtime)
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }), // nullable - can be workflow-scoped
  type: blockTypeEnum("type").notNull(),
  phase: blockPhaseEnum("phase").notNull(),
  config: jsonb("config").notNull(), // type-specific configuration
  enabled: boolean("enabled").default(true).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("blocks_workflow_phase_order_idx").on(table.workflowId, table.phase, table.order),
  index("blocks_section_idx").on(table.sectionId),
]);

// Vault-Logic Relations
export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  creator: one(users, {
    fields: [workflows.creatorId],
    references: [users.id],
  }),
  sections: many(sections),
  logicRules: many(logicRules),
  runs: many(workflowRuns),
  blocks: many(blocks),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [sections.workflowId],
    references: [workflows.id],
  }),
  steps: many(steps),
  blocks: many(blocks),
}));

export const stepsRelations = relations(steps, ({ one, many }) => ({
  section: one(sections, {
    fields: [steps.sectionId],
    references: [sections.id],
  }),
  values: many(stepValues),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  creator: one(users, {
    fields: [participants.creatorId],
    references: [users.id],
  }),
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
  participant: one(participants, {
    fields: [workflowRuns.participantId],
    references: [participants.id],
  }),
  stepValues: many(stepValues),
}));

export const stepValuesRelations = relations(stepValues, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [stepValues.runId],
    references: [workflowRuns.id],
  }),
  step: one(steps, {
    fields: [stepValues.stepId],
    references: [steps.id],
  }),
}));

export const logicRulesRelations = relations(logicRules, ({ one }) => ({
  workflow: one(workflows, {
    fields: [logicRules.workflowId],
    references: [workflows.id],
  }),
  conditionStep: one(steps, {
    fields: [logicRules.conditionStepId],
    references: [steps.id],
  }),
  targetStep: one(steps, {
    fields: [logicRules.targetStepId],
    references: [steps.id],
  }),
  targetSection: one(sections, {
    fields: [logicRules.targetSectionId],
    references: [sections.id],
  }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  workflow: one(workflows, {
    fields: [blocks.workflowId],
    references: [workflows.id],
  }),
  section: one(sections, {
    fields: [blocks.sectionId],
    references: [sections.id],
  }),
}));

// Vault-Logic Insert Schemas
export const insertWorkflowSchema = createInsertSchema(workflows).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSectionSchema = createInsertSchema(sections).omit({ id: true, createdAt: true });
export const insertStepSchema = createInsertSchema(steps).omit({ id: true, createdAt: true });
export const insertLogicRuleSchema = createInsertSchema(logicRules).omit({ id: true, createdAt: true });
export const insertParticipantSchema = createInsertSchema(participants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStepValueSchema = createInsertSchema(stepValues).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBlockSchema = createInsertSchema(blocks).omit({ id: true, createdAt: true, updatedAt: true });

// Vault-Logic Types
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof insertWorkflowSchema._type;
export type Section = typeof sections.$inferSelect;
export type InsertSection = typeof insertSectionSchema._type;
export type Step = typeof steps.$inferSelect;
export type InsertStep = typeof insertStepSchema._type;
export type LogicRule = typeof logicRules.$inferSelect;
export type InsertLogicRule = typeof insertLogicRuleSchema._type;
export type Participant = typeof participants.$inferSelect;
export type InsertParticipant = typeof insertParticipantSchema._type;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof insertWorkflowRunSchema._type;
export type StepValue = typeof stepValues.$inferSelect;
export type InsertStepValue = typeof insertStepValueSchema._type;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = typeof insertBlockSchema._type;
