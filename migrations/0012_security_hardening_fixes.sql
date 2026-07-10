-- Files CHECK constraint
ALTER TABLE "files" ADD CONSTRAINT "files_size_check" CHECK("size" > 0);
--> statement-breakpoint
-- Billing CHECK constraints
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscription_seat_quantity_check" CHECK("seat_quantity" > 0);
--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_quantity_check" CHECK("quantity" > 0);
--> statement-breakpoint
-- Workflow CHECK constraints
ALTER TABLE "transform_blocks" ADD CONSTRAINT "transform_blocks_timeout_check" CHECK("timeout_ms" > 0);
--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" ADD CONSTRAINT "lifecycle_hooks_timeout_check" CHECK("timeout_ms" > 0);
--> statement-breakpoint
ALTER TABLE "document_hooks" ADD CONSTRAINT "document_hooks_timeout_check" CHECK("timeout_ms" > 0);
--> statement-breakpoint
-- Run CHECK constraints
ALTER TABLE "ai_workflow_feedback" ADD CONSTRAINT "ai_workflow_feedback_rating_check" CHECK("rating" >= 0);
--> statement-breakpoint
-- Missing Foreign Keys / Cascades (auth.ts / workspace_members / workspace_invitations / user_personalization_settings)
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT "workspace_invitations_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_personalization_settings" DROP CONSTRAINT "user_personalization_settings_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_personalization_settings" ADD CONSTRAINT "user_personalization_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Runs cascading and fixes (run.ts)
ALTER TABLE "run_logs" DROP CONSTRAINT "run_logs_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_tasks" DROP CONSTRAINT "review_tasks_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "signature_requests" DROP CONSTRAINT "signature_requests_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_outputs" DROP CONSTRAINT "run_outputs_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "run_outputs" ADD CONSTRAINT "run_outputs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Workflow Version and Blueprints (workflow.ts)
ALTER TABLE "workflow_versions" DROP CONSTRAINT "workflow_versions_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_blueprints" DROP CONSTRAINT "workflow_blueprints_creator_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "datavault_columns" ADD CONSTRAINT "datavault_columns_reference_table_id_datavault_tables_id_fk" FOREIGN KEY ("reference_table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE set null ON UPDATE no action;
