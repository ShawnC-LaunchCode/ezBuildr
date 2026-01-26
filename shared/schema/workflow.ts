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
import { z } from "zod";

export interface FileUploadConfig {
    maxFileSize?: number;
    acceptedTypes?: string[];
    maxFiles?: number;
    allowMultiple?: boolean;
    required?: boolean;
}
import { tenants, users } from './auth';

// ===================================================================
// ENUMS
// ===================================================================

export const projectStatusEnum = pgEnum('project_status', ['active', 'archived']);
export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'archived']);
export const versionStatusEnum = pgEnum('version_status', ['draft', 'published']);
export const templateTypeEnum = pgEnum('template_type', ['docx', 'html', 'pdf']);

// Step (question) type enum
export const stepTypeEnum = pgEnum('step_type', [
    // ===== LEGACY / EXISTING TYPES =====
    'short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no', 'date_time', 'file_upload', 'loop_group',
    'computed', 'js_question', 'repeater', 'final_documents', 'signature_block',
    // ===== EASY MODE TYPES =====
    'true_false', 'phone', 'date', 'time', 'datetime', 'email', 'number', 'currency', 'scale', 'website', 'display', 'address', 'final',
    // ===== ADVANCED MODE TYPES =====
    'text', 'boolean', 'phone_advanced', 'datetime_unified', 'choice', 'email_advanced', 'number_advanced', 'scale_advanced',
    'website_advanced', 'address_advanced', 'multi_field', 'display_advanced'
]);

export const logicRuleTargetTypeEnum = pgEnum('logic_rule_target_type', ['section', 'step']);
export const conditionOperatorEnum = pgEnum('condition_operator', [
    'equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'is_empty', 'is_not_empty'
]);
export const conditionalActionEnum = pgEnum('conditional_action', ['show', 'hide', 'require', 'make_optional', 'skip_to']);

export const blockTypeEnum = pgEnum('block_type', [
    'prefill', 'validate', 'branch', 'create_record', 'update_record', 'find_record', 'delete_record',
    'query', 'write', 'external_send', 'read_table', 'list_tools'
]);
export const blockPhaseEnum = pgEnum('block_phase', ['onRunStart', 'onSectionEnter', 'onSectionSubmit', 'onNext', 'onRunComplete']);

export const transformBlockTypeEnum = pgEnum('transform_block_type', ['map', 'rename', 'compute', 'conditional', 'loop', 'script']);
export const transformBlockLanguageEnum = pgEnum('transform_block_language', ['javascript', 'python']);

export const lifecycleHookPhaseEnum = pgEnum('lifecycle_hook_phase', ['beforePage', 'afterPage', 'beforeFinalBlock', 'afterDocumentsGenerated']);
export const documentHookPhaseEnum = pgEnum('document_hook_phase', ['beforeGeneration', 'afterGeneration']);

// Owner type enum (Needed here for projects/workflows as well as auth)
// We redefine or import? Drizzle enums must be unique by name. 
// If it's defined in auth, we should import it? BUT enums in PG are global.
// Drizzle `pgEnum` creates the object mapping.
// If I import `ownerTypeEnum` from `auth`, it should work.
import { ownerTypeEnum } from './auth';

// ===================================================================
// TABLES
// ===================================================================

// Projects table
export const projects = pgTable("projects", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(), // Legacy field
    name: varchar("name", { length: 255 }), // New field
    description: text("description"),
    creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }).notNull(), // Legacy
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }), // New field
    ownerId: varchar("owner_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    ownerType: ownerTypeEnum("owner_type"),
    ownerUuid: varchar("owner_uuid"),
    status: projectStatusEnum("status").default('active').notNull(),
    archived: boolean("archived").default(false).notNull(), // DEPRECATED
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("projects_tenant_idx").on(table.tenantId),
    index("projects_created_by_idx").on(table.createdBy),
    index("projects_creator_idx").on(table.creatorId),
    index("projects_owner_idx").on(table.ownerId),
    index("idx_projects_owner").on(table.ownerType, table.ownerUuid),
    index("projects_status_idx").on(table.status),
    index("projects_archived_idx").on(table.archived),
]);

// Workflows table
export const workflows = pgTable("workflows", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Legacy fields
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'set null' }),
    ownerId: varchar("owner_id").references(() => users.id, { onDelete: 'set null' }),
    modeOverride: text("mode_override"),
    publicLink: text("public_link"),
    // New fields
    name: varchar("name", { length: 255 }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }),
    currentVersionId: uuid("current_version_id"), // Circular ref to workflowVersions deferred? No, just ID.
    // Stage 12: Intake Portal
    isPublic: boolean("is_public").default(false).notNull(),
    slug: text("slug").unique(), // DATA INTEGRITY FIX
    requireLogin: boolean("require_login").default(false).notNull(),
    intakeConfig: jsonb("intake_config").default(sql`'{}'::jsonb`).notNull(),
    // Stage 13: Version management
    pinnedVersionId: uuid("pinned_version_id"),
    // Common
    status: workflowStatusEnum("status").default('draft').notNull(),
    ownerType: ownerTypeEnum("owner_type"),
    ownerUuid: varchar("owner_uuid"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // Stage 15
    sourceBlueprintId: uuid("source_blueprint_id"),
}, (table) => [
    index("workflows_project_idx").on(table.projectId),
    index("workflows_status_idx").on(table.status),
    index("workflows_is_public_idx").on(table.isPublic),
    index("workflows_slug_idx").on(table.slug),
    index("workflows_pinned_version_idx").on(table.pinnedVersionId),
    index("idx_workflows_owner").on(table.ownerType, table.ownerUuid),
]);

// WorkflowVersion table
export const workflowVersions = pgTable("workflow_versions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    baseId: uuid("base_id").references(() => workflows.id, { onDelete: 'cascade' }),
    versionNumber: integer("version_number").default(1).notNull(),
    isDraft: boolean("is_draft").default(false).notNull(),
    // Definition
    graphJson: jsonb("graph_json").notNull(),
    // Metadata
    migrationInfo: jsonb("migration_info"),
    changelog: jsonb("changelog"),
    notes: text("notes"),
    checksum: text("checksum"),
    createdBy: varchar("created_by").references(() => users.id).notNull(),
    published: boolean("published").default(false).notNull(),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("workflow_versions_workflow_idx").on(table.workflowId),
    index("workflow_versions_version_number_idx").on(table.workflowId, table.versionNumber),
    index("workflow_versions_is_draft_idx").on(table.isDraft),
]);

// Workflow snapshots
export const workflowSnapshots = pgTable("workflow_snapshots", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    name: text("name").notNull(),
    values: jsonb("values").default(sql`'{}'::jsonb`).notNull(),
    workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'set null' }),
    versionHash: text("version_hash"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("workflow_snapshots_workflow_name_unique").on(table.workflowId, table.name),
]);

// Templates table
export const templates = pgTable("templates", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    fileRef: varchar("file_ref", { length: 500 }).notNull(),
    type: templateTypeEnum("type").notNull(),
    helpersVersion: integer("helpers_version").default(1).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    mapping: jsonb("mapping").default(sql`'{}'::jsonb`),
    currentVersion: integer("current_version").default(1),
    lastModifiedBy: varchar("last_modified_by").references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("templates_project_idx").on(table.projectId),
]);

// Template Versions
export const templateVersions = pgTable("template_versions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: 'cascade' }).notNull(),
    versionNumber: integer("version_number").notNull(),
    fileRef: varchar("file_ref", { length: 500 }).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    mapping: jsonb("mapping").default(sql`'{}'::jsonb`),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
    notes: text("notes"),
    isActive: boolean("is_active").default(true),
}, (table) => [
    uniqueIndex("template_versions_unique_idx").on(table.templateId, table.versionNumber),
]);

// Workflow Blueprints
export const workflowBlueprints = pgTable("workflow_blueprints", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }),
    creatorId: varchar("creator_id").references(() => users.id).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    graphJson: jsonb("graph_json").notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    sourceWorkflowId: uuid("source_workflow_id").references(() => workflows.id),
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// Workflow Templates (Many-to-Many link)
export const workflowTemplates = pgTable("workflow_templates", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id, { onDelete: 'cascade' }).notNull(),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: 'cascade' }).notNull(),
    key: text("key").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("workflow_templates_version_key_unique").on(table.workflowVersionId, table.key),
]);

// Sections
export const sections = pgTable("sections", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    order: integer("order").notNull(),
    config: jsonb("config").default(sql`'{}'::jsonb`),
    visibleIf: jsonb("visible_if"),
    skipIf: jsonb("skip_if"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("sections_workflow_idx").on(table.workflowId),
]);

// Steps
export const steps = pgTable("steps", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }).notNull(),
    type: stepTypeEnum("type").notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    required: boolean("required").default(false),
    options: jsonb("options"),
    alias: text("alias"),
    defaultValue: jsonb("default_value"),
    order: integer("order").notNull(),
    isVirtual: boolean("is_virtual").default(false).notNull(),
    visibleIf: jsonb("visible_if"),
    repeaterConfig: jsonb("repeater_config"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("steps_section_idx").on(table.sectionId),
]);

// Logic Rules
export const logicRules = pgTable("logic_rules", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    conditionStepId: uuid("condition_step_id").references(() => steps.id, { onDelete: 'cascade' }).notNull(),
    operator: conditionOperatorEnum("operator").notNull(),
    conditionValue: jsonb("condition_value"),
    targetType: logicRuleTargetTypeEnum("target_type").notNull(),
    targetStepId: uuid("target_step_id").references(() => steps.id, { onDelete: 'cascade' }),
    targetSectionId: uuid("target_section_id").references(() => sections.id, { onDelete: 'cascade' }),
    action: conditionalActionEnum("action").notNull(),
    logicalOperator: varchar("logical_operator").default("AND"),
    order: integer("order").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("logic_rules_workflow_idx").on(table.workflowId),
]);

// Blocks
export const blocks = pgTable("blocks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }),
    type: blockTypeEnum("type").notNull(),
    phase: blockPhaseEnum("phase").notNull(),
    config: jsonb("config").notNull(),
    virtualStepId: uuid("virtual_step_id").references(() => steps.id, { onDelete: 'set null' }),
    enabled: boolean("enabled").default(true).notNull(),
    order: integer("order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("blocks_workflow_phase_order_idx").on(table.workflowId, table.phase, table.order),
]);

// Transform Blocks
export const transformBlocks = pgTable("transform_blocks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }),
    name: varchar("name").notNull(),
    language: transformBlockLanguageEnum("language").notNull(),
    code: text("code").notNull(),
    inputKeys: text("input_keys").array().notNull().default(sql`'{}'::text[]`),
    outputKey: varchar("output_key").notNull(),
    virtualStepId: uuid("virtual_step_id").references(() => steps.id, { onDelete: 'set null' }),
    phase: blockPhaseEnum("phase").notNull().default('onSectionSubmit'),
    enabled: boolean("enabled").default(true).notNull(),
    order: integer("order").notNull().default(0),
    timeoutMs: integer("timeout_ms").default(1000),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// Lifecycle Hooks
export const lifecycleHooks = pgTable("lifecycle_hooks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: 'cascade' }),
    name: varchar("name", { length: 255 }).notNull(),
    phase: lifecycleHookPhaseEnum("phase").notNull(),
    language: transformBlockLanguageEnum("language").notNull(),
    code: text("code").notNull(),
    inputKeys: text("input_keys").array().notNull().default(sql`'{}'::text[]`),
    outputKeys: text("output_keys").array().notNull().default(sql`'{}'::text[]`),
    virtualStepIds: uuid("virtual_step_ids").array().default(sql`'{}'::uuid[]`),
    enabled: boolean("enabled").notNull().default(true),
    order: integer("order").notNull().default(0),
    timeoutMs: integer("timeout_ms").default(1000),
    mutationMode: boolean("mutation_mode").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// Document Hooks
export const documentHooks = pgTable("document_hooks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    finalBlockDocumentId: varchar("final_block_document_id", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    phase: documentHookPhaseEnum("phase").notNull(),
    language: transformBlockLanguageEnum("language").notNull(),
    code: text("code").notNull(),
    inputKeys: text("input_keys").array().notNull().default(sql`'{}'::text[]`),
    outputKeys: text("output_keys").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    order: integer("order").notNull().default(0),
    timeoutMs: integer("timeout_ms").default(3000),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// Project Access
export const projectAccess = pgTable("project_access", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    principalType: varchar("principal_type", { length: 20 }).notNull(),
    principalId: varchar("principal_id").notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("project_access_project_idx").on(table.projectId),
    uniqueIndex("project_access_principal_idx").on(table.projectId, table.principalType, table.principalId),
]);

// Workflow Access
export const workflowAccess = pgTable("workflow_access", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    principalType: varchar("principal_type", { length: 20 }).notNull(),
    principalId: varchar("principal_id").notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("workflow_access_workflow_idx").on(table.workflowId),
    uniqueIndex("workflow_access_principal_idx").on(table.workflowId, table.principalType, table.principalId),
]);

// Real-time Collaboration (Collab Docs)
export const collabDocs = pgTable("collab_docs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    versionId: uuid("version_id").references(() => workflowVersions.id, { onDelete: 'set null' }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("collab_docs_workflow_idx").on(table.workflowId),
]);

export const collabUpdates = pgTable("collab_updates", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    docId: uuid("doc_id").references(() => collabDocs.id, { onDelete: 'cascade' }).notNull(),
    seq: integer("seq").notNull(),
    update: text("update").notNull(),
    ts: timestamp("ts").defaultNow().notNull(),
}, (table) => [
    index("collab_updates_doc_seq_idx").on(table.docId, table.seq),
]);

export const collabSnapshots = pgTable("collab_snapshots", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    docId: uuid("doc_id").references(() => collabDocs.id, { onDelete: 'cascade' }).notNull(),
    clock: integer("clock").notNull(),
    state: text("state").notNull(),
    ts: timestamp("ts").defaultNow().notNull(),
}, (table) => [
    index("collab_snapshots_doc_clock_idx").on(table.docId, table.clock),
]);

// ===================================================================
// INSERTS & TYPES
// ===================================================================

export const insertProjectSchema = createInsertSchema(projects);
export const insertWorkflowSchema = createInsertSchema(workflows);
export const insertWorkflowBlueprintSchema = createInsertSchema(workflowBlueprints);
export const insertWorkflowVersionSchema = createInsertSchema(workflowVersions);
export const insertTemplateSchema = createInsertSchema(templates);
export const insertWorkflowTemplateSchema = createInsertSchema(workflowTemplates);
export const insertSectionSchema = createInsertSchema(sections);
export const insertStepSchema = createInsertSchema(steps);
export const insertLogicRuleSchema = createInsertSchema(logicRules);
export const insertBlockSchema = createInsertSchema(blocks);
export const insertTransformBlockSchema = createInsertSchema(transformBlocks);
export const insertLifecycleHookSchema = createInsertSchema(lifecycleHooks);
export const insertDocumentHookSchema = createInsertSchema(documentHooks);
export const insertProjectAccessSchema = createInsertSchema(projectAccess);
export const insertWorkflowAccessSchema = createInsertSchema(workflowAccess);
export const insertCollabDocSchema = createInsertSchema(collabDocs);
export const insertCollabUpdateSchema = createInsertSchema(collabUpdates);
export const insertCollabSnapshotSchema = createInsertSchema(collabSnapshots);

export type Project = InferSelectModel<typeof projects>;
export type InsertProject = InferInsertModel<typeof projects>;
export type Workflow = InferSelectModel<typeof workflows>;
export type InsertWorkflow = InferInsertModel<typeof workflows>;
export type WorkflowBlueprint = InferSelectModel<typeof workflowBlueprints>;
export type InsertWorkflowBlueprint = InferInsertModel<typeof workflowBlueprints>;
export type WorkflowVersion = InferSelectModel<typeof workflowVersions>;
export type InsertWorkflowVersion = InferInsertModel<typeof workflowVersions>;
export type Template = InferSelectModel<typeof templates>;
export type InsertTemplate = InferInsertModel<typeof templates>;
export type WorkflowTemplate = InferSelectModel<typeof workflowTemplates>;
export type InsertWorkflowTemplate = InferInsertModel<typeof workflowTemplates>;
export type Section = InferSelectModel<typeof sections>;
export type InsertSection = InferInsertModel<typeof sections>;
export type Step = InferSelectModel<typeof steps>;
export type InsertStep = InferInsertModel<typeof steps>;
export type LogicRule = InferSelectModel<typeof logicRules>;
export type InsertLogicRule = InferInsertModel<typeof logicRules>;
export type Block = InferSelectModel<typeof blocks>;
export type InsertBlock = InferInsertModel<typeof blocks>;
export type TransformBlock = InferSelectModel<typeof transformBlocks>;
export type InsertTransformBlock = InferInsertModel<typeof transformBlocks>;
export type LifecycleHook = InferSelectModel<typeof lifecycleHooks>;
export type InsertLifecycleHook = InferInsertModel<typeof lifecycleHooks>;
export type DocumentHook = InferSelectModel<typeof documentHooks>;
export type InsertDocumentHook = InferInsertModel<typeof documentHooks>;
export type ProjectAccess = InferSelectModel<typeof projectAccess>;
export type InsertProjectAccess = InferInsertModel<typeof projectAccess>;
export type WorkflowAccess = InferSelectModel<typeof workflowAccess>;
export type InsertWorkflowAccess = InferInsertModel<typeof workflowAccess>;
export type CollabDoc = InferSelectModel<typeof collabDocs>;
export type InsertCollabDoc = InferInsertModel<typeof collabDocs>;
export type CollabUpdate = InferSelectModel<typeof collabUpdates>;
export type InsertCollabUpdate = InferInsertModel<typeof collabUpdates>;
export type CollabSnapshot = InferSelectModel<typeof collabSnapshots>;
export type InsertCollabSnapshot = InferInsertModel<typeof collabSnapshots>;

export interface WorkflowVariable {
    key: string;
    alias: string | null;
    type: string;
    label: string;
    sectionId: string;
    sectionTitle: string;
    stepId: string;
}
