-- Migration to hash workflow run tokens at rest (SHA-256), matching the
-- application's hashToken() util so existing client-held plaintext tokens keep
-- working: lookups hash the incoming token and match the stored hash.
--
-- Safe to run before or after deploying the hashing code: the repository does a
-- dual-read (hash OR raw) during the transition. This migration removes the
-- remaining plaintext from the database.
--
-- Only run_token is hashed here. share_token is intentionally left as plaintext
-- for now because the portal reads it back out to build redownload links; hashing
-- it requires reworking that flow first (tracked as a follow-up).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash any run_token that is not already a 64-char hex SHA-256 digest.
-- Legacy plaintext run tokens are UUIDs, so they never match the hash shape;
-- the guard also makes this migration idempotent.
UPDATE "workflow_runs"
SET "run_token" = encode(digest("run_token", 'sha256'), 'hex')
WHERE "run_token" IS NOT NULL
  AND "run_token" !~ '^[0-9a-f]{64}$';
