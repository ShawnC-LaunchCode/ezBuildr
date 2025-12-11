-- Add 'reference' type to datavault_column_type enum
-- Note: PostgreSQL doesn't support ALTER TYPE ... ADD VALUE in transactions,
-- so this must be run separately if in a transaction block
DO $$
DECLARE
    v_type_exists boolean;
BEGIN
  -- Check if datavault_column_type enum type exists
  SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'datavault_column_type'
  ) INTO v_type_exists;

  -- Only proceed if the enum type exists
  IF v_type_exists THEN
    -- Check if 'reference' value already exists in the enum
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'datavault_column_type' AND e.enumlabel = 'reference'
    ) THEN
      ALTER TYPE datavault_column_type ADD VALUE 'reference';
    END IF;
  END IF;
END $$;

-- Add reference columns to datavault_columns table
ALTER TABLE datavault_columns
ADD COLUMN IF NOT EXISTS reference_table_id UUID,
ADD COLUMN IF NOT EXISTS reference_display_column_slug TEXT;

-- Add index for reference_table_id for performance
CREATE INDEX IF NOT EXISTS datavault_columns_reference_table_idx
ON datavault_columns(reference_table_id);

-- Comments for documentation
COMMENT ON COLUMN datavault_columns.reference_table_id IS 'Reference to another datavault table (for reference type columns)';
COMMENT ON COLUMN datavault_columns.reference_display_column_slug IS 'Slug of column to display from referenced table';
