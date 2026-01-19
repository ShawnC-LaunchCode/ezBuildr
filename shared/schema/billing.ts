import { sql } from 'drizzle-orm';
import { type InferSelectModel, type  } from 'drizzle-orm';
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
import { organizations, users } from './auth'; // Workflows might be in workflow.ts, check circular dep
// Placeholder for Workflows import - will update once workflow.ts is created
import { workflows as workflowsRef } from './workflow';
// ===================================================================
// BILLING & MONETIZATION
// ===================================================================
// Billing Plans (Free, Pro, Team, Enterprise)
export const billingPlans = pgTable("billing_plans", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    type: varchar("type").notNull(), // 'free', 'pro', 'team', 'enterprise'
    priceMonthly: integer("price_monthly").default(0).notNull(), // in cents
    priceYearly: integer("price_yearly").default(0).notNull(), // in cents
    features: jsonb("features").default({}).notNull(), // { scripting: true, advanced_blocks: false }
    limits: jsonb("limits").default({}).notNull(), // { workflows: 2, runs: 50, seats: 1 }
    stripeProductId: varchar("stripe_product_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
// Subscription Status Enum
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid']);
// Organization Subscriptions
export const subscriptions = pgTable("subscriptions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    planId: uuid("plan_id").references(() => billingPlans.id).notNull(),
    status: subscriptionStatusEnum("status").default('active').notNull(),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    canceledAt: timestamp("canceled_at"),
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    seatQuantity: integer("seat_quantity").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("sub_org_idx").on(table.organizationId), // One active subscription per org for now
]);
// Subscription Seats (for per-seat billing)
export const subscriptionSeats = pgTable("subscription_seats", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
    uniqueIndex("seat_sub_user_idx").on(table.subscriptionId, table.userId),
]);
// Customer Billing Info (Stripe Mapping)
export const customerBillingInfo = pgTable("customer_billing_info", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    stripeCustomerId: varchar("stripe_customer_id").notNull(),
    billingEmail: varchar("billing_email"),
    defaultPaymentMethodId: varchar("default_payment_method_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("billing_info_org_idx").on(table.organizationId),
    uniqueIndex("billing_info_stripe_idx").on(table.stripeCustomerId),
]);
// Usage Records (Metering)
export const usageRecords = pgTable("usage_records", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    metric: varchar("metric").notNull(), // 'workflow_run', 'doc_gen', 'storage_bytes'
    quantity: integer("quantity").default(1).notNull(),
    workflowId: uuid("workflow_id").references(() => workflowsRef.id), // Optional: track per workflow
    metadata: jsonb("metadata"),
    recordedAt: timestamp("recorded_at").defaultNow(),
}, (table) => [
    index("usage_org_metric_date_idx").on(table.organizationId, table.metric, table.recordedAt),
]);
export const insertBillingPlanSchema = createInsertSchema(billingPlans);
export const insertSubscriptionSchema = createInsertSchema(subscriptions);
export const insertSubscriptionSeatSchema = createInsertSchema(subscriptionSeats);
export const insertCustomerBillingInfoSchema = createInsertSchema(customerBillingInfo);
export const insertUsageRecordSchema = createInsertSchema(usageRecords);
export type BillingPlan = InferSelectModel<typeof billingPlans>;
export type Subscription = InferSelectModel<typeof subscriptions>;
export type SubscriptionSeat = InferSelectModel<typeof subscriptionSeats>;
export type CustomerBillingInfo = InferSelectModel<typeof customerBillingInfo>;
export type UsageRecord = InferSelectModel<typeof usageRecords>;