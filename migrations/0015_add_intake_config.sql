-- Migration: Add intakeConfig to workflows table for Stage 12.5
-- Date: 2025-11-13
-- Description: Adds JSONB column for intake portal configuration (prefill, CAPTCHA, email receipts)

-- Add intakeConfig column to workflows table
ALTER TABLE workflows
ADD COLUMN IF NOT EXISTS "intake_config" JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Add index for faster queries on intake config
CREATE INDEX IF NOT EXISTS workflows_intake_config_idx ON workflows USING gin("intake_config");

-- Add comment for documentation
COMMENT ON COLUMN workflows.intake_config IS 'Stage 12.5: Intake portal configuration including allowPrefill, allowedPrefillKeys, requireCaptcha, captchaType, sendEmailReceipt, receiptEmailVar';
