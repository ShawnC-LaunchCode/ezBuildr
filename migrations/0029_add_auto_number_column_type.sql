-- Migration: Add Auto-Number Column Type
-- Description: Adds 'auto_number' type to datavault_column_type enum and auto_number_start column
-- Date: November 17, 2025

-- =====================================================================
-- ADD AUTO_NUMBER TYPE TO ENUM
-- =====================================================================

-- Add 'auto_number' to the datavault_column_type enum
ALTER TYPE "datavault_column_type" ADD VALUE IF NOT EXISTS 'auto_number';

-- =====================================================================
-- ADD AUTO_NUMBER_START COLUMN
-- =====================================================================

-- Add auto_number_start column to datavault_columns table
-- This stores the starting value for auto-number columns (defaults to 1)
ALTER TABLE "datavault_columns"
ADD COLUMN IF NOT EXISTS "auto_number_start" integer DEFAULT 1;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Migration complete. Auto-number feature is now available for DataVault tables.
-- When a column has type 'auto_number', rows will automatically get sequential numbers.
