import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
    index,
    pgTable,
    timestamp,
    varchar,
    text,
    uuid,
    integer,
    pgEnum
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { tenants, users } from './auth';

// ===================================================================
// ENUMS
// ===================================================================

export const fileContextEnum = pgEnum('file_context', ['template', 'intake', 'output', 'signature', 'temp']);

// ===================================================================
// TABLES
// ===================================================================

export const files = pgTable("files", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // Storage details
    storageKey: text("storage_key").notNull(), // S3 Key or File Path
    bucket: text("bucket"), // Optional: S3 Bucket Name (if using S3)
    provider: varchar("provider", { length: 20 }).default('local').notNull(), // 's3', 'local', 'r2'

    // Metadata
    filename: text("filename").notNull(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),

    // Ownership / Access
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    uploaderId: varchar("uploader_id").references(() => users.id, { onDelete: 'set null' }),

    // Categorization
    context: fileContextEnum("context").default('temp').notNull(),

    // Soft Delete & Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"), // Soft delete indicator
}, (table) => [
    index("files_tenant_idx").on(table.tenantId),
    index("files_uploader_idx").on(table.uploaderId),
    index("files_context_idx").on(table.context),
    index("files_deleted_at_idx").on(table.deletedAt), // For cleanup jobs
]);

// ===================================================================
// INSERTS & TYPES
// ===================================================================

export const insertFileSchema = createInsertSchema(files);

export type FileRecord = InferSelectModel<typeof files>;
export type InsertFileRecord = InferInsertModel<typeof files>;
