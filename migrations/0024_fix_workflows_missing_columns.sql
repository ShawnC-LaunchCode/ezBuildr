-- Migration: Fix missing columns across users, projects, and workflows tables
-- This migration ensures all required columns exist for multi-tenant support
-- Issue: Workflows couldn't be created or listed due to missing columns
-- Root cause: Database schema out of sync with code expectations

-- =====================================================================
-- CREATE TENANTS TABLE IF NOT EXISTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "billing_email" varchar(255),
  "plan" varchar(50) DEFAULT 'free' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- =====================================================================
-- ADD MISSING COLUMNS TO USERS TABLE
-- =====================================================================

-- Add tenant_id column if it doesn't exist
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;

-- Add full_name column if it doesn't exist
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" varchar(255);

-- Add first_name column if it doesn't exist
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" varchar(255);

-- Add last_name column if it doesn't exist
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" varchar(255);

-- Add profile_image_url column if it doesn't exist
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_image_url" varchar(500);

-- =====================================================================
-- ADD MISSING COLUMNS TO PROJECTS TABLE
-- =====================================================================

-- Add tenant_id column if it doesn't exist
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;

-- Add name column if it doesn't exist
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "name" varchar(255);

-- Add archived column if it doesn't exist
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;

-- Copy title to name for existing projects where name is null
UPDATE "projects" SET "name" = "title" WHERE "name" IS NULL AND "title" IS NOT NULL;

-- =====================================================================
-- ADD MISSING COLUMNS TO WORKFLOWS TABLE
-- =====================================================================

-- Add project_id column if it doesn't exist
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "project_id" uuid;

-- Add name column if it doesn't exist
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "name" varchar(255);

-- Add current_version_id column if it doesn't exist
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "current_version_id" uuid;

-- Copy title to name for existing workflows where name is null
UPDATE "workflows" SET "name" = "title" WHERE "name" IS NULL AND "title" IS NOT NULL;

-- =====================================================================
-- CREATE DEFAULT TENANT AND POPULATE FOREIGN KEYS
-- =====================================================================

-- Create or get default tenant and populate all foreign key relationships
DO $$
DECLARE
  default_tenant_id uuid;
  default_project_id uuid;
  first_user_id varchar;
BEGIN
  -- Get or create default tenant
  SELECT id INTO default_tenant_id FROM tenants LIMIT 1;

  IF default_tenant_id IS NULL THEN
    INSERT INTO tenants (name, plan)
    VALUES ('Default Organization', 'free')
    RETURNING id INTO default_tenant_id;
  END IF;

  -- Update all users without tenant_id to use default tenant
  UPDATE users
  SET tenant_id = default_tenant_id
  WHERE tenant_id IS NULL;

  -- Get first user for ownership
  SELECT id INTO first_user_id FROM users LIMIT 1;

  -- Update all projects without tenant_id to use default tenant
  UPDATE projects
  SET tenant_id = default_tenant_id
  WHERE tenant_id IS NULL;

  -- Create a default project if none exists for this tenant
  SELECT id INTO default_project_id FROM projects WHERE tenant_id = default_tenant_id LIMIT 1;

  IF default_project_id IS NULL THEN
    INSERT INTO projects (name, tenant_id, created_by, owner_id)
    VALUES ('Default Project', default_tenant_id, COALESCE(first_user_id, 'system'), COALESCE(first_user_id, 'system'))
    RETURNING id INTO default_project_id;
  END IF;

  -- Update all workflows without project_id to use default project
  UPDATE workflows
  SET project_id = default_project_id
  WHERE project_id IS NULL;

END $$;

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

-- Workflows to projects
DO $$ BEGIN
  ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- CREATE INDICES
-- =====================================================================

-- Users table indices
CREATE INDEX IF NOT EXISTS "users_tenant_idx" ON "users" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");

-- Projects table indices
CREATE INDEX IF NOT EXISTS "projects_tenant_idx" ON "projects" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "projects_archived_idx" ON "projects" USING btree ("archived");

-- Workflows table indices
CREATE INDEX IF NOT EXISTS "workflows_project_idx" ON "workflows" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "workflows_name_idx" ON "workflows" USING btree ("name");
CREATE INDEX IF NOT EXISTS "workflows_project_status_idx" ON "workflows" USING btree ("project_id", "status");
