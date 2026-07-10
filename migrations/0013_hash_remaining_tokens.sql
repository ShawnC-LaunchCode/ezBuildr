CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
-- 1. Rename columns
ALTER TABLE "oauth_access_tokens" RENAME COLUMN "access_token" TO "access_token_hash";
--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" RENAME COLUMN "refresh_token" TO "refresh_token_hash";
--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" RENAME COLUMN "code" TO "code_hash";
--> statement-breakpoint
ALTER TABLE "runs" RENAME COLUMN "share_token" TO "share_token_hash";
--> statement-breakpoint
ALTER TABLE "workflow_runs" RENAME COLUMN "share_token" TO "share_token_hash";
--> statement-breakpoint
-- 2. Hash existing plaintext tokens (if any exist that aren't already 64-char hex)
UPDATE "oauth_access_tokens"
SET "access_token_hash" = encode(digest("access_token_hash", 'sha256'), 'hex')
WHERE "access_token_hash" IS NOT NULL AND length("access_token_hash") <> 64;
--> statement-breakpoint
UPDATE "oauth_access_tokens"
SET "refresh_token_hash" = encode(digest("refresh_token_hash", 'sha256'), 'hex')
WHERE "refresh_token_hash" IS NOT NULL AND length("refresh_token_hash") <> 64;
--> statement-breakpoint
UPDATE "oauth_auth_codes"
SET "code_hash" = encode(digest("code_hash", 'sha256'), 'hex')
WHERE "code_hash" IS NOT NULL AND length("code_hash") <> 64;
--> statement-breakpoint
UPDATE "runs"
SET "share_token_hash" = encode(digest("share_token_hash", 'sha256'), 'hex')
WHERE "share_token_hash" IS NOT NULL AND length("share_token_hash") <> 64;
--> statement-breakpoint
UPDATE "workflow_runs"
SET "share_token_hash" = encode(digest("share_token_hash", 'sha256'), 'hex')
WHERE "share_token_hash" IS NOT NULL AND length("share_token_hash") <> 64;
