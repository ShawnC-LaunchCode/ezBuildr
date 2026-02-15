import { sql } from 'drizzle-orm';
import {
    index,
    uniqueIndex,
    jsonb,
    pgTable,
    timestamp,
    varchar,
    text,
    uuid,
    boolean
} from "drizzle-orm/pg-core";

// ===================================================================
// TABLES
// ===================================================================

// Email Template Metadata
// This is a registry/catalog of email templates with metadata only.
export const emailTemplateMetadata = pgTable("email_template_metadata", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateKey: varchar("template_key", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    subjectPreview: text("subject_preview"),
    brandingTokens: jsonb("branding_tokens"), // e.g. { logoUrl: true, primaryColor: true }
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("email_templates_key_idx").on(table.templateKey),
]);
