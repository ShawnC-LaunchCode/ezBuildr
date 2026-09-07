ALTER TABLE "workflow_runs" ADD COLUMN "execution_mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "preview_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "preview_retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "preview_lease_owner" uuid;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "preview_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "preview_artifacts" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "workflow_runs_preview_expiry_idx" ON "workflow_runs" USING btree ("preview_expires_at") WHERE "workflow_runs"."execution_mode" = 'preview';--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_execution_mode_check" CHECK ("workflow_runs"."execution_mode" IN ('live', 'preview'));--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_preview_identity_check" CHECK ("workflow_runs"."execution_mode" = 'live' OR ("workflow_runs"."preview_expires_at" IS NOT NULL AND "workflow_runs"."workflow_version_id" IS NOT NULL AND "workflow_runs"."created_by" IS NOT NULL));