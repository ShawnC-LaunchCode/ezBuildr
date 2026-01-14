-- Migration: Add missing columns to projects table and updatedAt to mutable tables
-- Date: 2025-11-14
-- Description: Fixes critical schema inconsistencies across multiple tables
--
-- Part 1: Projects table
-- This migration adds columns that are referenced in the codebase but missing from the database:
-- - created_by: References the user who created the project
-- - owner_id: References the current owner of the project
-- - status: Project status enum (active/archived) - more flexible than boolean archived flag
--
-- Part 2: Add updatedAt columns to mutable tables
-- - sections.updated_at: Track when sections are modified
-- - steps.updated_at: Track when steps are modified
-- - logic_rules.updated_at: Track when logic rules are modified
--
-- Note: This completes the incomplete migration 0024 which tried to reference these columns
-- but never created them.

-- =====================================================================
-- ADD MISSING COLUMNS TO PROJECTS TABLE
-- =====================================================================

-- Add created_by column if it doesn't exist
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by" varchar;

-- Add owner_id column if it doesn't exist
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "owner_id" varchar;

-- Add status column if it doesn't exist
-- Using varchar instead of enum for now since enum may not exist yet
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'active';

-- =====================================================================
-- BACKFILL DATA FOR EXISTING PROJECTS
-- =====================================================================

DO $$
DECLARE
  first_user_id varchar;
  default_tenant_id uuid;
BEGIN
  -- Get the first user ID (fallback for existing projects)
  SELECT id INTO first_user_id FROM users ORDER BY created_at LIMIT 1;

  -- Get default tenant ID
  SELECT id INTO default_tenant_id FROM tenants WHERE name = 'Default Organization' LIMIT 1;

  -- If no users exist yet, we'll leave these NULL for now
  IF first_user_id IS NOT NULL THEN
    -- Backfill created_by for existing projects
    UPDATE projects
    SET created_by = COALESCE(created_by, first_user_id)
    WHERE created_by IS NULL;

    -- Backfill owner_id (same as created_by for existing projects)
    UPDATE projects
    SET owner_id = COALESCE(owner_id, created_by, first_user_id)
    WHERE owner_id IS NULL;
  END IF;

  -- Backfill status based on archived flag
  UPDATE projects
  SET status = CASE
    WHEN archived = true THEN 'archived'
    ELSE 'active'
  END
  WHERE status IS NULL OR status = '';

END $$;

-- =====================================================================
-- ADD CONSTRAINTS
-- =====================================================================

-- Make created_by NOT NULL after backfill
-- Note: This will fail if there are no users. In that case, run this migration after creating first user
DO $$
BEGIN
  -- Only add NOT NULL constraint if all projects have created_by
  IF NOT EXISTS (SELECT 1 FROM projects WHERE created_by IS NULL) THEN
    ALTER TABLE projects ALTER COLUMN created_by SET NOT NULL;
  ELSE
    RAISE NOTICE 'Warning: Some projects have NULL created_by. Cannot add NOT NULL constraint yet.';
  END IF;
END $$;

-- Make owner_id NOT NULL after backfill
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE owner_id IS NULL) THEN
    ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'Warning: Some projects have NULL owner_id. Cannot add NOT NULL constraint yet.';
  END IF;
END $$;

-- Make status NOT NULL
ALTER TABLE projects ALTER COLUMN status SET NOT NULL;
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'active';

-- Add foreign key constraints
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Foreign key projects_created_by_users_id_fk already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Foreign key projects_owner_id_users_id_fk already exists, skipping';
END $$;

-- =====================================================================
-- ADD INDICES FOR PERFORMANCE
-- =====================================================================

-- Index on created_by for queries like "find all projects created by user X"
CREATE INDEX IF NOT EXISTS "projects_created_by_idx" ON "projects" USING btree ("created_by");

-- Index on owner_id for queries like "find all projects owned by user X"
CREATE INDEX IF NOT EXISTS "projects_owner_idx" ON "projects" USING btree ("owner_id");

-- Index on status for filtering active vs archived projects
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" USING btree ("status");

-- Composite index for tenant + status queries (common pattern)
CREATE INDEX IF NOT EXISTS "projects_tenant_status_idx" ON "projects" USING btree ("tenant_id", "status");

-- =====================================================================
-- PART 2: ADD UPDATED_AT COLUMNS TO MUTABLE TABLES
-- =====================================================================

-- Add updated_at to sections table
ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- Add updated_at to steps table
ALTER TABLE "steps" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- Add updated_at to logic_rules table
ALTER TABLE "logic_rules" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

-- Backfill updated_at with created_at for existing records
UPDATE sections SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE steps SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE logic_rules SET updated_at = created_at WHERE updated_at IS NULL;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Verify the columns exist
DO $$
BEGIN
  -- Check created_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'created_by'
  ) THEN
    RAISE EXCEPTION 'Migration failed: created_by column not found';
  END IF;

  -- Check owner_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: owner_id column not found';
  END IF;

  -- Check status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'Migration failed: status column not found';
  END IF;

  -- Check sections.updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sections' AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'Migration failed: sections.updated_at column not found';
  END IF;

  -- Check steps.updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'steps' AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'Migration failed: steps.updated_at column not found';
  END IF;

  -- Check logic_rules.updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logic_rules' AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'Migration failed: logic_rules.updated_at column not found';
  END IF;

  RAISE NOTICE 'Migration 0025 completed successfully!';
  RAISE NOTICE 'Part 1: Added columns to projects: created_by, owner_id, status';
  RAISE NOTICE 'Part 2: Added updated_at to: sections, steps, logic_rules';
  RAISE NOTICE 'All tables are now consistent with TypeScript schema';
END $$;
