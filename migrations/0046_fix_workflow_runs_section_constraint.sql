-- Migration 0046: Fix workflow_runs foreign key constraint
-- Allow sections to be deleted by setting current_section_id to NULL instead of restricting deletion
-- This prevents errors when deleting sections that are referenced by old runs

-- Drop the existing constraint
ALTER TABLE workflow_runs
DROP CONSTRAINT IF EXISTS workflow_runs_current_section_id_sections_id_fk;

-- Recreate with ON DELETE SET NULL
ALTER TABLE workflow_runs
ADD CONSTRAINT workflow_runs_current_section_id_sections_id_fk
FOREIGN KEY (current_section_id)
REFERENCES sections(id)
ON DELETE SET NULL;

-- Add comment explaining the constraint behavior
COMMENT ON CONSTRAINT workflow_runs_current_section_id_sections_id_fk ON workflow_runs IS
'Foreign key to sections table. When a section is deleted, current_section_id is set to NULL for affected runs.';
