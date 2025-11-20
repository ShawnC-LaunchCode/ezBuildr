import { sql } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
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

// Survey status enum (legacy - deprecated but kept for historical data)
// Note: Added 'active' and 'archived' to match workflow_status for consistency
export const surveyStatusEnum = pgEnum('survey_status', ['draft', 'open', 'closed', 'active', 'archived']);

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
  'make_optional',
  'skip_to'  // Skip to a specific section (workflow navigation)
]);

// ===================================================================
// MULTI-TENANT ENUMS (must be defined before users table)
// ===================================================================

// Tenant plan enum
export const tenantPlanEnum = pgEnum('tenant_plan', ['free', 'pro', 'enterprise']);

// User tenant role enum for RBAC
export const userTenantRoleEnum = pgEnum('user_tenant_role', ['owner', 'builder', 'runner', 'viewer']);

// Auth provider enum
export const authProviderEnum = pgEnum('auth_provider', ['local', 'google']);

// Users table with multi-tenant support
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  profileImageUrl: varchar("profile_image_url", { length: 500 }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }),
  role: userRoleEnum("role").default('creator').notNull(), // Legacy role for surveys
  tenantRole: userTenantRoleEnum("tenant_role"), // New RBAC role for workflows
  authProvider: authProviderEnum("auth_provider").default('local').notNull(),
  defaultMode: text("default_mode").default('easy').notNull(), // 'easy' | 'advanced'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_tenant_idx").on(table.tenantId),
  index("users_tenant_email_idx").on(table.tenantId, table.email),
]);

// User credentials table for local authentication (email/password)
export const userCredentials = pgTable("user_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_credentials_user_idx").on(table.userId),
]);

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
  credentials: one(userCredentials, {
    fields: [users.id],
    references: [userCredentials.userId],
  }),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id],
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
export const insertUserCredentialsSchema = createInsertSchema(userCredentials).omit({ id: true, createdAt: true, updatedAt: true });
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
export type UserCredentials = typeof userCredentials.$inferSelect;
export type InsertUserCredentials = typeof insertUserCredentialsSchema._type;
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

// =====================================================================
// MULTI-TENANT & RBAC
// =====================================================================

// Tenants table for multi-tenancy
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  billingEmail: varchar("billing_email", { length: 255 }),
  plan: tenantPlanEnum("plan").default('free').notNull(),
  branding: jsonb("branding"), // Stage 17: Branding customization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tenants_plan_idx").on(table.plan),
]);

// Stage 17: Tenant domains table for custom subdomain mapping
export const tenantDomains = pgTable("tenant_domains", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  domain: text("domain").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tenant_domains_tenant_idx").on(table.tenantId),
  index("tenant_domains_domain_idx").on(table.domain),
]);

// Stage 17: Email template metadata table (registry only, no rendering)
export const emailTemplateMetadata = pgTable("email_template_metadata", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: varchar("template_key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  subjectPreview: text("subject_preview"),
  brandingTokens: jsonb("branding_tokens"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("email_template_metadata_key_idx").on(table.templateKey),
]);

// Project status enum
export const projectStatusEnum = pgEnum('project_status', ['active', 'archived']);

// Workflow status enum
export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'archived']);

// WorkflowVersion status
export const versionStatusEnum = pgEnum('version_status', ['draft', 'published']);

// Template type enum
export const templateTypeEnum = pgEnum('template_type', ['docx', 'html']);

// Run status enum
export const runStatusEnum = pgEnum('run_status', ['pending', 'success', 'error', 'waiting_review', 'waiting_signature']);

// Log level enum
export const logLevelEnum = pgEnum('log_level', ['info', 'warn', 'error']);

// Stage 14: Review task status enum
export const reviewTaskStatusEnum = pgEnum('review_task_status', ['pending', 'approved', 'changes_requested', 'rejected']);

// Stage 14: Signature request status enum
export const signatureRequestStatusEnum = pgEnum('signature_request_status', ['pending', 'signed', 'declined', 'expired']);

// Stage 14: Signature provider enum
export const signatureProviderEnum = pgEnum('signature_provider', ['native', 'docusign', 'hellosign']);

// Stage 14: Signature event type enum
export const signatureEventTypeEnum = pgEnum('signature_event_type', ['sent', 'viewed', 'signed', 'declined']);

// Stage 21: Run output status enum
export const outputStatusEnum = pgEnum('output_status', ['pending', 'ready', 'failed']);

// Stage 21: Output file type enum
export const outputFileTypeEnum = pgEnum('output_file_type', ['docx', 'pdf']);

// Step (question) type enum - reuse question types
export const stepTypeEnum = pgEnum('step_type', [
  'short_text',
  'long_text',
  'multiple_choice',
  'radio',
  'yes_no',
  'computed', // Virtual steps created by transform blocks
  'date_time',
  'file_upload',
  'loop_group',
  'js_question',
  'repeater' // Stage 20 PR 4: Repeating groups
]);

// Logic rule target type enum
export const logicRuleTargetTypeEnum = pgEnum('logic_rule_target_type', ['section', 'step']);

// DataVault: Column data type enum
export const datavaultColumnTypeEnum = pgEnum('datavault_column_type', [
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'email',
  'phone',
  'url',
  'json',
  'auto_number',  // Auto-incrementing number column
  'reference'     // Reference to another table
]);

// DataVault: Database scope type enum
export const datavaultScopeTypeEnum = pgEnum('datavault_scope_type', [
  'account',
  'project',
  'workflow'
]);

// =====================================================================
// CORE TABLES
// =====================================================================

// Projects table (for organizing workflows)
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(), // Legacy field, kept for compatibility
  name: varchar("name", { length: 255 }), // New field (optional for migration)
  description: text("description"),
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }).notNull(), // Legacy field
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }), // New field (Stage 24)
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: projectStatusEnum("status").default('active').notNull(),
  archived: boolean("archived").default(false).notNull(), // DEPRECATED: Use status instead
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("projects_tenant_idx").on(table.tenantId),
  index("projects_created_by_idx").on(table.createdBy),
  index("projects_creator_idx").on(table.creatorId),
  index("projects_owner_idx").on(table.ownerId),
  index("projects_status_idx").on(table.status),
  index("projects_archived_idx").on(table.archived),
]);

// Workflows table
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // Legacy fields (old schema)
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  ownerId: varchar("owner_id").references(() => users.id).notNull(),
  modeOverride: text("mode_override"),
  publicLink: text("public_link"),
  // New multi-tenant fields (optional for migration)
  name: varchar("name", { length: 255 }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }),
  currentVersionId: uuid("current_version_id"),
  // Stage 12: Intake Portal fields
  isPublic: boolean("is_public").default(false).notNull(),
  slug: text("slug"),
  requireLogin: boolean("require_login").default(false).notNull(),
  // Stage 12.5: Intake Portal extras
  intakeConfig: jsonb("intake_config").default(sql`'{}'::jsonb`).notNull(),
  // Stage 13: Version management
  pinnedVersionId: uuid("pinned_version_id"),
  // Common fields
  status: surveyStatusEnum("status").default('draft').notNull(), // Uses survey_status enum
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workflows_project_idx").on(table.projectId),
  index("workflows_status_idx").on(table.status),
  index("workflows_is_public_idx").on(table.isPublic),
  index("workflows_slug_idx").on(table.slug),
  index("workflows_pinned_version_idx").on(table.pinnedVersionId),
]);

// WorkflowVersion table for versioning support
export const workflowVersions = pgTable("workflow_versions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  graphJson: jsonb("graph_json").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  published: boolean("published").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  // Stage 13: Version management metadata
  notes: text("notes"),
  changelog: jsonb("changelog"),
  checksum: text("checksum"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workflow_versions_workflow_idx").on(table.workflowId),
  index("workflow_versions_published_idx").on(table.published),
  index("workflow_versions_created_by_idx").on(table.createdBy),
  index("workflow_versions_checksum_idx").on(table.checksum),
]);

// Templates table for document templates
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"), // Stage 21: Template description
  fileRef: varchar("file_ref", { length: 500 }).notNull(),
  type: templateTypeEnum("type").notNull(),
  helpersVersion: integer("helpers_version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("templates_project_idx").on(table.projectId),
  index("templates_type_idx").on(table.type),
]);

// Stage 21: Workflow Templates mapping (multi-template support per workflow)
export const workflowTemplates = pgTable("workflow_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuid("template_id").references(() => templates.id, { onDelete: 'cascade' }).notNull(),
  key: text("key").notNull(), // e.g., 'engagement_letter', 'schedule_a'
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workflow_templates_version_idx").on(table.workflowVersionId),
  index("workflow_templates_template_idx").on(table.templateId),
  index("workflow_templates_key_idx").on(table.key),
  // Unique constraint: one template per key per workflow version
  index("workflow_templates_version_key_unique").on(table.workflowVersionId, table.key),
]);

// Run table (workflow execution instances)
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
  inputJson: jsonb("input_json"),
  outputRefs: jsonb("output_refs"),
  trace: jsonb("trace"), // Stage 8: Debug trace (node-by-node execution)
  status: runStatusEnum("status").default('pending').notNull(),
  error: text("error"), // Stage 8: Error message if failed
  durationMs: integer("duration_ms"),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("runs_workflow_version_idx").on(table.workflowVersionId),
  index("runs_status_idx").on(table.status),
  index("runs_created_by_idx").on(table.createdBy),
  index("runs_created_at_idx").on(table.createdAt),
]);

// Stage 21: Run outputs table (tracks generated documents per run)
export const runOutputs = pgTable("run_outputs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
  templateKey: text("template_key").notNull(), // Reference to workflowTemplates.key
  fileType: outputFileTypeEnum("file_type").notNull(), // 'docx' or 'pdf'
  storagePath: text("storage_path").notNull(), // Path to generated file
  status: outputStatusEnum("status").default('pending').notNull(), // 'pending', 'ready', 'failed'
  error: text("error"), // Error message if status is 'failed'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("run_outputs_run_idx").on(table.runId),
  index("run_outputs_template_key_idx").on(table.templateKey),
  index("run_outputs_status_idx").on(table.status),
  index("run_outputs_workflow_version_idx").on(table.workflowVersionId),
  // Composite index for common query pattern
  index("run_outputs_run_template_type_idx").on(table.runId, table.templateKey, table.fileType),
]);

// Secret type enum
export const secretTypeEnum = pgEnum('secret_type', ['api_key', 'bearer', 'oauth2', 'basic_auth']);

// Connection type enum (Stage 16)
export const connectionTypeEnum = pgEnum('connection_type', [
  'api_key',
  'bearer',
  'oauth2_client_credentials',
  'oauth2_3leg'
]);

// Collection field type enum (Stage 19)
export const collectionFieldTypeEnum = pgEnum('collection_field_type', [
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'file',
  'select',
  'multi_select',
  'json'
]);

// Secrets table for encrypted API keys and credentials
export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  valueEnc: text("value_enc").notNull(),
  type: secretTypeEnum("type").default('api_key').notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`), // OAuth2 config, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("secrets_project_idx").on(table.projectId),
  index("secrets_project_key_idx").on(table.projectId, table.key),
  index("secrets_type_idx").on(table.type),
]);

// External connections table for reusable API configurations (DEPRECATED - use connections table)
export const externalConnections = pgTable("external_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  authType: varchar("auth_type", { length: 50 }).notNull(), // 'api_key' | 'bearer' | 'oauth2' | 'basic_auth' | 'none'
  secretId: uuid("secret_id").references(() => secrets.id, { onDelete: 'set null' }),
  defaultHeaders: jsonb("default_headers").default(sql`'{}'::jsonb`),
  timeoutMs: integer("timeout_ms").default(8000),
  retries: integer("retries").default(2),
  backoffMs: integer("backoff_ms").default(250),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("external_connections_project_idx").on(table.projectId),
  index("external_connections_project_name_idx").on(table.projectId, table.name),
  index("external_connections_secret_idx").on(table.secretId),
]);

// =====================================================================
// STAGE 16: INTEGRATIONS HUB - CONNECTIONS TABLE
// =====================================================================

// Connections table - unified integration connection management
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: connectionTypeEnum("type").notNull(),
  baseUrl: varchar("base_url", { length: 500 }),

  // Provider-specific configuration (tokenUrl, authUrl, scopes, etc.)
  authConfig: jsonb("auth_config").default(sql`'{}'::jsonb`),

  // References to secrets (e.g., { apiKey: 'secret-key-1', clientId: 'secret-key-2' })
  secretRefs: jsonb("secret_refs").default(sql`'{}'::jsonb`),

  // OAuth2 3-legged flow state (access token, refresh token, expiry, scopes)
  oauthState: jsonb("oauth_state"),

  // Connection configuration
  defaultHeaders: jsonb("default_headers").default(sql`'{}'::jsonb`),
  timeoutMs: integer("timeout_ms").default(8000),
  retries: integer("retries").default(2),
  backoffMs: integer("backoff_ms").default(250),

  // Metadata
  enabled: boolean("enabled").default(true).notNull(),
  lastTestedAt: timestamp("last_tested_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("connections_tenant_idx").on(table.tenantId),
  index("connections_project_idx").on(table.projectId),
  index("connections_project_name_idx").on(table.projectId, table.name),
  index("connections_type_idx").on(table.type),
  index("connections_enabled_idx").on(table.enabled),
  // Ensure unique connection names per project
  uniqueIndex("connections_project_name_unique_idx").on(table.projectId, table.name),
]);

// =====================================================================
// STAGE 19: COLLECTIONS / DATASTORE SYSTEM
// =====================================================================

// Collections table - tenant-scoped data tables (similar to Airtable bases)
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("collections_tenant_idx").on(table.tenantId),
  index("collections_slug_idx").on(table.slug),
  index("collections_created_at_idx").on(table.createdAt),
  // Ensure unique slug per tenant
  uniqueIndex("collections_tenant_slug_unique_idx").on(table.tenantId, table.slug),
]);

// Collection fields table - field definitions for collections
export const collectionFields = pgTable("collection_fields", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: uuid("collection_id").references(() => collections.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  type: collectionFieldTypeEnum("type").notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  options: jsonb("options"), // For select/multi-select: array of valid options
  defaultValue: jsonb("default_value"), // Default value for new records
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("collection_fields_collection_idx").on(table.collectionId),
  index("collection_fields_slug_idx").on(table.slug),
  index("collection_fields_type_idx").on(table.type),
  // Ensure unique slug per collection
  uniqueIndex("collection_fields_collection_slug_unique_idx").on(table.collectionId, table.slug),
]);

// Records table - data stored in collections (schemaless JSONB)
export const records = pgTable("records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  collectionId: uuid("collection_id").references(() => collections.id, { onDelete: 'cascade' }).notNull(),
  data: jsonb("data").default(sql`'{}'::jsonb`).notNull(), // fieldSlug → value map
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index("records_tenant_idx").on(table.tenantId),
  index("records_collection_idx").on(table.collectionId),
  index("records_created_at_idx").on(table.createdAt),
  index("records_created_by_idx").on(table.createdBy),
  // GIN index for JSONB data queries
  index("records_data_gin_idx").on(table.data),
]);

// AuditEvent table for audit logging
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar("actor_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  diff: jsonb("diff"),
  ts: timestamp("ts").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("audit_events_actor_idx").on(table.actorId),
  index("audit_events_entity_idx").on(table.entityType, table.entityId),
  index("audit_events_ts_idx").on(table.ts),
]);

// ApiKey table for API access control
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
  scopes: text("scopes").array().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("api_keys_project_idx").on(table.projectId),
  index("api_keys_key_hash_idx").on(table.keyHash),
]);

// RunLog table for runtime logging
export const runLogs = pgTable("run_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  nodeId: varchar("node_id", { length: 100 }),
  level: logLevelEnum("level").notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("run_logs_run_idx").on(table.runId),
  index("run_logs_level_idx").on(table.level),
  index("run_logs_created_at_idx").on(table.createdAt),
]);

// =====================================================================
// STAGE 14: REVIEW & E-SIGNATURE TABLES
// =====================================================================

// Review tasks table for human review gates
export const reviewTasks = pgTable("review_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  nodeId: text("node_id").notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  status: reviewTaskStatusEnum("status").default('pending').notNull(),
  reviewerId: varchar("reviewer_id").references(() => users.id, { onDelete: 'set null' }),
  reviewerEmail: varchar("reviewer_email", { length: 255 }),
  message: text("message"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("review_tasks_run_idx").on(table.runId),
  index("review_tasks_workflow_idx").on(table.workflowId),
  index("review_tasks_node_idx").on(table.nodeId),
  index("review_tasks_status_idx").on(table.status),
  index("review_tasks_tenant_idx").on(table.tenantId),
  index("review_tasks_project_idx").on(table.projectId),
  index("review_tasks_reviewer_idx").on(table.reviewerId),
]);

// Signature requests table for e-signature workflows
export const signatureRequests = pgTable("signature_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  nodeId: text("node_id").notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  signerEmail: varchar("signer_email", { length: 255 }).notNull(),
  signerName: varchar("signer_name", { length: 255 }),
  status: signatureRequestStatusEnum("status").default('pending').notNull(),
  provider: signatureProviderEnum("provider").default('native').notNull(),
  providerRequestId: text("provider_request_id"),
  token: text("token").notNull().unique(),
  documentUrl: text("document_url"),
  redirectUrl: text("redirect_url"),
  message: text("message"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  signedAt: timestamp("signed_at"),
}, (table) => [
  index("signature_requests_run_idx").on(table.runId),
  index("signature_requests_workflow_idx").on(table.workflowId),
  index("signature_requests_node_idx").on(table.nodeId),
  index("signature_requests_status_idx").on(table.status),
  index("signature_requests_tenant_idx").on(table.tenantId),
  index("signature_requests_project_idx").on(table.projectId),
  index("signature_requests_token_idx").on(table.token),
]);

// Signature events table for audit logging
export const signatureEvents = pgTable("signature_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  signatureRequestId: uuid("signature_request_id").references(() => signatureRequests.id, { onDelete: 'cascade' }).notNull(),
  type: signatureEventTypeEnum("type").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  payload: jsonb("payload"),
}, (table) => [
  index("signature_events_request_idx").on(table.signatureRequestId),
  index("signature_events_type_idx").on(table.type),
]);

// Sections table (equivalent to survey pages)
export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  order: integer("order").notNull(),
  // Stage 20 PR 2: Page-level conditional logic
  visibleIf: jsonb("visible_if"), // Condition expression for visibility
  skipIf: jsonb("skip_if"), // Condition expression for skip logic
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  alias: text("alias"), // Optional human-friendly variable name for logic/blocks
  order: integer("order").notNull(),
  isVirtual: boolean("is_virtual").default(false).notNull(), // Virtual steps are hidden from UI
  // Stage 20 PR 3: Question-level conditional logic
  visibleIf: jsonb("visible_if"), // Condition expression for question visibility
  // Stage 20 PR 4: Repeater configuration
  repeaterConfig: jsonb("repeater_config"), // Configuration for repeater fields
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("steps_section_idx").on(table.sectionId),
  index("steps_is_virtual_idx").on(table.isVirtual),
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("logic_rules_workflow_idx").on(table.workflowId),
  index("logic_rules_condition_step_idx").on(table.conditionStepId),
]);

// Workflow runs table (execution instances)
// Runs are now independent of participants - they can be creator-started or anonymous
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  runToken: text("run_token").notNull().unique(), // UUID token for run-specific auth
  createdBy: text("created_by"), // "creator:<userId>" or "anon"
  currentSectionId: uuid("current_section_id").references(() => sections.id), // Track current section in workflow execution
  progress: integer("progress").default(0), // Progress percentage (0-100)
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"), // Run-specific metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workflow_runs_workflow_idx").on(table.workflowId),
  index("workflow_runs_completed_idx").on(table.completed),
  index("workflow_runs_run_token_idx").on(table.runToken),
  index("workflow_runs_current_section_idx").on(table.currentSectionId),
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
export const blockTypeEnum = pgEnum('block_type', [
  'prefill',
  'validate',
  'branch',
  'create_record',  // Stage 19: Create record in collection
  'update_record',  // Stage 19: Update existing record
  'find_record',    // Stage 19: Query and find records
  'delete_record',  // Stage 19: Delete record from collection
]);

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
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  domains: many(tenantDomains), // Stage 17: Custom domains
  collections: many(collections), // Stage 19: Collections/Datastore
  records: many(records), // Stage 19: Records
}));

// Stage 17: Tenant domains relations
export const tenantDomainsRelations = relations(tenantDomains, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantDomains.tenantId],
    references: [tenants.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  workflows: many(workflows),
  templates: many(templates),
  secrets: many(secrets),
  apiKeys: many(apiKeys),
  externalConnections: many(externalConnections),
}));

// Stage 19: Collections/Datastore relations
export const collectionsRelations = relations(collections, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [collections.tenantId],
    references: [tenants.id],
  }),
  fields: many(collectionFields),
  records: many(records),
}));

export const collectionFieldsRelations = relations(collectionFields, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionFields.collectionId],
    references: [collections.id],
  }),
}));

export const recordsRelations = relations(records, ({ one }) => ({
  tenant: one(tenants, {
    fields: [records.tenantId],
    references: [tenants.id],
  }),
  collection: one(collections, {
    fields: [records.collectionId],
    references: [collections.id],
  }),
  createdByUser: one(users, {
    fields: [records.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [records.updatedBy],
    references: [users.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  project: one(projects, {
    fields: [workflows.projectId],
    references: [projects.id],
  }),
  currentVersion: one(workflowVersions, {
    fields: [workflows.currentVersionId],
    references: [workflowVersions.id],
  }),
  versions: many(workflowVersions),
  sections: many(sections),
  logicRules: many(logicRules),
  runs: many(workflowRuns),
  transformBlocks: many(transformBlocks),
}));

export const workflowVersionsRelations = relations(workflowVersions, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowVersions.workflowId],
    references: [workflows.id],
  }),
  createdByUser: one(users, {
    fields: [workflowVersions.createdBy],
    references: [users.id],
  }),
  runs: many(runs),
  workflowTemplates: many(workflowTemplates), // Stage 21: Attached templates
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  project: one(projects, {
    fields: [templates.projectId],
    references: [projects.id],
  }),
  workflowTemplates: many(workflowTemplates), // Stage 21: Templates can be attached to multiple workflows
}));

// Stage 21: Workflow Templates relations
export const workflowTemplatesRelations = relations(workflowTemplates, ({ one }) => ({
  workflowVersion: one(workflowVersions, {
    fields: [workflowTemplates.workflowVersionId],
    references: [workflowVersions.id],
  }),
  template: one(templates, {
    fields: [workflowTemplates.templateId],
    references: [templates.id],
  }),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  workflowVersion: one(workflowVersions, {
    fields: [runs.workflowVersionId],
    references: [workflowVersions.id],
  }),
  createdByUser: one(users, {
    fields: [runs.createdBy],
    references: [users.id],
  }),
  logs: many(runLogs),
  outputs: many(runOutputs), // Stage 21: Run can have multiple document outputs
}));

// Stage 21: Run Outputs relations
export const runOutputsRelations = relations(runOutputs, ({ one }) => ({
  run: one(runs, {
    fields: [runOutputs.runId],
    references: [runs.id],
  }),
  workflowVersion: one(workflowVersions, {
    fields: [runOutputs.workflowVersionId],
    references: [workflowVersions.id],
  }),
}));

export const secretsRelations = relations(secrets, ({ one, many }) => ({
  project: one(projects, {
    fields: [secrets.projectId],
    references: [projects.id],
  }),
  connections: many(externalConnections),
}));

export const externalConnectionsRelations = relations(externalConnections, ({ one }) => ({
  project: one(projects, {
    fields: [externalConnections.projectId],
    references: [projects.id],
  }),
  secret: one(secrets, {
    fields: [externalConnections.secretId],
    references: [secrets.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, {
    fields: [auditEvents.actorId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.projectId],
    references: [projects.id],
  }),
}));

export const runLogsRelations = relations(runLogs, ({ one }) => ({
  run: one(runs, {
    fields: [runLogs.runId],
    references: [runs.id],
  }),
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

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
  currentSection: one(sections, {
    fields: [workflowRuns.currentSectionId],
    references: [sections.id],
  }),
  stepValues: many(stepValues),
  transformBlockRuns: many(transformBlockRuns),
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
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTenantDomainSchema = createInsertSchema(tenantDomains).omit({ id: true, createdAt: true, updatedAt: true }); // Stage 17
export const insertEmailTemplateMetadataSchema = createInsertSchema(emailTemplateMetadata).omit({ id: true, createdAt: true, updatedAt: true }); // Stage 17
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkflowSchema = createInsertSchema(workflows).omit({ id: true, createdAt: true, updatedAt: true, currentVersionId: true });
export const insertWorkflowVersionSchema = createInsertSchema(workflowVersions).omit({ id: true, createdAt: true, updatedAt: true, publishedAt: true });
export const insertTemplateSchema = createInsertSchema(templates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkflowTemplateSchema = createInsertSchema(workflowTemplates).omit({ id: true, createdAt: true, updatedAt: true }); // Stage 21
export const insertRunSchema = createInsertSchema(runs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRunOutputSchema = createInsertSchema(runOutputs).omit({ id: true, createdAt: true, updatedAt: true }); // Stage 21
export const insertSecretSchema = createInsertSchema(secrets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExternalConnectionSchema = createInsertSchema(externalConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, ts: true, createdAt: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, updatedAt: true, lastUsedAt: true });
export const insertRunLogSchema = createInsertSchema(runLogs).omit({ id: true, createdAt: true });

// Stage 14: Review & E-Signature insert schemas
export const insertReviewTaskSchema = createInsertSchema(reviewTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSignatureRequestSchema = createInsertSchema(signatureRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSignatureEventSchema = createInsertSchema(signatureEvents).omit({ id: true, timestamp: true });

// Stage 19: Collections/Datastore insert schemas
export const insertCollectionSchema = createInsertSchema(collections).omit({ id: true, createdAt: true, updatedAt: true }).strict();
export const insertCollectionFieldSchema = createInsertSchema(collectionFields).omit({ id: true, createdAt: true, updatedAt: true }).strict();
export const insertRecordSchema = createInsertSchema(records).omit({ id: true, createdAt: true, updatedAt: true }).strict();

export const insertSectionSchema = createInsertSchema(sections).omit({ id: true, createdAt: true });
export const insertStepSchema = createInsertSchema(steps).omit({ id: true, createdAt: true });
export const insertLogicRuleSchema = createInsertSchema(logicRules).omit({ id: true, createdAt: true });
export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({ id: true, createdAt: true, updatedAt: true, runToken: true });
export const insertStepValueSchema = createInsertSchema(stepValues).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBlockSchema = createInsertSchema(blocks).omit({ id: true, createdAt: true, updatedAt: true });

// Transform block language enum
export const transformBlockLanguageEnum = pgEnum('transform_block_language', ['javascript', 'python']);

// Transform block run status enum
export const transformBlockRunStatusEnum = pgEnum('transform_block_run_status', ['success', 'timeout', 'error']);

// Transform blocks table (custom logic execution)
export const transformBlocks = pgTable("transform_blocks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }), // nullable - can be workflow-scoped
  name: varchar("name").notNull(),
  language: transformBlockLanguageEnum("language").notNull(),
  phase: blockPhaseEnum("phase").notNull().default('onSectionSubmit'), // Execution phase
  code: text("code").notNull(), // User-supplied function body or script
  inputKeys: text("input_keys").array().notNull(), // Whitelisted keys read from data
  outputKey: varchar("output_key").notNull(), // Single key to write back to data
  virtualStepId: uuid("virtual_step_id").references(() => steps.id, { onDelete: 'set null' }), // Link to virtual step that stores output
  enabled: boolean("enabled").default(true).notNull(),
  order: integer("order").notNull(),
  timeoutMs: integer("timeout_ms").default(1000), // Default 1000ms
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("transform_blocks_workflow_idx").on(table.workflowId),
  index("transform_blocks_workflow_order_idx").on(table.workflowId, table.order),
  index("transform_blocks_phase_idx").on(table.workflowId, table.phase),
  index("transform_blocks_virtual_step_idx").on(table.virtualStepId),
]);

// Transform block runs table (audit log)
export const transformBlockRuns = pgTable("transform_block_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
  blockId: uuid("block_id").references(() => transformBlocks.id, { onDelete: 'cascade' }).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: transformBlockRunStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  outputSample: jsonb("output_sample"), // Sample of output for auditing
}, (table) => [
  index("transform_block_runs_run_idx").on(table.runId),
  index("transform_block_runs_block_idx").on(table.blockId),
]);

// Transform Blocks Relations
export const transformBlocksRelations = relations(transformBlocks, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [transformBlocks.workflowId],
    references: [workflows.id],
  }),
  runs: many(transformBlockRuns),
}));

export const transformBlockRunsRelations = relations(transformBlockRuns, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [transformBlockRuns.runId],
    references: [workflowRuns.id],
  }),
  block: one(transformBlocks, {
    fields: [transformBlockRuns.blockId],
    references: [transformBlocks.id],
  }),
}));

// Transform Blocks Insert Schemas
export const insertTransformBlockSchema = createInsertSchema(transformBlocks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTransformBlockRunSchema = createInsertSchema(transformBlockRuns).omit({ id: true, startedAt: true });

// ===================================================================
// TEAMS & SHARING (Epic 4)
// ===================================================================

// Teams table
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("teams_created_by_idx").on(table.createdBy),
]);

// Team members table
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text("role").notNull().default("member"), // 'member' | 'admin'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("team_members_team_idx").on(table.teamId),
  index("team_members_user_idx").on(table.userId),
  index("team_members_team_user_idx").on(table.teamId, table.userId),
]);

// Project access (ACL) table
export const projectAccess = pgTable("project_access", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  principalType: text("principal_type").notNull(), // 'user' | 'team'
  principalId: uuid("principal_id").notNull(), // users.id or teams.id
  role: text("role").notNull(), // 'view' | 'edit' | 'owner'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("project_access_project_idx").on(table.projectId),
  index("project_access_principal_idx").on(table.principalType, table.principalId),
]);

// Workflow access (ACL) table
export const workflowAccess = pgTable("workflow_access", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  principalType: text("principal_type").notNull(), // 'user' | 'team'
  principalId: uuid("principal_id").notNull(), // users.id or teams.id
  role: text("role").notNull(), // 'view' | 'edit' | 'owner'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("workflow_access_workflow_idx").on(table.workflowId),
  index("workflow_access_principal_idx").on(table.principalType, table.principalId),
]);

// Teams Relations
export const teamsRelations = relations(teams, ({ one, many }) => ({
  creator: one(users, {
    fields: [teams.createdBy],
    references: [users.id],
  }),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const projectAccessRelations = relations(projectAccess, ({ one }) => ({
  project: one(projects, {
    fields: [projectAccess.projectId],
    references: [projects.id],
  }),
}));

export const workflowAccessRelations = relations(workflowAccess, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowAccess.workflowId],
    references: [workflows.id],
  }),
}));

// Teams & ACL Insert Schemas
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, createdAt: true });
export const insertProjectAccessSchema = createInsertSchema(projectAccess).omit({ id: true, createdAt: true });
export const insertWorkflowAccessSchema = createInsertSchema(workflowAccess).omit({ id: true, createdAt: true });

// ===================================================================
// REAL-TIME COLLABORATION (Stage 7B)
// ===================================================================

// Collaboration documents table
export const collabDocs = pgTable("collab_docs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'set null' }), // nullable - used for draft by default
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("collab_docs_workflow_idx").on(table.workflowId),
  index("collab_docs_tenant_idx").on(table.tenantId),
  index("collab_docs_version_idx").on(table.versionId),
]);

// Collaboration updates table (append-only log)
export const collabUpdates = pgTable("collab_updates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: uuid("doc_id").references(() => collabDocs.id, { onDelete: 'cascade' }).notNull(),
  seq: integer("seq").notNull(), // Sequential number for ordering
  update: text("update").notNull(), // Base64-encoded Yjs update
  ts: timestamp("ts").defaultNow().notNull(),
}, (table) => [
  index("collab_updates_doc_seq_idx").on(table.docId, table.seq),
  index("collab_updates_doc_ts_idx").on(table.docId, table.ts),
]);

// Collaboration snapshots table
export const collabSnapshots = pgTable("collab_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: uuid("doc_id").references(() => collabDocs.id, { onDelete: 'cascade' }).notNull(),
  clock: integer("clock").notNull(), // Logical clock / seq number at snapshot time
  state: text("state").notNull(), // Base64-encoded Yjs state
  ts: timestamp("ts").defaultNow().notNull(),
}, (table) => [
  index("collab_snapshots_doc_clock_idx").on(table.docId, table.clock),
  index("collab_snapshots_doc_ts_idx").on(table.docId, table.ts),
]);

// Collaboration Relations
export const collabDocsRelations = relations(collabDocs, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [collabDocs.workflowId],
    references: [workflows.id],
  }),
  version: one(workflowVersions, {
    fields: [collabDocs.versionId],
    references: [workflowVersions.id],
  }),
  tenant: one(tenants, {
    fields: [collabDocs.tenantId],
    references: [tenants.id],
  }),
  updates: many(collabUpdates),
  snapshots: many(collabSnapshots),
}));

export const collabUpdatesRelations = relations(collabUpdates, ({ one }) => ({
  doc: one(collabDocs, {
    fields: [collabUpdates.docId],
    references: [collabDocs.id],
  }),
}));

export const collabSnapshotsRelations = relations(collabSnapshots, ({ one }) => ({
  doc: one(collabDocs, {
    fields: [collabSnapshots.docId],
    references: [collabDocs.id],
  }),
}));

// Collaboration Insert Schemas
export const insertCollabDocSchema = createInsertSchema(collabDocs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCollabUpdateSchema = createInsertSchema(collabUpdates).omit({ id: true, ts: true });
export const insertCollabSnapshotSchema = createInsertSchema(collabSnapshots).omit({ id: true, ts: true });

// Collaboration Types
export type CollabDoc = typeof collabDocs.$inferSelect;
export type InsertCollabDoc = typeof insertCollabDocSchema._type;
export type CollabUpdate = typeof collabUpdates.$inferSelect;
export type InsertCollabUpdate = typeof insertCollabUpdateSchema._type;
export type CollabSnapshot = typeof collabSnapshots.$inferSelect;
export type InsertCollabSnapshot = typeof insertCollabSnapshotSchema._type;

// ===================================================================
// ANALYTICS & SLIs (Stage 11)
// ===================================================================

// Metrics event type enum
export const metricsEventTypeEnum = pgEnum('metrics_event_type', [
  'run_started',
  'run_succeeded',
  'run_failed',
  'pdf_succeeded',
  'pdf_failed',
  'docx_succeeded',
  'docx_failed',
  'queue_enqueued',
  'queue_dequeued'
]);

// Rollup bucket size enum
export const rollupBucketEnum = pgEnum('rollup_bucket', ['1m', '5m', '1h', '1d']);

// SLI window enum
export const sliWindowEnum = pgEnum('sli_window', ['1d', '7d', '30d']);

// Metrics events table (raw event stream)
export const metricsEvents = pgTable("metrics_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
  runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'set null' }),
  type: metricsEventTypeEnum("type").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().default(sql`now()`),
  durationMs: integer("duration_ms"), // For run_* events
  payload: jsonb("payload").default(sql`'{}'::jsonb`), // Small structured context, redacted
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("metrics_events_project_ts_idx").on(table.projectId, table.ts),
  index("metrics_events_workflow_ts_idx").on(table.workflowId, table.ts),
  index("metrics_events_type_idx").on(table.type),
  index("metrics_events_tenant_idx").on(table.tenantId),
  index("metrics_events_run_idx").on(table.runId),
]);

// Metrics rollup table (aggregated metrics by time bucket)
export const metricsRollups = pgTable("metrics_rollups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
  bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
  bucket: rollupBucketEnum("bucket").notNull(),
  runsCount: integer("runs_count").default(0).notNull(),
  runsSuccess: integer("runs_success").default(0).notNull(),
  runsError: integer("runs_error").default(0).notNull(),
  durP50: integer("dur_p50"), // Median duration in ms
  durP95: integer("dur_p95"), // P95 duration in ms
  pdfSuccess: integer("pdf_success").default(0).notNull(),
  pdfError: integer("pdf_error").default(0).notNull(),
  docxSuccess: integer("docx_success").default(0).notNull(),
  docxError: integer("docx_error").default(0).notNull(),
  queueEnqueued: integer("queue_enqueued").default(0).notNull(),
  queueDequeued: integer("queue_dequeued").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Unique index for upsert operations (includes COALESCE for nullable workflow_id)
  uniqueIndex("metrics_rollups_unique_idx").on(
    table.tenantId,
    table.projectId,
    sql`COALESCE(${table.workflowId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    table.bucketStart,
    table.bucket
  ),
  index("metrics_rollups_project_bucket_idx").on(table.projectId, table.bucketStart, table.bucket),
  index("metrics_rollups_workflow_bucket_idx").on(table.workflowId, table.bucketStart, table.bucket),
  index("metrics_rollups_tenant_idx").on(table.tenantId),
]);

// SLI configuration table
export const sliConfigs = pgTable("sli_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
  targetSuccessPct: integer("target_success_pct").default(99).notNull(), // e.g., 99
  targetP95Ms: integer("target_p95_ms").default(5000).notNull(), // e.g., 5000ms
  errorBudgetPct: integer("error_budget_pct").default(1).notNull(), // e.g., 1% allowed error
  window: sliWindowEnum("window").default('7d').notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sli_configs_project_idx").on(table.projectId),
  index("sli_configs_workflow_idx").on(table.workflowId),
  index("sli_configs_tenant_idx").on(table.tenantId),
]);

// SLI window table (computed SLI metrics for time windows)
export const sliWindows = pgTable("sli_windows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  successPct: integer("success_pct"), // Success percentage (0-100)
  p95Ms: integer("p95_ms"), // P95 duration in ms
  errorBudgetBurnPct: integer("error_budget_burn_pct"), // How much budget burned (0-100+)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sli_windows_project_window_idx").on(table.projectId, table.windowStart, table.windowEnd),
  index("sli_windows_workflow_window_idx").on(table.workflowId, table.windowStart, table.windowEnd),
  index("sli_windows_tenant_idx").on(table.tenantId),
]);

// =====================================================================
// DATAVAULT TABLES (Phase 1)
// =====================================================================

// DataVault Databases - database containers for organizing tables
export const datavaultDatabases = pgTable("datavault_databases", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  scopeType: datavaultScopeTypeEnum("scope_type").notNull().default('account'),
  scopeId: uuid("scope_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_databases_tenant").on(table.tenantId),
  index("idx_databases_scope").on(table.scopeType, table.scopeId),
  index("idx_databases_updated").on(table.updatedAt),
]);

// DataVault Tables - tenant-scoped table definitions
export const datavaultTables = pgTable("datavault_tables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: 'cascade' }),
  databaseId: uuid("database_id").references(() => datavaultDatabases.id, { onDelete: 'set null' }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("datavault_tables_tenant_idx").on(table.tenantId),
  index("datavault_tables_owner_idx").on(table.ownerUserId),
  index("idx_tables_database").on(table.databaseId, table.tenantId),
  uniqueIndex("datavault_tables_tenant_slug_unique").on(table.tenantId, table.slug),
]);

// DataVault Columns - column definitions for tables
export const datavaultColumns = pgTable("datavault_columns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: datavaultColumnTypeEnum("type").notNull(),
  description: text("description"),  // Column description (shown as tooltip)
  widthPx: integer("width_px").default(150),  // Column width in pixels for UI
  required: boolean("required").default(false).notNull(),
  isPrimaryKey: boolean("is_primary_key").default(false).notNull(),  // Primary key column (one per table)
  isUnique: boolean("is_unique").default(false).notNull(),  // Unique constraint on column values
  orderIndex: integer("order_index").notNull().default(0),
  autoNumberStart: integer("auto_number_start").default(1),  // Starting value for auto_number columns
  referenceTableId: uuid("reference_table_id"),  // Reference to another datavault table (for 'reference' type columns)
  referenceDisplayColumnSlug: text("reference_display_column_slug"),  // Slug of column to display from referenced table
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("datavault_columns_table_idx").on(table.tableId),
  index("datavault_columns_reference_table_idx").on(table.referenceTableId),
  uniqueIndex("datavault_columns_table_slug_unique").on(table.tableId, table.slug),
]);

// DataVault Rows - data rows in tables
export const datavaultRows = pgTable("datavault_rows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
  deletedAt: timestamp("deleted_at"),  // Soft delete timestamp (NULL = active)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index("datavault_rows_table_idx").on(table.tableId),
  index("datavault_rows_created_by_idx").on(table.createdBy),
]);

// DataVault Values - cell values in rows
export const datavaultValues = pgTable("datavault_values", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  rowId: uuid("row_id").references(() => datavaultRows.id, { onDelete: 'cascade' }).notNull(),
  columnId: uuid("column_id").references(() => datavaultColumns.id, { onDelete: 'cascade' }).notNull(),
  value: jsonb("value"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("datavault_values_row_idx").on(table.rowId),
  index("datavault_values_column_idx").on(table.columnId),
  uniqueIndex("datavault_values_row_column_unique").on(table.rowId, table.columnId),
]);

// Analytics Relations
export const metricsEventsRelations = relations(metricsEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [metricsEvents.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [metricsEvents.projectId],
    references: [projects.id],
  }),
  workflow: one(workflows, {
    fields: [metricsEvents.workflowId],
    references: [workflows.id],
  }),
  run: one(workflowRuns, {
    fields: [metricsEvents.runId],
    references: [workflowRuns.id],
  }),
}));

export const metricsRollupsRelations = relations(metricsRollups, ({ one }) => ({
  tenant: one(tenants, {
    fields: [metricsRollups.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [metricsRollups.projectId],
    references: [projects.id],
  }),
  workflow: one(workflows, {
    fields: [metricsRollups.workflowId],
    references: [workflows.id],
  }),
}));

export const sliConfigsRelations = relations(sliConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [sliConfigs.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [sliConfigs.projectId],
    references: [projects.id],
  }),
  workflow: one(workflows, {
    fields: [sliConfigs.workflowId],
    references: [workflows.id],
  }),
}));

export const sliWindowsRelations = relations(sliWindows, ({ one }) => ({
  tenant: one(tenants, {
    fields: [sliWindows.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [sliWindows.projectId],
    references: [projects.id],
  }),
  workflow: one(workflows, {
    fields: [sliWindows.workflowId],
    references: [workflows.id],
  }),
}));

// DataVault Relations
export const datavaultDatabasesRelations = relations(datavaultDatabases, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [datavaultDatabases.tenantId],
    references: [tenants.id],
  }),
  tables: many(datavaultTables),
}));

export const datavaultTablesRelations = relations(datavaultTables, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [datavaultTables.tenantId],
    references: [tenants.id],
  }),
  owner: one(users, {
    fields: [datavaultTables.ownerUserId],
    references: [users.id],
  }),
  database: one(datavaultDatabases, {
    fields: [datavaultTables.databaseId],
    references: [datavaultDatabases.id],
  }),
  columns: many(datavaultColumns),
  rows: many(datavaultRows),
}));

export const datavaultColumnsRelations = relations(datavaultColumns, ({ one, many }) => ({
  table: one(datavaultTables, {
    fields: [datavaultColumns.tableId],
    references: [datavaultTables.id],
  }),
  values: many(datavaultValues),
}));

export const datavaultRowsRelations = relations(datavaultRows, ({ one, many }) => ({
  table: one(datavaultTables, {
    fields: [datavaultRows.tableId],
    references: [datavaultTables.id],
  }),
  createdByUser: one(users, {
    fields: [datavaultRows.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [datavaultRows.updatedBy],
    references: [users.id],
  }),
  values: many(datavaultValues),
}));

export const datavaultValuesRelations = relations(datavaultValues, ({ one }) => ({
  row: one(datavaultRows, {
    fields: [datavaultValues.rowId],
    references: [datavaultRows.id],
  }),
  column: one(datavaultColumns, {
    fields: [datavaultValues.columnId],
    references: [datavaultColumns.id],
  }),
}));

// Analytics Insert Schemas
export const insertMetricsEventSchema = createInsertSchema(metricsEvents).omit({ id: true, createdAt: true });
export const insertMetricsRollupSchema = createInsertSchema(metricsRollups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSliConfigSchema = createInsertSchema(sliConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSliWindowSchema = createInsertSchema(sliWindows).omit({ id: true, createdAt: true });

// Analytics Types
export type MetricsEvent = typeof metricsEvents.$inferSelect;
export type InsertMetricsEvent = typeof insertMetricsEventSchema._type;
export type MetricsRollup = typeof metricsRollups.$inferSelect;
export type InsertMetricsRollup = typeof insertMetricsRollupSchema._type;
export type SliConfig = typeof sliConfigs.$inferSelect;
export type InsertSliConfig = typeof insertSliConfigSchema._type;
export type SliWindow = typeof sliWindows.$inferSelect;
export type InsertSliWindow = typeof insertSliWindowSchema._type;

// DataVault Insert Schemas
export const insertDatavaultDatabaseSchema = createInsertSchema(datavaultDatabases)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertDatavaultTableSchema = createInsertSchema(datavaultTables)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    slug: z.string().optional()  // Override: slug is auto-generated by service layer if not provided
  });

export const insertDatavaultColumnSchema = createInsertSchema(datavaultColumns)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    slug: z.string().optional()  // Override: slug is auto-generated by service layer if not provided
  });
export const insertDatavaultRowSchema = createInsertSchema(datavaultRows).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDatavaultValueSchema = createInsertSchema(datavaultValues).omit({ id: true, createdAt: true, updatedAt: true });

// DataVault Types
export type DatavaultDatabase = typeof datavaultDatabases.$inferSelect;
export type InsertDatavaultDatabase = typeof insertDatavaultDatabaseSchema._type;
export type DatavaultScopeType = typeof datavaultScopeTypeEnum.enumValues[number];
export type DatavaultTable = typeof datavaultTables.$inferSelect;
export type InsertDatavaultTable = typeof insertDatavaultTableSchema._type;
export type DatavaultColumn = typeof datavaultColumns.$inferSelect;
export type InsertDatavaultColumn = typeof insertDatavaultColumnSchema._type;
export type DatavaultRow = typeof datavaultRows.$inferSelect;
export type InsertDatavaultRow = typeof insertDatavaultRowSchema._type;
export type DatavaultValue = typeof datavaultValues.$inferSelect;
export type InsertDatavaultValue = typeof insertDatavaultValueSchema._type;

// ===================================================================
// LEGACY TYPES
// ===================================================================

// Vault-Logic Types
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof insertTenantSchema._type;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof insertProjectSchema._type;
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof insertWorkflowSchema._type;
export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type InsertWorkflowVersion = typeof insertWorkflowVersionSchema._type;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof insertTemplateSchema._type;
export type WorkflowTemplate = typeof workflowTemplates.$inferSelect; // Stage 21
export type InsertWorkflowTemplate = typeof insertWorkflowTemplateSchema._type; // Stage 21
export type Run = typeof runs.$inferSelect;
export type InsertRun = typeof insertRunSchema._type;
export type RunOutput = typeof runOutputs.$inferSelect; // Stage 21
export type InsertRunOutput = typeof insertRunOutputSchema._type; // Stage 21
export type Secret = typeof secrets.$inferSelect;
export type InsertSecret = typeof insertSecretSchema._type;
export type ExternalConnection = typeof externalConnections.$inferSelect;
export type InsertExternalConnection = typeof insertExternalConnectionSchema._type;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof insertAuditEventSchema._type;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof insertApiKeySchema._type;
export type RunLog = typeof runLogs.$inferSelect;
export type InsertRunLog = typeof insertRunLogSchema._type;

// Stage 14: Review & E-Signature types
export type ReviewTask = typeof reviewTasks.$inferSelect;
export type InsertReviewTask = typeof insertReviewTaskSchema._type;
export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type InsertSignatureRequest = typeof insertSignatureRequestSchema._type;
export type SignatureEvent = typeof signatureEvents.$inferSelect;
export type InsertSignatureEvent = typeof insertSignatureEventSchema._type;

// Stage 19: Collections/Datastore types
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = typeof insertCollectionSchema._type;
export type CollectionField = typeof collectionFields.$inferSelect;
export type InsertCollectionField = typeof insertCollectionFieldSchema._type;
export type CollectionRecord = typeof records.$inferSelect;
export type InsertCollectionRecord = typeof insertRecordSchema._type;
export type InsertRecord = InsertCollectionRecord; // Alias for convenience

export type Section = typeof sections.$inferSelect;
export type InsertSection = typeof insertSectionSchema._type;
export type Step = typeof steps.$inferSelect;
export type InsertStep = typeof insertStepSchema._type;
export type LogicRule = typeof logicRules.$inferSelect;
export type InsertLogicRule = typeof insertLogicRuleSchema._type;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof insertWorkflowRunSchema._type;
export type StepValue = typeof stepValues.$inferSelect;
export type InsertStepValue = typeof insertStepValueSchema._type;
export type TransformBlock = typeof transformBlocks.$inferSelect;
export type InsertTransformBlock = typeof insertTransformBlockSchema._type;
export type TransformBlockRun = typeof transformBlockRuns.$inferSelect;
export type InsertTransformBlockRun = typeof insertTransformBlockRunSchema._type;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = typeof insertBlockSchema._type;

// Teams & Sharing Types
export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof insertTeamSchema._type;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof insertTeamMemberSchema._type;
export type ProjectAccess = typeof projectAccess.$inferSelect;
export type InsertProjectAccess = typeof insertProjectAccessSchema._type;
export type WorkflowAccess = typeof workflowAccess.$inferSelect;
export type InsertWorkflowAccess = typeof insertWorkflowAccessSchema._type;

// ACL role types
export type AccessRole = 'view' | 'edit' | 'owner' | 'none';
export type PrincipalType = 'user' | 'team';
export type TeamRole = 'member' | 'admin';

// Workflow variable type (for step aliases and variable references)
export interface WorkflowVariable {
  key: string;           // canonical step ID
  alias?: string | null; // human-friendly variable name
  label: string;         // step title
  type: string;          // step type
  sectionId: string;
  sectionTitle: string;  // section title for grouping
  stepId: string;
}
