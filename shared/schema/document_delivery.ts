import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
    index,
    jsonb,
    pgTable,
    timestamp,
    varchar,
    uuid,
    integer,
    check
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { tenants } from './auth';
import { workflowRuns } from './run';
import { workflows } from './workflow';

/**
 * Document Deliveries table
 * Tracks asynchronous dispatch of generated documents to external destinations (Email, Webhooks, Cloud Storage/S3)
 * with exponential backoff retries and audit logging.
 */
export const runDocumentDeliveries = pgTable("run_document_deliveries", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: 'cascade' }).notNull(),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    // NOT NULL is load-bearing: both read paths (findByRunIdAndTenantId,
    // findByIdAndTenantId) and the tenant_isolation RLS policy compare
    // tenant_id to a tenant, and neither ever matches NULL. A null-tenant row
    // is still claimed and delivered by the worker but is invisible and
    // un-retryable through the API for everyone.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    destinationType: varchar("destination_type", { length: 50 }).notNull(),
    destinationConfig: jsonb("destination_config").default(sql`'{}'::jsonb`).notNull(),
    status: varchar("status", { length: 20 }).default('pending').notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: varchar("last_error", { length: 4000 }),
    auditLog: jsonb("audit_log").default(sql`'[]'::jsonb`).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("run_document_deliveries_run_idx").on(table.runId),
    index("run_document_deliveries_tenant_idx").on(table.tenantId),
    index("run_document_deliveries_claim_idx")
        .on(table.status, table.nextAttemptAt)
        .where(sql`${table.status} IN ('pending', 'retry')`),
    check("run_document_deliveries_attempts_check", sql`${table.attempts} >= 0`),
    check("run_document_deliveries_status_check", sql`${table.status} IN ('pending', 'processing', 'delivered', 'failed', 'retry')`),
]);

export const insertRunDocumentDeliverySchema = createInsertSchema(runDocumentDeliveries);
export const selectRunDocumentDeliverySchema = createSelectSchema(runDocumentDeliveries);

export type RunDocumentDelivery = InferSelectModel<typeof runDocumentDeliveries>;
export type InsertRunDocumentDelivery = InferInsertModel<typeof runDocumentDeliveries>;
