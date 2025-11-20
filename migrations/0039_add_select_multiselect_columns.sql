-- Migration: Add select and multiselect column types to DataVault
-- Date: 2025-11-20
-- Description: Adds 'select' and 'multiselect' types to datavault_column_type enum
--              and adds 'options' jsonb column to datavault_columns table

-- Step 1: Add new column types to the enum
ALTER TYPE datavault_column_type ADD VALUE IF NOT EXISTS 'select';
ALTER TYPE datavault_column_type ADD VALUE IF NOT EXISTS 'multiselect';

-- Step 2: Add options column to datavault_columns table
-- This column will store an array of {label, value, color} objects for select/multiselect columns
ALTER TABLE datavault_columns
ADD COLUMN IF NOT EXISTS options jsonb;

-- Step 3: Add comment to the options column
COMMENT ON COLUMN datavault_columns.options IS 'For select/multiselect columns: array of {label, value, color} option objects';
