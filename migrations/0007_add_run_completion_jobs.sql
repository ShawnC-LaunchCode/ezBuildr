CREATE TABLE IF NOT EXISTS "run_completion_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "kind" varchar(50) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" varchar(255),
  "lease_expires_at" timestamp with time zone,
  "last_error" varchar(4000),
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "run_completion_jobs_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "run_completion_jobs_max_attempts_check" CHECK ("max_attempts" > 0),
  CONSTRAINT "run_completion_jobs_status_check" CHECK ("status" IN ('pending', 'processing', 'retry', 'succeeded', 'dead_letter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "run_completion_jobs_run_kind_unique"
  ON "run_completion_jobs" ("run_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_completion_jobs_claim_idx"
  ON "run_completion_jobs" ("status", "available_at", "lease_expires_at")
  WHERE "status" IN ('pending', 'retry', 'processing');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_completion_jobs_run_idx"
  ON "run_completion_jobs" ("run_id");
