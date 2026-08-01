import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
    index,
    pgTable,
    timestamp,
    varchar,
    text,
    uuid,
    boolean,
    integer,
    doublePrecision,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { tenants, users } from './auth';
import { workflows, type TransformBlock } from './workflow';


export const aiSettings = pgTable("ai_settings", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: varchar("scope").notNull().default('global'), // 'global', 'org', 'user'
    systemPrompt: text("system_prompt"),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("ai_settings_scope_idx").on(table.scope),
]);

export const insertAiSettingsSchema = createInsertSchema(aiSettings);
export type AiSettings = InferSelectModel<typeof aiSettings>;
export type InsertAiSettings = InferInsertModel<typeof aiSettings>;

// Workflow Personalization Settings
export const workflowPersonalizationSettings = pgTable("workflow_personalization_settings", {
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).primaryKey(),
    enabled: boolean("enabled").default(true).notNull(),
    allowDynamicPrompts: boolean("allow_dynamic_prompts").default(true).notNull(),
    allowDynamicHelp: boolean("allow_dynamic_help").default(true).notNull(),
    allowDynamicTone: boolean("allow_dynamic_tone").default(true).notNull(),
    defaultTone: varchar("default_tone").default("neutral").notNull(),
    defaultReadingLevel: varchar("default_reading_level").default("standard").notNull(),
    defaultVerbosity: varchar("default_verbosity").default("standard").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkflowPersonalizationSettingsSchema = createInsertSchema(workflowPersonalizationSettings);
export type WorkflowPersonalizationSettings = InferSelectModel<typeof workflowPersonalizationSettings>;
export type InsertWorkflowPersonalizationSettings = InferInsertModel<typeof workflowPersonalizationSettings>;


/**
 * Per-tenant AI usage ledger (ICW2-B7). One row per `callLLM` call once a
 * `tenantId` reaches `AIProviderClient` — inputTokens/outputTokens are the
 * provider's real usage when available, falling back to the char/4 estimate
 * only when a provider omits it. `AiUsageRepository` sums this table over a
 * rolling window to enforce `LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET`.
 */
export const aiUsage = pgTable("ai_usage", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    taskType: varchar("task_type", { length: 50 }),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("ai_usage_tenant_created_idx").on(table.tenantId, table.createdAt),
]);

export const insertAiUsageSchema = createInsertSchema(aiUsage);
export type AiUsage = InferSelectModel<typeof aiUsage>;
export type InsertAiUsage = InferInsertModel<typeof aiUsage>;

export interface TransformResult {
    updatedTransforms: TransformBlock[];
    diff: {
        added: string[];
        removed: string[];
        modified: string[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: Record<string, { before: any; after: any }>;
    };
    explanation: string[];
}

