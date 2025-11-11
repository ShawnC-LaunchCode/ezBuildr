-- Migration: Add multi-tenant data model and document automation tables
-- This migration adds support for:
-- - Multi-tenancy with tenant isolation
-- - Workflow versioning
-- - Document templates
-- - Runtime execution logs
-- - Secrets management
-- - API keys
-- - Audit events

-- =====================================================================
-- CREATE NEW ENUMS
-- =====================================================================

DO $$ BEGIN
 CREATE TYPE "public"."tenant_plan" AS ENUM('free', 'pro', 'enterprise');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."user_tenant_role" AS ENUM('owner', 'builder', 'runner', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."auth_provider" AS ENUM('local', 'google');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."version_status" AS ENUM('draft', 'published');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."template_type" AS ENUM('docx', 'html');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."run_status" AS ENUM('pending', 'success', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- CREATE NEW TABLES
-- =====================================================================

-- Tenants table
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"billing_email" varchar(255),
	"plan" "tenant_plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Workflow versions table
CREATE TABLE IF NOT EXISTS "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"graph_json" jsonb NOT NULL,
	"created_by" varchar NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Templates table
CREATE TABLE IF NOT EXISTS "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"file_ref" varchar(500) NOT NULL,
	"type" "template_type" NOT NULL,
	"helpers_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Runs table (document generation runs)
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"input_json" jsonb,
	"output_refs" jsonb,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"duration_ms" integer,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Secrets table
CREATE TABLE IF NOT EXISTS "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"value_enc" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Audit events table
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"diff" jsonb,
	"ts" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- API keys table
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_hash" varchar(255) NOT NULL UNIQUE,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Run logs table
CREATE TABLE IF NOT EXISTS "run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" varchar(100),
	"level" "log_level" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now()
);

-- =====================================================================
-- ALTER EXISTING TABLES
-- =====================================================================

-- Add new columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_role" "user_tenant_role";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" "auth_provider" DEFAULT 'local' NOT NULL;

-- Modify email column to be NOT NULL
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

-- Add tenant_id to projects table and rename fields
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;

-- Update projects: copy title to name if name doesn't exist
UPDATE "projects" SET "name" = "title" WHERE "name" IS NULL;

-- Add current_version_id to workflows table and rename fields
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "current_version_id" uuid;
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "name" varchar(255);

-- Update workflows: copy title to name if name doesn't exist
UPDATE "workflows" SET "name" = "title" WHERE "name" IS NULL;

-- Update workflow status enum values if needed
ALTER TABLE "workflows" ALTER COLUMN "status" DROP DEFAULT;
DO $$ BEGIN
 ALTER TABLE "workflows" ALTER COLUMN "status" TYPE text;
EXCEPTION
 WHEN others THEN null;
END $$;

-- Update existing workflow status values
UPDATE "workflows" SET "status" = 'draft' WHERE "status" NOT IN ('draft', 'published');

-- =====================================================================
-- ADD FOREIGN KEY CONSTRAINTS
-- =====================================================================

-- Users to tenants
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Projects to tenants
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk"
 FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Workflow versions to workflows
DO $$ BEGIN
 ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk"
 FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Workflow versions to users
DO $$ BEGIN
 ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_users_id_fk"
 FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Templates to projects
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_project_id_projects_id_fk"
 FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Runs to workflow versions
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_workflow_version_id_workflow_versions_id_fk"
 FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Runs to users
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_users_id_fk"
 FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Secrets to projects
DO $$ BEGIN
 ALTER TABLE "secrets" ADD CONSTRAINT "secrets_project_id_projects_id_fk"
 FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Audit events to users
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk"
 FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- API keys to projects
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk"
 FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Run logs to runs
DO $$ BEGIN
 ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_run_id_runs_id_fk"
 FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- CREATE INDICES
-- =====================================================================

-- Tenants indices
CREATE INDEX IF NOT EXISTS "tenants_plan_idx" ON "tenants" USING btree ("plan");

-- Users indices
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
CREATE INDEX IF NOT EXISTS "users_tenant_idx" ON "users" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");

-- Projects indices
CREATE INDEX IF NOT EXISTS "projects_tenant_idx" ON "projects" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "projects_archived_idx" ON "projects" USING btree ("archived");

-- Workflows indices
CREATE INDEX IF NOT EXISTS "workflows_project_name_idx" ON "workflows" USING btree ("project_id","name");

-- Workflow versions indices
CREATE INDEX IF NOT EXISTS "workflow_versions_workflow_idx" ON "workflow_versions" USING btree ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_versions_published_idx" ON "workflow_versions" USING btree ("published");
CREATE INDEX IF NOT EXISTS "workflow_versions_created_by_idx" ON "workflow_versions" USING btree ("created_by");

-- Templates indices
CREATE INDEX IF NOT EXISTS "templates_project_idx" ON "templates" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "templates_type_idx" ON "templates" USING btree ("type");

-- Runs indices
CREATE INDEX IF NOT EXISTS "runs_workflow_version_idx" ON "runs" USING btree ("workflow_version_id");
CREATE INDEX IF NOT EXISTS "runs_status_idx" ON "runs" USING btree ("status");
CREATE INDEX IF NOT EXISTS "runs_created_by_idx" ON "runs" USING btree ("created_by");
CREATE INDEX IF NOT EXISTS "runs_created_at_idx" ON "runs" USING btree ("created_at");

-- Secrets indices
CREATE INDEX IF NOT EXISTS "secrets_project_idx" ON "secrets" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "secrets_project_key_idx" ON "secrets" USING btree ("project_id","key");

-- Audit events indices
CREATE INDEX IF NOT EXISTS "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "audit_events_ts_idx" ON "audit_events" USING btree ("ts");

-- API keys indices
CREATE INDEX IF NOT EXISTS "api_keys_project_idx" ON "api_keys" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");

-- Run logs indices
CREATE INDEX IF NOT EXISTS "run_logs_run_idx" ON "run_logs" USING btree ("run_id");
CREATE INDEX IF NOT EXISTS "run_logs_level_idx" ON "run_logs" USING btree ("level");
CREATE INDEX IF NOT EXISTS "run_logs_created_at_idx" ON "run_logs" USING btree ("created_at");
