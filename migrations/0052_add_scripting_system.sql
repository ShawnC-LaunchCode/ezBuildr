-- ===================================================================
-- CUSTOM SCRIPTING SYSTEM MIGRATION
-- Created: December 7, 2025
-- Purpose: Add lifecycle hooks, document hooks, and script execution logging
-- ===================================================================

-- ===================================================================
-- ENUMS
-- ===================================================================

-- Lifecycle hook phases
CREATE TYPE lifecycle_hook_phase AS ENUM (
  'beforePage',              -- Before section renders
  'afterPage',               -- After section submit
  'beforeFinalBlock',        -- Before document generation
  'afterDocumentsGenerated'  -- After all documents created
);

-- Document hook phases
CREATE TYPE document_hook_phase AS ENUM (
  'beforeGeneration',  -- Before template processing
  'afterGeneration'    -- After document created
);

-- Script execution status
CREATE TYPE script_execution_status AS ENUM (
  'success',
  'error',
  'timeout'
);

-- ===================================================================
-- LIFECYCLE HOOKS TABLE
-- ===================================================================
CREATE TABLE lifecycle_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE, -- nullable for workflow-level hooks
  name VARCHAR(255) NOT NULL,
  phase lifecycle_hook_phase NOT NULL,
  language transform_block_language NOT NULL, -- javascript | python
  code TEXT NOT NULL,
  input_keys TEXT[] NOT NULL DEFAULT '{}',
  output_keys TEXT[] NOT NULL DEFAULT '{}', -- Can output multiple values
  virtual_step_ids UUID[] DEFAULT '{}', -- Multiple virtual steps for multi-output
  enabled BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER DEFAULT 1000,
  mutation_mode BOOLEAN DEFAULT false, -- true = can modify data, false = read-only
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for lifecycle hooks
CREATE INDEX lifecycle_hooks_workflow_idx ON lifecycle_hooks(workflow_id);
CREATE INDEX lifecycle_hooks_phase_idx ON lifecycle_hooks(workflow_id, phase);
CREATE INDEX lifecycle_hooks_section_idx ON lifecycle_hooks(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX lifecycle_hooks_enabled_idx ON lifecycle_hooks(workflow_id, enabled) WHERE enabled = true;

-- ===================================================================
-- DOCUMENT HOOKS TABLE
-- ===================================================================
CREATE TABLE document_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  final_block_document_id VARCHAR(255), -- Maps to FinalBlockConfig.documents[].documentId
  name VARCHAR(255) NOT NULL,
  phase document_hook_phase NOT NULL,
  language transform_block_language NOT NULL,
  code TEXT NOT NULL,
  input_keys TEXT[] NOT NULL DEFAULT '{}',
  output_keys TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER DEFAULT 3000, -- Longer timeout for document processing
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for document hooks
CREATE INDEX document_hooks_workflow_idx ON document_hooks(workflow_id);
CREATE INDEX document_hooks_phase_idx ON document_hooks(workflow_id, phase);
CREATE INDEX document_hooks_enabled_idx ON document_hooks(workflow_id, enabled) WHERE enabled = true;
CREATE INDEX document_hooks_document_idx ON document_hooks(workflow_id, final_block_document_id) WHERE final_block_document_id IS NOT NULL;

-- ===================================================================
-- SCRIPT EXECUTION LOG TABLE
-- ===================================================================
CREATE TABLE script_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  script_type VARCHAR(50) NOT NULL, -- 'transform_block' | 'lifecycle_hook' | 'document_hook'
  script_id UUID NOT NULL, -- ID of the transform block, lifecycle hook, or document hook
  script_name VARCHAR(255), -- Name of the script for easier debugging
  phase VARCHAR(50), -- Phase name for context
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  status script_execution_status NOT NULL,
  error_message TEXT,
  console_output JSONB, -- Array of console.log() calls
  input_sample JSONB, -- First 1KB of input
  output_sample JSONB, -- First 1KB of output
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for script execution log
CREATE INDEX script_execution_log_run_idx ON script_execution_log(run_id);
CREATE INDEX script_execution_log_script_idx ON script_execution_log(script_type, script_id);
CREATE INDEX script_execution_log_status_idx ON script_execution_log(status);
CREATE INDEX script_execution_log_created_idx ON script_execution_log(created_at DESC);

-- ===================================================================
-- EXTEND EXISTING TABLES
-- ===================================================================

-- Add console_enabled flag to transform_blocks
ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS console_enabled BOOLEAN DEFAULT false;

-- Add index for console-enabled transform blocks
CREATE INDEX transform_blocks_console_enabled_idx ON transform_blocks(workflow_id, console_enabled) WHERE console_enabled = true;

-- ===================================================================
-- COMMENTS
-- ===================================================================

COMMENT ON TABLE lifecycle_hooks IS 'Workflow lifecycle scripts that execute at specific phases (beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated)';
COMMENT ON TABLE document_hooks IS 'Document transformation scripts that execute before/after document generation';
COMMENT ON TABLE script_execution_log IS 'Audit trail for all script executions with console output, errors, and performance metrics';

COMMENT ON COLUMN lifecycle_hooks.mutation_mode IS 'If true, script can modify workflow data; if false, read-only access';
COMMENT ON COLUMN lifecycle_hooks.virtual_step_ids IS 'Array of virtual step IDs for persisting multiple output values';
COMMENT ON COLUMN lifecycle_hooks.section_id IS 'Optional section scope; if null, hook runs at workflow level';

COMMENT ON COLUMN document_hooks.final_block_document_id IS 'Optional document ID from Final Block config; if null, hook runs for all documents';
COMMENT ON COLUMN document_hooks.timeout_ms IS 'Longer timeout (3000ms default) for document processing operations';

COMMENT ON COLUMN script_execution_log.console_output IS 'JSONB array of console.log/warn/error calls from script execution';
COMMENT ON COLUMN script_execution_log.input_sample IS 'Sample of input data (first 1KB) for debugging';
COMMENT ON COLUMN script_execution_log.output_sample IS 'Sample of output data (first 1KB) for debugging';

-- ===================================================================
-- DATA RETENTION POLICY (Optional Trigger)
-- ===================================================================

-- Function to auto-delete logs older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_script_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM script_execution_log
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- This is commented out by default - enable if pg_cron is available
-- (Cron scheduling commented out)

COMMENT ON FUNCTION cleanup_old_script_logs IS 'Deletes script execution logs older than 30 days to prevent unbounded table growth';

-- ===================================================================
-- END OF MIGRATION
-- ===================================================================
