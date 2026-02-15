import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { pgTable, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod"; // Assuming z usage

export const systemStats = pgTable("system_stats", {
    id: integer("id").primaryKey(), // Singleton row id=1
    totalSurveysCreated: integer("total_surveys_created").default(0).notNull(),
    totalSurveysDeleted: integer("total_surveys_deleted").default(0).notNull(),
    totalResponsesCollected: integer("total_responses_collected").default(0).notNull(),
    totalResponsesDeleted: integer("total_responses_deleted").default(0).notNull(),
    totalUsersCreated: integer("total_users_created").default(0).notNull(),
    totalWorkflowsCreated: integer("total_workflows_created").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemStatsSchema = createInsertSchema(systemStats);
export type SystemStats = InferSelectModel<typeof systemStats>;
export type InsertSystemStats = InferInsertModel<typeof systemStats>;
