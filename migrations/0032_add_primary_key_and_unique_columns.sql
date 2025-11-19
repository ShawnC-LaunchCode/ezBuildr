-- Migration 0032: Add isPrimaryKey and isUnique fields to datavault_columns
-- This enables proper primary key management and unique constraints in DataVault tables

-- Add isPrimaryKey column (one primary key per table)
ALTER TABLE datavault_columns
ADD COLUMN is_primary_key BOOLEAN NOT NULL DEFAULT false;

-- Add isUnique column (unique constraint on values)
ALTER TABLE datavault_columns
ADD COLUMN is_unique BOOLEAN NOT NULL DEFAULT false;

-- Add index for faster primary key lookups
CREATE INDEX datavault_columns_primary_key_idx ON datavault_columns(table_id, is_primary_key) WHERE is_primary_key = true;

-- Add comment explaining the primary key constraint
COMMENT ON COLUMN datavault_columns.is_primary_key IS 'Marks this column as the primary key for the table. Each table should have exactly one primary key column.';
COMMENT ON COLUMN datavault_columns.is_unique IS 'Enforces unique values for this column across all rows in the table.';

-- Note: We don't add a database-level unique constraint for "one primary key per table"
-- because this is enforced at the application layer in DatavaultColumnsService
-- to provide better error messages and allow for flexible migrations.
