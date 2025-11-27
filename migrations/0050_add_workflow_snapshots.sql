-- Migration 0050: Add workflow_snapshots table for versioned test data

CREATE TABLE workflow_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  values JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure unique names per workflow
  CONSTRAINT unique_workflow_snapshot_name UNIQUE (workflow_id, name)
);

-- Index for faster lookups by workflow
CREATE INDEX idx_workflow_snapshots_workflow_id ON workflow_snapshots(workflow_id);

-- Index for sorting by creation date
CREATE INDEX idx_workflow_snapshots_created_at ON workflow_snapshots(workflow_id, created_at DESC);

-- Comment on the table
COMMENT ON TABLE workflow_snapshots IS 'Stores versioned snapshots of workflow test data for preview and testing';
COMMENT ON COLUMN workflow_snapshots.values IS 'JSONB map of step keys to {value, stepId, stepUpdatedAt}';
