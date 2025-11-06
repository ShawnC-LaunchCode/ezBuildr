-- Migration: Add Easy/Advanced Mode columns
-- Add defaultMode to users table (account-level default)
ALTER TABLE users ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'easy';

-- Add comment for documentation
COMMENT ON COLUMN users.default_mode IS 'User account default mode: easy or advanced';

-- Add modeOverride to workflows table (per-workflow override, nullable)
ALTER TABLE workflows ADD COLUMN mode_override TEXT;

-- Add comment for documentation
COMMENT ON COLUMN workflows.mode_override IS 'Per-workflow mode override: easy, advanced, or null to use user default';

-- Add check constraints to ensure valid values
ALTER TABLE users ADD CONSTRAINT users_default_mode_check CHECK (default_mode IN ('easy', 'advanced'));
ALTER TABLE workflows ADD CONSTRAINT workflows_mode_override_check CHECK (mode_override IS NULL OR mode_override IN ('easy', 'advanced'));

-- Create index for faster queries on mode fields
CREATE INDEX idx_users_default_mode ON users(default_mode);
CREATE INDEX idx_workflows_mode_override ON workflows(mode_override);
