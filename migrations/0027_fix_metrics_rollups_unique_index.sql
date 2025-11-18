-- Migration: Fix metrics_rollups unique index to include tenant_id
-- Date: 2025-11-15
-- Description: The current unique index on metrics_rollups doesn't include tenant_id,
--              which causes issues in a multi-tenant system. This migration drops the
--              old index and creates a new one that includes tenant_id.

-- Drop the old unique index
DROP INDEX IF EXISTS metrics_rollups_unique_idx;

-- Create new unique index with tenant_id included
CREATE UNIQUE INDEX metrics_rollups_unique_idx ON metrics_rollups(
  tenant_id,
  project_id,
  COALESCE(workflow_id, '00000000-0000-0000-0000-000000000000'::uuid),
  bucket_start,
  bucket
);

-- Verification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'metrics_rollups_unique_idx'
    AND tablename = 'metrics_rollups'
  ) THEN
    RAISE EXCEPTION 'Migration failed: metrics_rollups_unique_idx not found';
  END IF;

  RAISE NOTICE 'Migration 0026 completed successfully!';
  RAISE NOTICE 'Updated unique index to include tenant_id for proper multi-tenant isolation';
END $$;
