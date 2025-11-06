-- Migration: Remove participants and add run token auth
-- This migration removes the participants table and makes workflow runs independent
-- Runs can now be started by creators (authenticated) or anonymously (via publicLink)

-- Drop foreign key constraint from workflow_runs to participants (if exists)
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_participant_id_participants_id_fk";

-- Drop participantId column from workflow_runs
ALTER TABLE "workflow_runs" DROP COLUMN IF EXISTS "participant_id";

-- Drop participants table
DROP TABLE IF EXISTS "participants" CASCADE;

-- Add new columns to workflow_runs for token-based auth
ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "run_token" text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS "created_by" text,
  ADD COLUMN IF NOT EXISTS "current_section_id" uuid,
  ADD COLUMN IF NOT EXISTS "progress" integer DEFAULT 0;

-- Add unique constraint on run_token
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_run_token_unique" UNIQUE ("run_token");

-- Add foreign key for current_section_id
ALTER TABLE "workflow_runs"
  ADD CONSTRAINT "workflow_runs_current_section_id_sections_id_fk"
  FOREIGN KEY ("current_section_id") REFERENCES "sections"("id") ON DELETE set null ON UPDATE no action;

-- Add publicLink to workflows for anonymous access
ALTER TABLE "workflows"
  ADD COLUMN IF NOT EXISTS "public_link" text;

-- Add unique constraint on publicLink
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_public_link_unique" UNIQUE ("public_link");

-- Create indices for new columns
CREATE INDEX IF NOT EXISTS "workflow_runs_run_token_idx" ON "workflow_runs" ("run_token");
CREATE INDEX IF NOT EXISTS "workflows_public_link_idx" ON "workflows" ("public_link");

-- Drop old participant index if it exists
DROP INDEX IF EXISTS "workflow_runs_participant_idx";
