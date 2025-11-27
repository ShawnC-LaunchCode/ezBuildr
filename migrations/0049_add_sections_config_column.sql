-- Migration: Add config column to sections table
-- Purpose: Store section-specific configuration (Final Documents, etc.)
-- Date: 2025-11-27
--
-- Adds 'config' JSONB column to sections table for storing section-specific
-- configuration such as Final Documents settings

-- Add config column to sections table
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN sections.config IS 'Section configuration. For Final Documents sections: { finalBlock: true, templates: [uuid], screenTitle: string, markdownMessage: string, advanced: {} }';

-- Create an index for querying by config properties (e.g., finalBlock)
CREATE INDEX IF NOT EXISTS sections_config_idx ON sections USING GIN (config);

-- No data migration needed (new optional field with default)
