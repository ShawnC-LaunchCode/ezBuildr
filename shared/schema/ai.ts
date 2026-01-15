import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
    index,
    pgTable,
    timestamp,
    varchar,
    text,
    uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { users } from './auth';

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
