-- Migration 0029: Fix survey_status enum to include 'active'
-- Issue: Some survey records have status='active' but survey_status enum only has ['draft', 'open', 'closed']
-- This migration adds 'active' and 'archived' to survey_status enum for consistency with workflow_status

DO $$
BEGIN
    -- Add 'active' to survey_status enum if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'active'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'survey_status')
    ) THEN
        ALTER TYPE survey_status ADD VALUE 'active';
    END IF;

    -- Add 'archived' to survey_status enum if it doesn't exist (for consistency)
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'archived'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'survey_status')
    ) THEN
        ALTER TYPE survey_status ADD VALUE 'archived';
    END IF;
END $$;
