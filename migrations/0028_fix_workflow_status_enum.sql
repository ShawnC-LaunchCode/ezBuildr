-- Migration 0028: Fix workflow_status enum values
-- Issue: Database schema used 'draft' and 'published', but frontend expects 'draft', 'active', and 'archived'
-- Note: workflows.status is actually a TEXT column (not enum), so this migration just updates values

-- Update any existing 'published' records to 'active'
UPDATE workflows SET status = 'active' WHERE status = 'published';

-- Ensure all workflows have a valid status
UPDATE workflows SET status = 'draft' WHERE status IS NULL OR status NOT IN ('draft', 'active', 'archived');
