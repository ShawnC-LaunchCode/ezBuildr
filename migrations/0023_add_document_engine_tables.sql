-- Migration: Add Document Generation Engine 2.0 tables
-- Stage 21 PR 1: DB & Schema Changes
-- Date: 2025-11-14
--
-- Adds:
-- - output_status enum ('pending', 'ready', 'failed')
-- - output_file_type enum ('docx', 'pdf')
-- - description column to templates table
-- - workflow_templates table (multi-template support per workflow)
-- - run_outputs table (tracks generated documents per run)

-- ========================================
-- ENUMS
-- ========================================

-- Add output status enum
CREATE TYPE output_status AS ENUM ('pending', 'ready', 'failed');

-- Add output file type enum
CREATE TYPE output_file_type AS ENUM ('docx', 'pdf');

-- ========================================
-- TEMPLATES TABLE ENHANCEMENT
-- ========================================

-- Add description column to templates table
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS description text DEFAULT NULL;

COMMENT ON COLUMN templates.description IS 'Stage 21: Template description for documentation and UI display';

-- ========================================
-- WORKFLOW TEMPLATES TABLE (NEW)
-- ========================================

-- Create workflow_templates table for multi-template support
CREATE TABLE IF NOT EXISTS workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  key text NOT NULL, -- e.g., 'engagement_letter', 'schedule_a'
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for workflow_templates
CREATE INDEX IF NOT EXISTS workflow_templates_version_idx ON workflow_templates(workflow_version_id);
CREATE INDEX IF NOT EXISTS workflow_templates_template_idx ON workflow_templates(template_id);
CREATE INDEX IF NOT EXISTS workflow_templates_key_idx ON workflow_templates(key);

-- Unique constraint: one template per key per workflow version
CREATE UNIQUE INDEX IF NOT EXISTS workflow_templates_version_key_unique
  ON workflow_templates(workflow_version_id, key);

COMMENT ON TABLE workflow_templates IS 'Stage 21: Maps templates to workflow versions, allowing multiple templates per workflow';
COMMENT ON COLUMN workflow_templates.key IS 'Unique key identifying the template within a workflow (e.g., engagement_letter, schedule_a)';
COMMENT ON COLUMN workflow_templates.is_primary IS 'Indicates if this is the primary/default template for the workflow';

-- ========================================
-- RUN OUTPUTS TABLE (NEW)
-- ========================================

-- Create run_outputs table for tracking generated documents
CREATE TABLE IF NOT EXISTS run_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  template_key text NOT NULL, -- Reference to workflow_templates.key
  file_type output_file_type NOT NULL, -- 'docx' or 'pdf'
  storage_path text NOT NULL, -- Path to generated file
  status output_status NOT NULL DEFAULT 'pending', -- 'pending', 'ready', 'failed'
  error text DEFAULT NULL, -- Error message if status is 'failed'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for run_outputs
CREATE INDEX IF NOT EXISTS run_outputs_run_idx ON run_outputs(run_id);
CREATE INDEX IF NOT EXISTS run_outputs_template_key_idx ON run_outputs(template_key);
CREATE INDEX IF NOT EXISTS run_outputs_status_idx ON run_outputs(status);
CREATE INDEX IF NOT EXISTS run_outputs_workflow_version_idx ON run_outputs(workflow_version_id);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS run_outputs_run_template_type_idx
  ON run_outputs(run_id, template_key, file_type);

COMMENT ON TABLE run_outputs IS 'Stage 21: Tracks generated document outputs for each workflow run';
COMMENT ON COLUMN run_outputs.template_key IS 'References the key from workflow_templates table';
COMMENT ON COLUMN run_outputs.file_type IS 'Output file format (docx or pdf)';
COMMENT ON COLUMN run_outputs.storage_path IS 'Path to the generated file in storage';
COMMENT ON COLUMN run_outputs.status IS 'Generation status: pending (queued), ready (available), failed (error occurred)';

-- ========================================
-- END OF MIGRATION
-- ========================================
