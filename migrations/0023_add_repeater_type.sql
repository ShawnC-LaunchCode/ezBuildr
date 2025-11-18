-- Migration: Add repeater field type
-- Stage 20 PR 4: Repeating Groups (Repeaters)
-- Date: 2025-11-14
--
-- Adds 'repeater' type to step_type enum for collecting multiple instances
-- of the same set of questions (e.g., dependents, addresses, work history)

-- Add 'repeater' to step_type enum
ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'repeater';

-- Add repeater configuration column to steps table
-- Stores nested field definitions and repeater settings
ALTER TABLE steps
ADD COLUMN IF NOT EXISTS repeater_config jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN steps.repeater_config IS 'Configuration for repeater fields. Format: { fields: [ { id, type, title, ... } ], minInstances: number, maxInstances: number, addButtonText: string, removeButtonText: string }';

-- No data migration needed (new type and optional field)
