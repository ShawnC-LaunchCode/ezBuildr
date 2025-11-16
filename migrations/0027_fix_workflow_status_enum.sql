-- Migration 0027: Fix workflow_status enum values
-- Issue: Database schema used 'draft' and 'published', but frontend expects 'draft', 'active', and 'archived'
-- This migration adds the missing enum values and updates existing records

DO $$
BEGIN
    -- Add 'active' to enum if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'active'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'workflow_status')
    ) THEN
        ALTER TYPE workflow_status ADD VALUE 'active';
    END IF;

    -- Add 'archived' to enum if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'archived'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'workflow_status')
    ) THEN
        ALTER TYPE workflow_status ADD VALUE 'archived';
    END IF;
END $$;

-- Update any existing 'published' records to 'active'
UPDATE workflows SET status = 'active' WHERE status = 'published';

-- Note: We cannot remove 'published' from the enum without recreating it
-- Leaving it in the enum for backward compatibility doesn't cause issues
