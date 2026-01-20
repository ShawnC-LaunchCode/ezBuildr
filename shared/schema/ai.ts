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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { users } from './auth';
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


export interface TransformResult {
    updatedTransforms: TransformBlock[];
    diff: {
        added: string[];
        removed: string[];
        modified: string[];
        details: Record<string, { before: any; after: any }>;
    };
    explanation: string[];
}

