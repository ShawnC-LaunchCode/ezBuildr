-- Migration 0036: Add column descriptions to DataVault
-- Allows documenting column purpose/usage for better UX

ALTER TABLE datavault_columns
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN datavault_columns.description IS
'Optional description of the column purpose, shown as tooltip in UI';
