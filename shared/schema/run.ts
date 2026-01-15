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

import { users, tenants } from './auth';
import { projects, workflows, workflowVersions, sections, steps, templates, workflowTemplates, transformBlocks } from './workflow';

// ===================================================================
// ENUMS
// ===================================================================

export const runStatusEnum = pgEnum('run_status', ['pending', 'success', 'error', 'waiting_review', 'waiting_signature']);
export const logLevelEnum = pgEnum('log_level', ['info', 'warn', 'error']);

// Stage 14: Review & E-Signature Enums
export const reviewTaskStatusEnum = pgEnum('review_task_status', ['pending', 'approved', 'changes_requested', 'rejected']);
export const signatureRequestStatusEnum = pgEnum('signature_request_status', ['pending', 'signed', 'declined', 'expired']);
export const signatureProviderEnum = pgEnum('signature_provider', ['native', 'docusign', 'hellosign']);
export const signatureEventTypeEnum = pgEnum('signature_event_type', ['sent', 'viewed', 'signed', 'declined']);

// Stage 21: Output Enums
export const outputStatusEnum = pgEnum('output_status', ['pending', 'ready', 'failed']);
export const outputFileTypeEnum = pgEnum('output_file_type', ['docx', 'pdf']);

export const transformBlockRunStatusEnum = pgEnum('transform_block_run_status', ['success', 'timeout', 'error']);
export const scriptExecutionStatusEnum = pgEnum('script_execution_status', ['success', 'error', 'timeout']);

export const portalAccessModeEnum = pgEnum('portal_access_mode', ['anonymous', 'token', 'portal']);

// Analytics Enums
export const metricsEventTypeEnum = pgEnum('metrics_event_type', ['run_started', 'run_succeeded', 'run_failed', 'pdf_succeeded', 'pdf_failed', 'docx_succeeded', 'docx_failed', 'queue_enqueued', 'queue_dequeued']);
export const rollupBucketEnum = pgEnum('rollup_bucket', ['1m', '5m', '1h', '1d']);
export const sliWindowEnum = pgEnum('sli_window', ['1d', '7d', '30d']);

// ===================================================================
// TABLES
// ===================================================================

// Legacy Run table (Deprecated?)
export const runs = pgTable("runs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    inputJson: jsonb("input_json"),
    outputRefs: jsonb("output_refs"),
    trace: jsonb("trace"),
    status: runStatusEnum("status").default('pending').notNull(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    runToken: varchar("run_token").unique(),
    shareToken: varchar("share_token").unique(),
    shareTokenExpiresAt: timestamp("share_token_expires_at"),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("runs_workflow_version_idx").on(table.workflowVersionId),
    index("runs_status_idx").on(table.status),
    index("runs_created_by_idx").on(table.createdBy),
    index("runs_created_at_idx").on(table.createdAt),
]);

// Workflow runs table (Modern Execution Instances)
export const workflowRuns = pgTable("workflow_runs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }),
    runToken: text("run_token").notNull().unique(),
    createdBy: text("created_by"), // "creator:<userId>" or "anon"
    currentSectionId: uuid("current_section_id").references(() => sections.id, { onDelete: 'set null' }),
    progress: integer("progress").default(0),
    completed: boolean("completed").default(false),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // Portal access
    clientEmail: varchar("client_email"),
    portalAccessKey: varchar("portal_access_key"),
    accessMode: portalAccessModeEnum("access_mode").default('anonymous'),
    shareToken: varchar("share_token").unique(),
    shareTokenExpiresAt: timestamp("share_token_expires_at"),
    ownerType: varchar("owner_type", { length: 50 }),
    ownerUuid: uuid("owner_uuid"),
}, (table) => [
    index("workflow_runs_workflow_idx").on(table.workflowId),
    index("workflow_runs_version_idx").on(table.workflowVersionId),
    index("workflow_runs_completed_idx").on(table.completed),
    index("workflow_runs_run_token_idx").on(table.runToken),
    index("workflow_runs_share_token_idx").on(table.shareToken),
    index("workflow_runs_current_section_idx").on(table.currentSectionId),
    index("workflow_runs_created_at_idx").on(table.createdAt),
    index("workflow_runs_owner_idx").on(table.ownerType, table.ownerUuid),
]);

// Step values (Answers)
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
    index("step_values_run_step_idx").on(table.runId, table.stepId),
    uniqueIndex("step_values_run_step_unique").on(table.runId, table.stepId),
]);

// Run Logs
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

// Review Tasks
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
    index("review_tasks_status_idx").on(table.status),
    index("review_tasks_reviewer_idx").on(table.reviewerId),
]);

// Signature Requests
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
    index("signature_requests_token_idx").on(table.token),
]);

// Signature Events
export const signatureEvents = pgTable("signature_events", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    signatureRequestId: uuid("signature_request_id").references(() => signatureRequests.id, { onDelete: 'cascade' }).notNull(),
    type: signatureEventTypeEnum("type").notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    payload: jsonb("payload"),
}, (table) => [
    index("signature_events_request_idx").on(table.signatureRequestId),
]);

// Run Outputs
export const runOutputs = pgTable("run_outputs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id").references(() => runs.id, { onDelete: 'cascade' }).notNull(),
    workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    templateKey: text("template_key").notNull(),
    fileType: outputFileTypeEnum("file_type").notNull(),
    storagePath: text("storage_path").notNull(),
    status: outputStatusEnum("status").default('pending').notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("run_outputs_run_idx").on(table.runId),
    index("run_outputs_run_template_type_idx").on(table.runId, table.templateKey, table.fileType),
]);

// Run Generated Documents
export const runGeneratedDocuments = pgTable("run_generated_documents", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    templateId: uuid("template_id").references(() => workflowTemplates.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("run_generated_documents_run_idx").on(table.runId),
]);

// Transform Block Runs
export const transformBlockRuns = pgTable("transform_block_runs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
    blockId: uuid("block_id").references(() => transformBlocks.id, { onDelete: 'cascade' }).notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    status: transformBlockRunStatusEnum("status").notNull(),
    errorMessage: text("error_message"),
    outputSample: jsonb("output_sample"),
}, (table) => [
    index("transform_block_runs_run_idx").on(table.runId),
    index("transform_block_runs_block_idx").on(table.blockId),
]);

// Script Execution Log
export const scriptExecutionLog = pgTable("script_execution_log", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
    scriptType: varchar("script_type", { length: 50 }).notNull(),
    scriptId: uuid("script_id").notNull(),
    scriptName: varchar("script_name", { length: 255 }),
    phase: varchar("phase", { length: 50 }),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    status: scriptExecutionStatusEnum("status").notNull(),
    errorMessage: text("error_message"),
    consoleOutput: jsonb("console_output"),
    inputSample: jsonb("input_sample"),
    outputSample: jsonb("output_sample"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("script_execution_log_run_idx").on(table.runId),
]);

// Workflow Run Events
export const workflowRunEvents = pgTable("workflow_run_events", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
    versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    blockId: varchar("block_id"),
    pageId: uuid("page_id"),
    type: varchar("type").notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    payload: jsonb("payload"),
    isPreview: boolean("is_preview").default(false).notNull(),
}, (table) => [
    index("wre_run_idx").on(table.runId),
    index("wre_workflow_ts_idx").on(table.workflowId, table.timestamp),
]);

// Workflow Run Metrics
export const workflowRunMetrics = pgTable("workflow_run_metrics", {
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).primaryKey(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    totalTimeMs: integer("total_time_ms"),
    pagesVisited: integer("pages_visited").default(0),
    blocksVisited: integer("blocks_visited").default(0),
    validationErrors: integer("validation_errors").default(0),
    scriptErrors: integer("script_errors").default(0),
    completed: boolean("completed").default(false),
    completedAt: timestamp("completed_at"),
    isPreview: boolean("is_preview").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("wrm_workflow_created_idx").on(table.workflowId, table.createdAt),
]);

// Template Generation Metrics
export const templateGenerationMetrics = pgTable("template_generation_metrics", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: 'cascade' }).notNull(),
    runId: uuid("run_id").references(() => runs.id, { onDelete: 'cascade' }),
    result: varchar("result", { length: 50 }).notNull(),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("template_metrics_template_idx").on(table.templateId),
    index("template_metrics_run_idx").on(table.runId),
]);

// AI Workflow Feedback
export const aiWorkflowFeedback = pgTable("ai_workflow_feedback", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
    operationType: varchar("operation_type").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    aiProvider: varchar("ai_provider"),
    aiModel: varchar("ai_model"),
    promptVersion: varchar("prompt_version"),
    qualityScore: integer("quality_score"),
    qualityPassed: boolean("quality_passed"),
    issuesCount: integer("issues_count"),
    requestDescription: text("request_description"),
    generatedSections: integer("generated_sections"),
    generatedSteps: integer("generated_steps"),
    wasEdited: boolean("was_edited").default(false),
    editCount: integer("edit_count").default(0),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("ai_feedback_workflow_idx").on(table.workflowId),
]);

// Workflow Analytics Snapshots
export const workflowAnalyticsSnapshots = pgTable("workflow_analytics_snapshots", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp("date").notNull(),
    summary: jsonb("summary").notNull(),
    dropoff: jsonb("dropoff").notNull(),
    branching: jsonb("branching").notNull(),
    heatmap: jsonb("heatmap").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    uniqueIndex("was_workflow_version_date_idx").on(table.workflowId, table.versionId, table.date),
]);

// Block Metrics
export const blockMetrics = pgTable("block_metrics", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    blockId: varchar("block_id").notNull(),
    totalVisits: integer("total_visits").default(0),
    avgTimeMs: integer("avg_time_ms").default(0),
    dropoffCount: integer("dropoff_count").default(0),
    validationErrorCount: integer("validation_error_count").default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("bm_version_block_idx").on(table.versionId, table.blockId),
]);

// Analytics (Metrics Events & Aggregations)
export const metricsEvents = pgTable("metrics_events", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'set null' }),
    type: metricsEventTypeEnum("type").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().default(sql`now()`),
    durationMs: integer("duration_ms"),
    payload: jsonb("payload").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("metrics_events_project_ts_idx").on(table.projectId, table.ts),
    index("metrics_events_workflow_ts_idx").on(table.workflowId, table.ts),
    index("metrics_events_type_idx").on(table.type),
]);

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
    durP50: integer("dur_p50"),
    durP95: integer("dur_p95"),
    pdfSuccess: integer("pdf_success").default(0).notNull(),
    pdfError: integer("pdf_error").default(0).notNull(),
    docxSuccess: integer("docx_success").default(0).notNull(),
    docxError: integer("docx_error").default(0).notNull(),
    queueEnqueued: integer("queue_enqueued").default(0).notNull(),
    queueDequeued: integer("queue_dequeued").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("metrics_rollups_unique_idx").on(
        table.tenantId,
        table.projectId,
        sql`COALESCE(${table.workflowId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        table.bucketStart,
        table.bucket
    ),
    index("metrics_rollups_project_bucket_idx").on(table.projectId, table.bucketStart, table.bucket),
]);

export const sliConfigs = pgTable("sli_configs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
    targetSuccessPct: integer("target_success_pct").default(99).notNull(),
    targetP95Ms: integer("target_p95_ms").default(5000).notNull(),
    errorBudgetPct: integer("error_budget_pct").default(1).notNull(),
    window: sliWindowEnum("window").default('7d').notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("sli_configs_project_idx").on(table.projectId),
]);

export const sliWindows = pgTable("sli_windows", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    successPct: integer("success_pct"),
    p95Ms: integer("p95_ms"),
    errorBudgetBurnPct: integer("error_budget_burn_pct"),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("sli_windows_project_window_idx").on(table.projectId, table.windowStart, table.windowEnd),
]);

// ===================================================================
// INSERTS & TYPES
// ===================================================================

export const insertRunSchema = createInsertSchema(runs);
export const insertWorkflowRunSchema = createInsertSchema(workflowRuns);
export const insertStepValueSchema = createInsertSchema(stepValues);
export const insertRunLogSchema = createInsertSchema(runLogs);
export const insertReviewTaskSchema = createInsertSchema(reviewTasks);
export const insertSignatureRequestSchema = createInsertSchema(signatureRequests);
export const insertSignatureEventSchema = createInsertSchema(signatureEvents);
export const insertRunOutputSchema = createInsertSchema(runOutputs);
export const insertRunGeneratedDocumentSchema = createInsertSchema(runGeneratedDocuments);
export const insertTransformBlockRunSchema = createInsertSchema(transformBlockRuns);
export const insertScriptExecutionLogSchema = createInsertSchema(scriptExecutionLog);

// Analytics Inserts
export const insertMetricsEventSchema = createInsertSchema(metricsEvents);
export const insertMetricsRollupSchema = createInsertSchema(metricsRollups);
export const insertSliConfigSchema = createInsertSchema(sliConfigs);
export const insertSliWindowSchema = createInsertSchema(sliWindows);

// Types
export type Run = InferSelectModel<typeof runs>;
export type InsertRun = InferInsertModel<typeof runs>;
export type WorkflowRun = InferSelectModel<typeof workflowRuns>;
export type InsertWorkflowRun = InferInsertModel<typeof workflowRuns>;
export type StepValue = InferSelectModel<typeof stepValues>;
export type InsertStepValue = InferInsertModel<typeof stepValues>;
export type RunLog = InferSelectModel<typeof runLogs>;
export type InsertRunLog = InferInsertModel<typeof runLogs>;
export type ReviewTask = InferSelectModel<typeof reviewTasks>;
export type InsertReviewTask = InferInsertModel<typeof reviewTasks>;
export type SignatureRequest = InferSelectModel<typeof signatureRequests>;
export type InsertSignatureRequest = InferInsertModel<typeof signatureRequests>;
export type SignatureEvent = InferSelectModel<typeof signatureEvents>;
export type InsertSignatureEvent = InferInsertModel<typeof signatureEvents>;
export type RunOutput = InferSelectModel<typeof runOutputs>;
export type InsertRunOutput = InferInsertModel<typeof runOutputs>;
export type RunGeneratedDocument = InferSelectModel<typeof runGeneratedDocuments>;
export type InsertRunGeneratedDocument = InferInsertModel<typeof runGeneratedDocuments>;
export type TransformBlockRun = InferSelectModel<typeof transformBlockRuns>;
export type InsertTransformBlockRun = InferInsertModel<typeof transformBlockRuns>;
export type ScriptExecutionLog = InferSelectModel<typeof scriptExecutionLog>;
export type InsertScriptExecutionLog = InferInsertModel<typeof scriptExecutionLog>;

export type MetricsEvent = InferSelectModel<typeof metricsEvents>;
export type InsertMetricsEvent = InferInsertModel<typeof metricsEvents>;
export type MetricsRollup = InferSelectModel<typeof metricsRollups>;
export type InsertMetricsRollup = InferInsertModel<typeof metricsRollups>;
export type SliConfig = InferSelectModel<typeof sliConfigs>;
export type InsertSliConfig = InferInsertModel<typeof sliConfigs>;
export type SliWindow = InferSelectModel<typeof sliWindows>;
export type InsertSliWindow = InferInsertModel<typeof sliWindows>;
