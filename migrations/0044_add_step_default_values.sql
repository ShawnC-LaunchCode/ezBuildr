-- Migration: Add default_value column to steps table
-- Purpose: Support default values for workflow steps (used in preview and URL params)
-- Date: 2025-11-25

-- Add default_value column to steps table
ALTER TABLE steps ADD COLUMN IF NOT EXISTS default_value JSONB;

-- Add comment for documentation
COMMENT ON COLUMN steps.default_value IS 'Default value shown in preview and when workflow runs. Can be overridden by URL parameters during run creation.';
