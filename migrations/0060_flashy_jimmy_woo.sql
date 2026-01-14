CREATE TYPE "organization_invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "organization_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "owner_type" AS ENUM('user', 'org');--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar NOT NULL,
	"scope_id" varchar,
	"system_prompt" text,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_workflow_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid,
	"user_id" varchar,
	"operation_type" varchar NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"ai_provider" varchar,
	"ai_model" varchar,
	"prompt_version" varchar,
	"quality_score" integer,
	"quality_passed" boolean,
	"issues_count" integer,
	"request_description" text,
	"generated_sections" integer,
	"generated_steps" integer,
	"was_edited" boolean DEFAULT false,
	"edit_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datavault_writeback_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"column_mappings" jsonb NOT NULL,
	"trigger_phase" varchar(50) DEFAULT 'afterComplete' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invited_email" varchar(255) NOT NULL,
	"invited_user_id" varchar,
	"invited_by_user_id" varchar NOT NULL,
	"token" varchar(255) NOT NULL,
	"status" "organization_invite_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"email_sent_at" timestamp,
	"email_failed" boolean DEFAULT false,
	"email_error" text,
	CONSTRAINT "organization_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "organization_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "template_generation_metrics" DROP CONSTRAINT "template_generation_metrics_run_id_workflow_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_run_events" DROP CONSTRAINT "workflow_run_events_run_id_workflow_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" DROP CONSTRAINT "workflow_run_metrics_run_id_workflow_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "template_versions" ALTER COLUMN "created_by" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "last_modified_by" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "datavault_databases" ADD COLUMN "owner_type" "owner_type";--> statement-breakpoint
ALTER TABLE "datavault_databases" ADD COLUMN "owner_uuid" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_by_user_id" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_type" "owner_type";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_uuid" uuid;--> statement-breakpoint
ALTER TABLE "system_stats" ADD COLUMN "total_users_created" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_stats" ADD COLUMN "total_workflows_created" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "placeholder_email" varchar(255);--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "owner_type" varchar(50);--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "owner_uuid" uuid;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "owner_type" "owner_type";--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "owner_uuid" uuid;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_feedback" ADD CONSTRAINT "ai_workflow_feedback_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_feedback" ADD CONSTRAINT "ai_workflow_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_writeback_mappings" ADD CONSTRAINT "datavault_writeback_mappings_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_writeback_mappings" ADD CONSTRAINT "datavault_writeback_mappings_table_id_datavault_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "datavault_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datavault_writeback_mappings" ADD CONSTRAINT "datavault_writeback_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_feedback_workflow_idx" ON "ai_workflow_feedback" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_user_idx" ON "ai_workflow_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_rating_idx" ON "ai_workflow_feedback" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "ai_feedback_operation_idx" ON "ai_workflow_feedback" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "ai_feedback_created_idx" ON "ai_workflow_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_writeback_mappings_workflow" ON "datavault_writeback_mappings" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_writeback_mappings_table" ON "datavault_writeback_mappings" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_token_unique_idx" ON "organization_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_org_invites_org_email_status" ON "organization_invites" USING btree ("org_id","invited_email","status");--> statement-breakpoint
CREATE INDEX "idx_org_invites_status" ON "organization_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_org_invites_expires" ON "organization_invites" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_org_invites_email_failed" ON "organization_invites" USING btree ("email_failed","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_membership_unique_idx" ON "organization_memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_org_memberships_org" ON "organization_memberships" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_org_memberships_user" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_org_memberships_role" ON "organization_memberships" USING btree ("role");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generation_metrics" ADD CONSTRAINT "template_generation_metrics_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blueprints" ADD CONSTRAINT "workflow_blueprints_source_workflow_id_workflows_id_fk" FOREIGN KEY ("source_workflow_id") REFERENCES "workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_metrics" ADD CONSTRAINT "workflow_run_metrics_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_datavault_databases_owner" ON "datavault_databases" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "idx_organizations_created_by" ON "organizations" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_tenant" ON "organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_projects_owner" ON "projects" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "idx_users_is_placeholder" ON "users" USING btree ("is_placeholder");--> statement-breakpoint
CREATE INDEX "idx_users_placeholder_email" ON "users" USING btree ("placeholder_email");--> statement-breakpoint
CREATE INDEX "workflow_runs_created_at_idx" ON "workflow_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_owner_idx" ON "workflow_runs" USING btree ("owner_type","owner_uuid");--> statement-breakpoint
CREATE INDEX "idx_workflows_owner" ON "workflows" USING btree ("owner_type","owner_uuid");