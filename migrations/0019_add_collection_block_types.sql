-- Migration: Add collection block types for workflow integration
-- Stage 19 PR 8: Workflow Node Integration

-- Add new values to block_type enum
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'create_record';
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'update_record';
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'find_record';
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'delete_record';

-- No table changes needed - blocks table already exists and supports these new types via config JSONB
