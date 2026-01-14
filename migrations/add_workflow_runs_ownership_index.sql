-- Migration: Add Ownership Index to Workflow Runs
-- Description: Improves query performance for listing runs by organization
-- Date: 2026-01-05
-- FIX #10: Add missing index on workflowRuns(owner_type, owner_uuid)

-- ====================================
-- 1. Add composite index for ownership queries
-- ====================================

-- This index supports queries like:
-- SELECT * FROM workflow_runs WHERE owner_type = 'org' AND owner_uuid = '<orgId>'
CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner ON "workflowRuns"(owner_type, owner_uuid);

-- ====================================
-- 2. Add comments for documentation
-- ====================================

COMMENT ON INDEX idx_workflow_runs_owner IS 'Performance index for querying runs by owner (user or organization)';
