import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
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
import { createInsertSchema } from "drizzle-zod";
import { z } from 'zod';

import { users, workspaces, anonymousAccessTypeEnum } from './auth';
import { conditionOperatorEnum, conditionalActionEnum } from "./workflow";

// ===================================================================
// ENUMS
// ===================================================================

export const surveyStatusEnum = pgEnum('survey_status', ['draft', 'open', 'closed', 'active', 'archived']);
export const questionTypeEnum = pgEnum('question_type', [
    'short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no', 'date_time', 'file_upload', 'loop_group'
]);

export const publicAccessModeEnum = pgEnum('public_access_mode', ['open', 'link_only', 'domain_restricted']);

// ===================================================================
// TABLES
// ===================================================================

// DEPRECATED TABLES

/** @deprecated Use 'workflows' table instead */
export const surveys = pgTable("surveys", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: varchar("title").notNull(),
    description: text("description"),
    creatorId: varchar("creator_id").references(() => users.id).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    status: surveyStatusEnum("status").default('draft').notNull(),
    allowAnonymous: boolean("allow_anonymous").default(false),
    anonymousAccessType: anonymousAccessTypeEnum("anonymous_access_type").default('unlimited'),
    publicLink: varchar("public_link").unique(),
    anonymousConfig: jsonb("anonymous_config"),
    isPublic: boolean("is_public").default(false),
    publicAccessMode: publicAccessModeEnum("public_access_mode").default('link_only'),
    publicSlug: varchar("public_slug").unique(),
    allowedDomains: jsonb("allowed_domains"),
    publicSettings: jsonb("public_settings"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("surveys_public_link_unique_idx").on(table.publicLink),
    index("surveys_workspace_idx").on(table.workspaceId),
]);

/** @deprecated Use 'sections' with 'workflows' instead */
export const surveyPages = pgTable("survey_pages", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
    title: varchar("title").notNull(),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

/** @deprecated Use 'steps' table instead */
export const questions = pgTable("questions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pageId: uuid("page_id").references(() => surveyPages.id, { onDelete: 'cascade' }).notNull(),
    type: questionTypeEnum("type").notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    required: boolean("required").default(false),
    options: jsonb("options"),
    loopConfig: jsonb("loop_config"),
    conditionalLogic: jsonb("conditional_logic"),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

/** @deprecated Legacy table */
export const loopGroupSubquestions = pgTable("loop_group_subquestions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    loopQuestionId: uuid("loop_question_id").references(() => questions.id, { onDelete: 'cascade' }).notNull(),
    type: questionTypeEnum("type").notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    required: boolean("required").default(false),
    options: jsonb("options"),
    loopConfig: jsonb("loop_config"),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

export const conditionalRules = pgTable("conditional_rules", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
    conditionQuestionId: uuid("condition_question_id").references(() => questions.id, { onDelete: 'cascade' }).notNull(),
    operator: conditionOperatorEnum("operator").notNull(),
    conditionValue: jsonb("condition_value").notNull(),
    targetQuestionId: uuid("target_question_id").references(() => questions.id, { onDelete: 'cascade' }),
    targetPageId: uuid("target_page_id").references(() => surveyPages.id, { onDelete: 'cascade' }),
    action: conditionalActionEnum("action").notNull(),
    logicalOperator: varchar("logical_operator").default("AND"),
    order: integer("order").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
});

/** @deprecated Use 'workflow_runs' instead */
export const responses = pgTable("responses", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
    completed: boolean("completed").default(false),
    submittedAt: timestamp("submitted_at"),
    isAnonymous: boolean("is_anonymous").default(false),
    ipAddress: varchar("ip_address"),
    userAgent: text("user_agent"),
    sessionId: varchar("session_id"),
    anonymousMetadata: jsonb("anonymous_metadata"),
    createdAt: timestamp("created_at").defaultNow(),
});

/** @deprecated Use 'step_values' instead */
export const answers = pgTable("answers", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    responseId: uuid("response_id").references(() => responses.id, { onDelete: 'cascade' }).notNull(),
    questionId: uuid("question_id").references(() => questions.id, { onDelete: 'cascade' }).notNull(),
    subquestionId: uuid("subquestion_id").references(() => loopGroupSubquestions.id, { onDelete: 'cascade' }),
    loopIndex: integer("loop_index"),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

export const files = pgTable("files", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    answerId: uuid("answer_id").references(() => answers.id, { onDelete: 'cascade' }).notNull(),
    filename: varchar("filename").notNull(),
    originalName: varchar("original_name").notNull(),
    mimeType: varchar("mime_type").notNull(),
    size: integer("size").notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const analyticsEvents = pgTable("analytics_events", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    responseId: uuid("response_id").references(() => responses.id, { onDelete: 'cascade' }).notNull(),
    surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
    pageId: uuid("page_id").references(() => surveyPages.id, { onDelete: 'cascade' }),
    questionId: uuid("question_id").references(() => questions.id, { onDelete: 'cascade' }),
    event: varchar("event").notNull(),
    data: jsonb("data"),
    duration: integer("duration"),
    timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
    index("analytics_survey_event_idx").on(table.surveyId, table.event),
    index("analytics_response_event_idx").on(table.responseId, table.event),
    index("analytics_timestamp_idx").on(table.timestamp),
]);

export const anonymousResponseTracking = pgTable("anonymous_response_tracking", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    surveyId: uuid("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
    ipAddress: varchar("ip_address").notNull(),
    sessionId: varchar("session_id"),
    responseId: uuid("response_id").references(() => responses.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("anonymous_tracking_survey_ip_idx").on(table.surveyId, table.ipAddress),
]);


// ===================================================================
// INSERTS & TYPES
// ===================================================================

export const insertSurveySchema = createInsertSchema(surveys);
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export const insertResponseSchema = createInsertSchema(responses);
export type InsertResponse = z.infer<typeof insertResponseSchema>;

export const insertSurveyPageSchema = createInsertSchema(surveyPages);
export type InsertSurveyPage = z.infer<typeof insertSurveyPageSchema>;

export const insertQuestionSchema = createInsertSchema(questions);
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export const insertLoopGroupSubquestionSchema = createInsertSchema(loopGroupSubquestions);
export type InsertLoopGroupSubquestion = z.infer<typeof insertLoopGroupSubquestionSchema>;

export const insertAnonymousResponseTrackingSchema = createInsertSchema(anonymousResponseTracking);
export type InsertAnonymousResponseTracking = z.infer<typeof insertAnonymousResponseTrackingSchema>;

export type Survey = InferSelectModel<typeof surveys>;
export type Question = InferSelectModel<typeof questions>;
export type Response = InferSelectModel<typeof responses>;
// Email Queue
export const emailQueueStatusEnum = pgEnum('email_queue_status', ['pending', 'processing', 'completed', 'failed']);

export const emailQueue = pgTable("email_queue", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    to: varchar("to").notNull(),
    subject: varchar("subject").notNull(),
    html: text("html").notNull(),
    status: emailQueueStatusEnum("status").default('pending').notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("email_queue_status_idx").on(table.status),
    index("email_queue_next_attempt_idx").on(table.nextAttemptAt),
]);

// Survey Templates
export const surveyTemplates = pgTable("survey_templates", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description"),
    content: jsonb("content").notNull(),
    creatorId: varchar("creator_id").references(() => users.id),
    isSystem: boolean("is_system").default(false).notNull(),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("survey_templates_creator_idx").on(table.creatorId),
    index("survey_templates_system_idx").on(table.isSystem),
]);

export const templateAccessEnum = pgEnum('template_access', ['use', 'edit']);

export const templateShares = pgTable("template_shares", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id").references(() => surveyTemplates.id, { onDelete: 'cascade' }).notNull(),
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

export const insertSurveyTemplateSchema = createInsertSchema(surveyTemplates);
export const insertTemplateShareSchema = createInsertSchema(templateShares);

export type SurveyTemplate = InferSelectModel<typeof surveyTemplates>;
export type InsertSurveyTemplate = InferInsertModel<typeof surveyTemplates>;
export type TemplateShare = InferSelectModel<typeof templateShares>;
export type InsertTemplateShare = InferInsertModel<typeof templateShares>;

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

export interface QuestionAnalytics {
    questionId: string;
    questionTitle: string;
    questionType: string;
    pageId: string;
    totalResponses: number;
    totalViews: number;
    totalAnswers: number;
    totalSkips: number;
    answerRate: number; // percentage
    avgTimeSpent: number; // in seconds
    medianTimeSpent: number; // in seconds
    dropOffCount: number;
    aggregates?: Array<{ option: string; count: number; percentage: number }>;
    textAnswers?: string[];
}

export interface PageAnalytics {
    pageId: string;
    pageTitle: string;
    pageOrder: number;
    totalViews: number;
    totalCompletions: number;
    completionRate: number;
    avgTimeSpent: number;
    medianTimeSpent: number;
    dropOffCount: number;
    questions: QuestionAnalytics[];
}

export interface LoopGroupConfig {
    minIterations: number;
    maxIterations: number;
    addButtonText?: string;
    removeButtonText?: string;
    allowReorder?: boolean;
}

export interface ConditionalLogicConfig {
    enabled: boolean;
    conditions: ConditionalCondition[];
    action: 'show' | 'hide' | 'require' | 'make_optional';
    logicalOperator?: 'AND' | 'OR';
}

export interface ConditionalCondition {
    questionId: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'is_empty' | 'is_not_empty';
    value: any;
    secondValue?: any;
}

export interface QuestionWithSubquestions extends Question {
    subquestions?: any[]; // Using any[] to avoid circular ref issue with LoopGroupSubquestion if not exported yet
}

export interface QuestionWithConditionalLogic extends Question {
    conditionalRules?: any[];
}

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

export interface LoopInstanceData {
    instanceIndex: number;
    answers: Record<string, any>;
}

export interface FileUploadConfig {
    acceptedTypes: string[]; // e.g., ['image/*', '.pdf', '.doc', '.docx']
    maxFileSize: number; // in bytes
    maxFiles: number; // maximum number of files
    required: boolean;
    allowMultiple: boolean;
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
