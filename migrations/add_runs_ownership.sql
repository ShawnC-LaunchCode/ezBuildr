-- Migration: Add Ownership to Workflow Runs
-- Description: Adds owner_type and owner_uuid to workflowRuns table for org collaboration
-- Date: 2026-01-05

-- ====================================
-- 1. Add ownership columns to workflowRuns
-- ====================================

ALTER TABLE "workflowRuns" ADD COLUMN IF NOT EXISTS owner_type VARCHAR(50) CHECK (owner_type IN ('user', 'org'));
ALTER TABLE "workflowRuns" ADD COLUMN IF NOT EXISTS owner_uuid UUID;

-- Create indexes for ownership queries
CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner ON "workflowRuns"(owner_type, owner_uuid);

-- ====================================
-- 2. Backfill existing runs with user ownership
-- ====================================

-- Set runs to user ownership based on createdBy (the user who created the run)
UPDATE "workflowRuns"
SET owner_type = 'user', owner_uuid = "createdBy"::uuid
WHERE owner_type IS NULL AND "createdBy" IS NOT NULL;

-- ====================================
-- 3. Inherit ownership from workflow for runs without createdBy
-- ====================================

-- For runs that don't have createdBy, inherit from workflow ownership
UPDATE "workflowRuns" r
SET owner_type = w.owner_type, owner_uuid = w.owner_uuid
FROM workflows w
WHERE r."workflowId" = w.id
  AND r.owner_type IS NULL
  AND w.owner_type IS NOT NULL;

-- ====================================
-- 4. Add comments for documentation
-- ====================================

COMMENT ON COLUMN "workflowRuns".owner_type IS 'Owner type: user or org';
COMMENT ON COLUMN "workflowRuns".owner_uuid IS 'UUID of the owning user or organization';
