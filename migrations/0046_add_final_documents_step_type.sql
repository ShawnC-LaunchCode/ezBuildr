-- Migration: Add final_documents step type
-- Purpose: Support Final Documents Block feature for document generation
-- Date: 2025-11-26
--
-- Adds 'final_documents' type to step_type enum for Final Documents sections

-- Add 'final_documents' to step_type enum
ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'final_documents';

-- No additional columns needed - Final Documents configuration
-- is stored in sections.config as:
-- {
--   "finalBlock": true,
--   "templates": ["uuid1", "uuid2", ...],
--   "screenTitle": "Your Completed Documents",
--   "markdownMessage": "# Thank You!\nYour documents are ready below.",
--   "advanced": {}
-- }

-- Add comment for documentation
COMMENT ON TYPE step_type IS 'Step types including final_documents for document generation sections';
