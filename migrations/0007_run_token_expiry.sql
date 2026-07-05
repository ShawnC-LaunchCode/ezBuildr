-- Migration to add an expiry to workflow run tokens (bearer credentials).
-- Run tokens previously never expired. New runs will populate token_expires_at;
-- existing rows are left NULL and are grandfathered (treated as never-expiring)
-- so live in-progress runs are not broken by this change.

-- Add nullable expiry column. NULL = grandfathered / never expires.
ALTER TABLE "workflow_runs"
ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp;

-- Partial index to keep expiry lookups cheap for rows that actually have one.
CREATE INDEX IF NOT EXISTS "workflow_runs_token_expires_at_idx"
ON "workflow_runs" ("token_expires_at")
WHERE "token_expires_at" IS NOT NULL;
