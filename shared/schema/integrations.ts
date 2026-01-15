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

import { users, tenants, workspaces } from './auth';
import { projects } from './workflow';

// ===================================================================
// ENUMS
// ===================================================================

// ENUMS
// ===================================================================

export const connectionTypeEnum = pgEnum('connection_type', ['postgres', 'mysql', 'salesforce', 'hubspot', 'slack', 'stripe', 'google_sheets', 'http']);
export const secretTypeEnum = pgEnum('secret_type', ['api_key', 'bearer', 'oauth2', 'basic_auth']);

export const webhookEventEnum = pgEnum('webhook_event', [
    'workflow_run.started',
    'workflow_run.page_completed',
    'workflow_run.completed',
    'document.generated',
    'signature.completed',
    'signature.declined'
]);

// ===================================================================
// TABLES
// ===================================================================

// Secrets table
export const secrets = pgTable("secrets", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    key: varchar("key").notNull(),
    value: text("value"), // Encrypted - making nullable just in case, but usually notNull
    valueEnc: text("value_enc").notNull(), // Add valueEnc as expected by secrets.ts
    type: secretTypeEnum("type").notNull().default('api_key'), // Use Enum
    metadata: jsonb("metadata").default({}),
    environment: varchar("environment").default('production'),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("secrets_project_key_env_unique").on(table.projectId, table.key, table.environment),
]);

// External Connections
export const externalConnections = pgTable("connections", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    type: connectionTypeEnum("type").default('http'),
    name: varchar("name").notNull(),
    baseUrl: varchar("base_url").notNull(), // Make notNull
    authType: varchar("auth_type", { length: 50 }).default('none'),
    secretId: uuid("secret_id").references(() => secrets.id, { onDelete: 'set null' }),
    defaultHeaders: jsonb("default_headers").default({}),
    timeoutMs: integer("timeout_ms").default(8000),
    retries: integer("retries").default(2),
    backoffMs: integer("backoff_ms").default(250),
    config: jsonb("config").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("connections_project_idx").on(table.projectId),
]);

// External Destinations (for Send blocks etc)
export const externalDestinations = pgTable("external_destinations", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name").notNull(),
    type: varchar("type").notNull(), // 'http', 'sftp', 'email'
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("ext_dest_tenant_idx").on(table.tenantId),
]);

// API Keys
export const apiKeys = pgTable("api_keys", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    prefix: varchar("prefix", { length: 50 }).notNull(), // Add prefix column for lookup
    keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
    scopes: text("scopes").array().notNull(),
    name: varchar("name").notNull(), // Metadata
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("api_keys_project_idx").on(table.projectId),
]);

// Webhook Subscriptions
export const webhookSubscriptions = pgTable("webhook_subscriptions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
    targetUrl: varchar("target_url").notNull(),
    events: jsonb("events").notNull(), // Array of webhookEventEnum
    secret: varchar("secret").notNull(), // HMAC secret
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("webhook_subs_workspace_idx").on(table.workspaceId),
]);

// Webhook Events
export const webhookEvents = pgTable("webhook_events", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    subscriptionId: uuid("subscription_id").references(() => webhookSubscriptions.id, { onDelete: 'cascade' }).notNull(),
    event: varchar("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status").notNull(), // 'success', 'failed', 'retrying'
    attempts: integer("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at"),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("webhook_events_sub_idx").on(table.subscriptionId),
]);

// OAuth Applications
export const oauthApps = pgTable("oauth_apps", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name").notNull(),
    clientId: varchar("client_id").unique().notNull(),
    clientSecretHash: varchar("client_secret_hash").notNull(), // Hashed
    redirectUris: jsonb("redirect_uris").notNull(), // Array of strings
    scopes: jsonb("scopes").notNull(), // Array of strings
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("oauth_apps_client_id_idx").on(table.clientId),
    index("oauth_apps_workspace_idx").on(table.workspaceId),
]);

// OAuth Auth Codes
export const oauthAuthCodes = pgTable("oauth_auth_codes", {
    code: varchar("code").primaryKey(),
    clientId: varchar("client_id").references(() => oauthApps.clientId, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scope: jsonb("scope"),
    redirectUri: varchar("redirect_uri").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

// OAuth Access Tokens
export const oauthAccessTokens = pgTable("oauth_access_tokens", {
    accessToken: varchar("access_token").primaryKey(),
    refreshToken: varchar("refresh_token").unique(),
    clientId: varchar("client_id").references(() => oauthApps.clientId, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // Nullable for client_credentials
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
    scope: jsonb("scope"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

// ===================================================================
// INSERTS & TYPES
// ===================================================================

export const insertSecretSchema = createInsertSchema(secrets);
export const insertExternalConnectionSchema = createInsertSchema(externalConnections); // Using externalConnections var
export const insertExternalDestinationSchema = createInsertSchema(externalDestinations);
export const insertApiKeySchema = createInsertSchema(apiKeys);

export type Secret = InferSelectModel<typeof secrets>;
export type InsertSecret = InferInsertModel<typeof secrets>;
export type ExternalConnection = InferSelectModel<typeof externalConnections>;
export type InsertExternalConnection = InferInsertModel<typeof externalConnections>;
export type ExternalDestination = InferSelectModel<typeof externalDestinations>;
export type InsertExternalDestination = InferInsertModel<typeof externalDestinations>;
export type ApiKey = InferSelectModel<typeof apiKeys>;
export type InsertApiKey = InferInsertModel<typeof apiKeys>;
