import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { pgTable, text, timestamp, varchar, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { users } from "./auth";

export const surveyTemplates = pgTable("survey_templates", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    content: jsonb("content").default(sql`'{}'::jsonb`),
    creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'set null' }).notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    tags: text("tags").array().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSurveyTemplateSchema = createInsertSchema(surveyTemplates);
export type SurveyTemplate = InferSelectModel<typeof surveyTemplates>;
export type InsertSurveyTemplate = InferInsertModel<typeof surveyTemplates>;
