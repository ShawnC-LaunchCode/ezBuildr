-- Migration: Add Step Aliases for Variable References
-- Add alias column to steps table for human-friendly variable names

-- Add alias column (nullable, optional)
ALTER TABLE steps ADD COLUMN alias TEXT;

-- Add comment for documentation
COMMENT ON COLUMN steps.alias IS 'Optional human-friendly variable name for referencing this step in logic and blocks';

-- Create a unique partial index for non-null aliases within a section
-- This enforces uniqueness of aliases per section while allowing NULL values
-- Note: We index on (section_id, alias) to ensure uniqueness within each section
CREATE UNIQUE INDEX idx_steps_alias_unique_per_section
ON steps (section_id, alias)
WHERE alias IS NOT NULL;

-- Add a regular index for faster alias lookups
CREATE INDEX idx_steps_alias ON steps(alias) WHERE alias IS NOT NULL;
