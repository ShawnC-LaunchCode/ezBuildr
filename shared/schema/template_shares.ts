import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { pgTable, timestamp, varchar, boolean, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { users } from "./auth";
import { templates } from "./workflow"; // Assuming templates is in workflow.ts

export const templateAccessEnum = pgEnum('template_access', ['use', 'edit']);

export const templateShares = pgTable("template_shares", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
    pendingEmail: varchar("pending_email", { length: 255 }),
    access: templateAccessEnum("access").notNull(),
    invitedAt: timestamp("invited_at").defaultNow(),
    acceptedAt: timestamp("accepted_at"),
});

export const insertTemplateShareSchema = createInsertSchema(templateShares);
export type TemplateShare = InferSelectModel<typeof templateShares>;
export type InsertTemplateShare = InferInsertModel<typeof templateShares>;
