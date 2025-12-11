-- Migration 0031: Fix survey_status enum to include 'active'
-- Issue: Some survey records have status='active' but survey_status enum only has ['draft', 'open', 'closed']
-- This migration adds 'active' and 'archived' to survey_status enum for consistency with workflow_status

DO $$
DECLARE
    v_type_exists boolean;
BEGIN
    -- Check if survey_status enum type exists
    SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'survey_status'
    ) INTO v_type_exists;

    -- Only proceed if the enum type exists
    IF v_type_exists THEN
        -- Add 'active' to survey_status enum if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'survey_status' AND e.enumlabel = 'active'
        ) THEN
            ALTER TYPE survey_status ADD VALUE 'active';
        END IF;

        -- Add 'archived' to survey_status enum if it doesn't exist (for consistency)
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'survey_status' AND e.enumlabel = 'archived'
        ) THEN
            ALTER TYPE survey_status ADD VALUE 'archived';
        END IF;
    END IF;
END $$;
