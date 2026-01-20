import { sql } from 'drizzle-orm';
import { type InferSelectModel } from 'drizzle-orm';
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
import { tenants, users, ownerTypeEnum } from './auth';
import { workflows } from './workflow';
// ===================================================================
// ENUMS
// ===================================================================
export const datavaultColumnTypeEnum = pgEnum('datavault_column_type', [
    'text', 'number', 'boolean', 'date', 'datetime', 'email', 'phone', 'url', 'json',
    'auto_number', 'autonumber', 'reference', 'select', 'multiselect'
]);
export const autonumberResetPolicyEnum = pgEnum('autonumber_reset_policy', ['never', 'yearly']);
export const datavaultScopeTypeEnum = pgEnum('datavault_scope_type', ['account', 'project', 'workflow']);
export type DatavaultScopeType = 'account' | 'project' | 'workflow';
export const datavaultTableRoleEnum = pgEnum('datavault_table_role', ['owner', 'write', 'read']);
export type DatavaultTableRole = 'owner' | 'write' | 'read';
export const dataSourceTypeEnum = pgEnum('data_source_type', ['native', 'postgres', 'google_sheets', 'airtable', 'external']);
export const collectionFieldTypeEnum = pgEnum('collection_field_type', [
    'text', 'number', 'boolean', 'date', 'datetime', 'file', 'select', 'multi_select', 'json'
]);
// ===================================================================
// TABLES
// ===================================================================
// DataVault Databases
export const datavaultDatabases = pgTable("datavault_databases", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    type: dataSourceTypeEnum("type").default('native').notNull(),
    config: jsonb("config").default(sql`'{}'::jsonb`),
    scopeType: datavaultScopeTypeEnum("scope_type").notNull().default('account'),
    scopeId: uuid("scope_id"),
    ownerType: ownerTypeEnum("owner_type"),
    ownerUuid: uuid("owner_uuid"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("idx_databases_tenant").on(table.tenantId),
    index("idx_databases_scope").on(table.scopeType, table.scopeId),
    index("idx_datavault_databases_owner").on(table.ownerType, table.ownerUuid),
]);
// DataVault Tables
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
// DataVault Columns
export const datavaultColumns = pgTable("datavault_columns", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: datavaultColumnTypeEnum("type").notNull(),
    description: text("description"),
    widthPx: integer("width_px").default(150),
    required: boolean("required").default(false).notNull(),
    isPrimaryKey: boolean("is_primary_key").default(false).notNull(),
    isUnique: boolean("is_unique").default(false).notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    autoNumberStart: integer("auto_number_start").default(1),
    autonumberPrefix: text("autonumber_prefix"),
    autonumberPadding: integer("autonumber_padding").default(4),
    autonumberResetPolicy: autonumberResetPolicyEnum("autonumber_reset_policy").default('never'),
    referenceTableId: uuid("reference_table_id"),
    referenceDisplayColumnSlug: text("reference_display_column_slug"),
    options: jsonb("options"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("datavault_columns_table_idx").on(table.tableId),
    index("datavault_columns_reference_table_idx").on(table.referenceTableId),
    uniqueIndex("datavault_columns_table_slug_unique").on(table.tableId, table.slug),
]);
// DataVault Rows
export const datavaultRows = pgTable("datavault_rows", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
    index("datavault_rows_table_idx").on(table.tableId),
    index("datavault_rows_created_by_idx").on(table.createdBy),
]);
// DataVault Values
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
// DataVault Number Sequences
export const datavaultNumberSequences = pgTable("datavault_number_sequences", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
    columnId: uuid("column_id").references(() => datavaultColumns.id, { onDelete: 'cascade' }).notNull(),
    prefix: text("prefix"),
    padding: integer("padding").notNull().default(4),
    nextValue: integer("next_value").notNull().default(1),
    resetPolicy: autonumberResetPolicyEnum("reset_policy").notNull().default('never'),
    lastReset: timestamp("last_reset"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("idx_datavault_sequences_tenant").on(table.tenantId),
    index("idx_datavault_sequences_table").on(table.tableId),
    uniqueIndex("idx_datavault_sequences_column_unique").on(table.tenantId, table.tableId, table.columnId),
]);
// DataVault Row Notes
export const datavaultRowNotes = pgTable("datavault_row_notes", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    rowId: uuid("row_id").references(() => datavaultRows.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("idx_datavault_row_notes_row_id").on(table.rowId),
    index("idx_datavault_row_notes_tenant_id").on(table.tenantId),
]);
// DataVault API Tokens
export const datavaultApiTokens = pgTable("datavault_api_tokens", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    databaseId: uuid("database_id").references(() => datavaultDatabases.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at").defaultNow(),
    expiresAt: timestamp("expires_at"),
}, (table) => [
    index("idx_datavault_api_tokens_database_id").on(table.databaseId),
    index("idx_datavault_api_tokens_token_hash").on(table.tokenHash),
    uniqueIndex("unique_token_hash").on(table.tokenHash),
]);
// DataVault Table Permissions
export const datavaultTablePermissions = pgTable("datavault_table_permissions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: datavaultTableRoleEnum("role").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("idx_table_permissions_table").on(table.tableId),
    uniqueIndex("unique_table_user_permission").on(table.tableId, table.userId),
]);
// DataVault Writeback Mappings
export const datavaultWritebackMappings = pgTable("datavault_writeback_mappings", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
    columnMappings: jsonb("column_mappings").notNull(),
    triggerPhase: varchar("trigger_phase", { length: 50 }).notNull().default('afterComplete'),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
    index("idx_writeback_mappings_workflow").on(table.workflowId),
]);
// Workflow Data Sources (Link workflows to data sources)
export const workflowDataSources = pgTable("workflow_data_sources", {
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    dataSourceId: uuid("data_source_id").references(() => datavaultDatabases.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    primaryKey({ columns: [table.workflowId, table.dataSourceId] }),
    index("idx_workflow_data_sources_workflow").on(table.workflowId),
]);
// Workflow Queries
export const workflowQueries = pgTable("workflow_queries", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    dataSourceId: uuid("data_source_id").references(() => datavaultDatabases.id, { onDelete: 'cascade' }).notNull(),
    tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    filters: jsonb("filters").default(sql`'[]'::jsonb`),
    sort: jsonb("sort").default(sql`'[]'::jsonb`),
    limit: integer("limit"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("idx_workflow_queries_workflow").on(table.workflowId),
]);
// Legacy / Stage 19 Collections (Alternative to DataVaultTables?)
export const collections = pgTable("collections", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("collections_slug_unique").on(table.tenantId, table.slug),
]);
// Collection Fields
export const collectionFields = pgTable("collection_fields", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    collectionId: uuid("collection_id").references(() => collections.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    type: collectionFieldTypeEnum("type").notNull(),
    isRequired: boolean("is_required").default(false).notNull(),
    options: jsonb("options"), // For select/multi-select: array of valid options
    defaultValue: jsonb("default_value"), // Default value for new records
    order: integer("order").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("collection_fields_collection_idx").on(table.collectionId),
    index("collection_fields_slug_idx").on(table.slug),
    index("collection_fields_type_idx").on(table.type),
    uniqueIndex("collection_fields_collection_slug_unique_idx").on(table.collectionId, table.slug),
]);
// Records (for Collections)
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
    index("records_collection_idx").on(table.collectionId),
    index("records_tenant_idx").on(table.tenantId),
]);
// ===================================================================
// INSERTS & TYPES
// ===================================================================
export const insertDatavaultDatabaseSchema = createInsertSchema(datavaultDatabases);
export type InsertDatavaultDatabase = z.infer<typeof insertDatavaultDatabaseSchema>;
export const insertDatavaultTableSchema = createInsertSchema(datavaultTables).extend({
    slug: z.string().optional()
});
export type InsertDatavaultTable = z.infer<typeof insertDatavaultTableSchema>;
export const insertDatavaultColumnSchema = createInsertSchema(datavaultColumns).extend({
    slug: z.string().optional()
});
export type InsertDatavaultColumn = z.infer<typeof insertDatavaultColumnSchema>;
export const insertDatavaultRowSchema = createInsertSchema(datavaultRows);
export type InsertDatavaultRow = z.infer<typeof insertDatavaultRowSchema>;
export const insertDatavaultValueSchema = createInsertSchema(datavaultValues);
export type InsertDatavaultValue = z.infer<typeof insertDatavaultValueSchema>;
export const insertDatavaultRowNoteSchema = createInsertSchema(datavaultRowNotes);
export type InsertDatavaultRowNote = z.infer<typeof insertDatavaultRowNoteSchema>;
export const insertDatavaultApiTokenSchema = createInsertSchema(datavaultApiTokens);
export type InsertDatavaultApiToken = z.infer<typeof insertDatavaultApiTokenSchema>;
export const insertDatavaultTablePermissionSchema = createInsertSchema(datavaultTablePermissions);
export type InsertDatavaultTablePermission = z.infer<typeof insertDatavaultTablePermissionSchema>;
export const insertDatavaultWritebackMappingSchema = createInsertSchema(datavaultWritebackMappings);
export type InsertDatavaultWritebackMapping = z.infer<typeof insertDatavaultWritebackMappingSchema>;
// Collection Schemas
export const insertCollectionSchema = createInsertSchema(collections).strict();
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export const insertCollectionFieldSchema = createInsertSchema(collectionFields).strict();
export type InsertCollectionField = z.infer<typeof insertCollectionFieldSchema>;
export const insertRecordSchema = createInsertSchema(records).strict();
// Types
export type DatavaultDatabase = InferSelectModel<typeof datavaultDatabases>;
export type DatavaultTable = InferSelectModel<typeof datavaultTables>;
export type DatavaultColumn = InferSelectModel<typeof datavaultColumns>;
export type DatavaultRow = InferSelectModel<typeof datavaultRows>;
export type DatavaultValue = InferSelectModel<typeof datavaultValues>;
export type DatavaultRowNote = InferSelectModel<typeof datavaultRowNotes>;
export type DatavaultApiToken = InferSelectModel<typeof datavaultApiTokens>;
export type DatavaultTablePermission = InferSelectModel<typeof datavaultTablePermissions>;
export type DatavaultWritebackMapping = InferSelectModel<typeof datavaultWritebackMappings>;
export type Collection = InferSelectModel<typeof collections>;
export type CollectionField = InferSelectModel<typeof collectionFields>;
export type CollectionRecord = InferSelectModel<typeof records>;
export type InsertCollectionRecord = typeof insertRecordSchema._type;
export type InsertRecord = InsertCollectionRecord;