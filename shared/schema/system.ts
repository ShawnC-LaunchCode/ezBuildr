import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod"; // Assuming z usage

export const systemStats = pgTable("system_stats", {
    id: integer("id").primaryKey(), // Singleton row id=1

    totalUsersCreated: integer("total_users_created").default(0).notNull(),
    totalWorkflowsCreated: integer("total_workflows_created").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemStatsSchema = createInsertSchema(systemStats);
export type SystemStats = InferSelectModel<typeof systemStats>;
export type InsertSystemStats = InferInsertModel<typeof systemStats>;
