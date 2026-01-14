-- Migration: Add Email Tracking to Organization Invites
-- Description: Adds email tracking fields to monitor invite email delivery
-- Date: 2026-01-05

-- ====================================
-- 1. Add email tracking columns
-- ====================================

ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP;
ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS email_failed BOOLEAN DEFAULT FALSE;
ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS email_error TEXT;

-- Create index for failed emails (for retry jobs)
CREATE INDEX IF NOT EXISTS idx_org_invites_email_failed ON organization_invites(email_failed, created_at);

-- ====================================
-- 2. Backfill existing invites
-- ====================================

-- Assume existing invites had email sent (legacy behavior)
UPDATE organization_invites
SET email_sent_at = created_at, email_failed = FALSE
WHERE email_sent_at IS NULL;

-- ====================================
-- 3. Add comments for documentation
-- ====================================

COMMENT ON COLUMN organization_invites.email_sent_at IS 'Timestamp when invitation email was successfully sent';
COMMENT ON COLUMN organization_invites.email_failed IS 'True if email send failed';
COMMENT ON COLUMN organization_invites.email_error IS 'Error message if email send failed';
